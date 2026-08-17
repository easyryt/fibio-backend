import request from "supertest";
import app from "../app.js";
import Customer from "../models/customer/customer.model.js";
import Product from "../models/admin/product.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import Cart from "../models/customer/cart.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CUSTOMER = {
  name: "Test Customer",
  email: "customer@test.com",
  password: "Test1234!",
};

let customerToken;
let variantId;
let variantWithLowStockId;

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
  // Register + login customer
  const regRes = await request(app)
    .post("/api/customers/auth/register")
    .send(CUSTOMER);
  customerToken = regRes.body.data.accessToken;

  // Create a product and two variants
  const category = await Category.create({ name: "Clothing", slug: "clothing" });
  const brand = await Brand.create({ name: "Nike", slug: "nike" });

  const product = await Product.create({
    name: "Test Shirt",
    slug: "test-shirt",
    category: category._id,
    brand: brand._id,
    status: "active",
  });

  const variant = await ProductVariant.create({
    product: product._id,
    sku: "SHIRT-001",
    price: 299,
    stock: 10,
  });
  variantId = variant._id.toString();

  const lowStockVariant = await ProductVariant.create({
    product: product._id,
    sku: "SHIRT-002",
    price: 199,
    stock: 2,
  });
  variantWithLowStockId = lowStockVariant._id.toString();
});

// ─── GET /api/customers/cart ──────────────────────────────────────────────────

describe("GET /api/customers/cart", () => {
  it("creates and returns an empty cart if none exists", async () => {
    const res = await request(app)
      .get("/api/customers/cart")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/customers/cart");
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/customers/cart/items ──────────────────────────────────────────

describe("POST /api/customers/cart/items", () => {
  it("adds a new item to the cart", async () => {
    const res = await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
  });

  it("increments quantity when the same variant is added again", async () => {
    // Add once
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 3 });

    // Add again
    const res = await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(5); // 3 + 2
  });

  it("clamps quantity to available stock when request exceeds stock", async () => {
    // variant has stock: 2, request asks for 10
    const res = await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: variantWithLowStockId, quantity: 10 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(2); // clamped to stock
    expect(res.body.message).toMatch(/2 in stock/i); // message informs of clamping
  });

  it("clamps when combining existing + new quantity exceeds stock", async () => {
    // Add 1 first
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: variantWithLowStockId, quantity: 1 });

    // Try to add 5 more (total 6, stock is 2)
    const res = await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: variantWithLowStockId, quantity: 5 });

    expect(res.body.data.items[0].quantity).toBe(2); // clamped to stock
  });

  it("rejects with 400 for an invalid variantId format", async () => {
    const res = await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: "not-an-id", quantity: 1 });

    expect(res.status).toBe(400);
  });
});

// ─── PUT /api/customers/cart/items/:variantId ─────────────────────────────────

describe("PUT /api/customers/cart/items/:variantId", () => {
  beforeEach(async () => {
    // Seed a cart item
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 3 });
  });

  it("sets quantity directly", async () => {
    const res = await request(app)
      .put(`/api/customers/cart/items/${variantId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quantity: 7 });

    expect(res.status).toBe(200);
    expect(res.body.data.items[0].quantity).toBe(7);
  });

  it("removes the item when quantity is set to 0", async () => {
    const res = await request(app)
      .put(`/api/customers/cart/items/${variantId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quantity: 0 });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });

  it("clamps quantity to stock", async () => {
    // variantWithLowStockId has stock: 2 — seed it in cart first
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: variantWithLowStockId, quantity: 1 });

    const res = await request(app)
      .put(`/api/customers/cart/items/${variantWithLowStockId}`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ quantity: 100 });

    expect(res.body.data.items.find(i => i.variant._id.toString() === variantWithLowStockId)?.quantity).toBe(2);
  });
});

// ─── DELETE /api/customers/cart/items/:variantId ──────────────────────────────

describe("DELETE /api/customers/cart/items/:variantId", () => {
  it("removes one line item", async () => {
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    const res = await request(app)
      .delete(`/api/customers/cart/items/${variantId}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

// ─── DELETE /api/customers/cart ───────────────────────────────────────────────

describe("DELETE /api/customers/cart", () => {
  it("empties the entire cart", async () => {
    // Add two items
    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId, quantity: 2 });

    await request(app)
      .post("/api/customers/cart/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ variantId: variantWithLowStockId, quantity: 1 });

    const res = await request(app)
      .delete("/api/customers/cart")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});
