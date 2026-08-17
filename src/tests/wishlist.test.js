import request from "supertest";
import app from "../app.js";
import Product from "../models/admin/product.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CUSTOMER = {
  name: "Test Customer",
  email: "customer@test.com",
  password: "Test1234!",
};

let customerToken;
let productId;
let archivedProductId;

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

  // Create products
  const category = await Category.create({ name: "Clothing", slug: "clothing" });
  const brand = await Brand.create({ name: "Nike", slug: "nike" });

  const product = await Product.create({
    name: "Active Product",
    slug: "active-product",
    category: category._id,
    brand: brand._id,
    status: "active",
  });
  productId = product._id.toString();

  const archivedProduct = await Product.create({
    name: "Archived Product",
    slug: "archived-product",
    category: category._id,
    brand: brand._id,
    status: "archived",
  });
  archivedProductId = archivedProduct._id.toString();
});

// ─── GET /api/customers/wishlist ──────────────────────────────────────────────

describe("GET /api/customers/wishlist", () => {
  it("creates and returns an empty wishlist if none exists", async () => {
    const res = await request(app)
      .get("/api/customers/wishlist")
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(0);
  });

  it("returns 401 without a token", async () => {
    const res = await request(app).get("/api/customers/wishlist");
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/customers/wishlist/items ───────────────────────────────────────

describe("POST /api/customers/wishlist/items", () => {
  it("adds an active product to the wishlist", async () => {
    const res = await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId });

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1);
    expect(res.body.data.products[0]._id.toString()).toBe(productId);
  });

  it("is idempotent — adding the same product twice does not duplicate it", async () => {
    await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId });

    const res = await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId });

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(1); // still just 1
  });

  it("rejects adding a non-active (archived) product", async () => {
    const res = await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId: archivedProductId });

    expect(res.status).toBe(400);
  });

  it("rejects an invalid productId format", async () => {
    const res = await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId: "not-an-id" });

    expect(res.status).toBe(400);
  });
});

// ─── DELETE /api/customers/wishlist/items/:productId ─────────────────────────

describe("DELETE /api/customers/wishlist/items/:productId", () => {
  it("removes a product from the wishlist", async () => {
    await request(app)
      .post("/api/customers/wishlist/items")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ productId });

    const res = await request(app)
      .delete(`/api/customers/wishlist/items/${productId}`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.products).toHaveLength(0);
  });

  it("is safe to call even when product is not in the wishlist", async () => {
    const res = await request(app)
      .delete(`/api/customers/wishlist/items/${productId}`)
      .set("Authorization", `Bearer ${customerToken}`);

    // Should return 404 because wishlist doesn't exist (no cart was ever created)
    expect(res.status).toBe(404);
  });
});
