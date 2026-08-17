import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import Product from "../models/admin/product.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let adminToken;
let variantId;

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await User.create({ name: "Admin", email: "admin@test.com", password: "Test1234!", role: "admin" });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@test.com", password: "Test1234!" });

  adminToken = loginRes.body.data.accessToken;

  const category = await Category.create({ name: "Clothing", slug: "clothing" });
  const brand = await Brand.create({ name: "Nike", slug: "nike" });

  const createRes = await request(app)
    .post("/api/products")
    .set("Authorization", `Bearer ${adminToken}`)
    .send({
      name: "Test Shirt",
      category: category._id.toString(),
      brand: brand._id.toString(),
      variants: [{ sku: "SHIRT-001", price: 20, stock: 10 }],
    });

  variantId = createRes.body.data.variants[0]._id;
});

describe("Product creation sets stock via ledger", () => {
  it("creates an initial movement matching the requested stock", async () => {
    const res = await request(app)
      .get(`/api/inventory/movements/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].type).toBe("initial");
    expect(res.body.data[0].newStock).toBe(10);
  });

  it("variant.stock matches the ledger total", async () => {
    const variant = await ProductVariant.findById(variantId);
    expect(variant.stock).toBe(10);
  });
});

describe("POST /api/inventory/movements", () => {
  it("restocks and increases stock", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "restock", quantity: 5, reason: "New shipment" });

    expect(res.status).toBe(201);
    expect(res.body.data.variant.stock).toBe(15);
    expect(res.body.data.movement.quantityChange).toBe(5);
  });

  it("records a sale and decreases stock", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "sale", quantity: 3 });

    expect(res.status).toBe(201);
    expect(res.body.data.variant.stock).toBe(7);
    expect(res.body.data.movement.quantityChange).toBe(-3);
  });

  it("rejects a sale that would take stock below 0", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "sale", quantity: 999 });

    expect(res.status).toBe(400);

    const variant = await ProductVariant.findById(variantId);
    expect(variant.stock).toBe(10); // unchanged
  });

  it("applies a signed correction directly", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "correction", quantity: -4, reason: "Recount discrepancy" });

    expect(res.status).toBe(201);
    expect(res.body.data.variant.stock).toBe(6);
  });

  it("rejects a non-correction movement with a negative or zero quantity", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "restock", quantity: -5 });

    expect(res.status).toBe(400);
  });

  it("rejects with no token", async () => {
    const res = await request(app)
      .post("/api/inventory/movements")
      .send({ variantId, type: "restock", quantity: 5 });

    expect(res.status).toBe(401);
  });
});

describe("GET /api/inventory/reconcile/:variantId", () => {
  it("computed stock matches variant.stock when no drift", async () => {
    await request(app)
      .post("/api/inventory/movements")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ variantId, type: "restock", quantity: 5 });

    const res = await request(app)
      .get(`/api/inventory/reconcile/${variantId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const variant = await ProductVariant.findById(variantId);
    expect(res.body.data.computedStock).toBe(variant.stock);
  });
});