import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let adminToken;
let categoryId;
let brandId;

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
  await User.create({
    name: "Admin",
    email: "admin@test.com",
    password: "Test1234!",
    role: "admin",
  });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@test.com", password: "Test1234!" });

  adminToken = loginRes.body.data.accessToken;

  const category = await Category.create({ name: "Clothing", slug: "clothing" });
  const brand = await Brand.create({ name: "Nike", slug: "nike" });
  categoryId = category._id.toString();
  brandId = brand._id.toString();
});

describe("POST /api/products", () => {
  it("creates a product with one variant", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Red Cap",
        category: categoryId,
        brand: brandId,
        variants: [{ sku: "CAP-RED-001", price: 499, stock: 20 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.variants).toHaveLength(1);
  });

  it("rejects a product with zero variants", async () => {
    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Red Cap", category: categoryId, brand: brandId, variants: [] });

    expect(res.status).toBe(400);
  });

  it("rolls back the product if variant creation fails", async () => {
    // TODO: force a variant insert failure (e.g. duplicate SKU across two
    // variants in the same request) and confirm no Product document
    // was left behind afterward — this is the transaction test
  });
});

describe("DELETE /api/products/:id", () => {
  it("deletes a product and cascades to its variants", async () => {
    const createRes = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Red Cap",
        category: categoryId,
        brand: brandId,
        variants: [{ sku: "CAP-RED-001", price: 499, stock: 20 }],
      });

    const productId = createRes.body.data._id;

    await request(app)
      .delete(`/api/products/${productId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    const remainingVariants = await ProductVariant.find({ product: productId });
    expect(remainingVariants).toHaveLength(0);
  });
});