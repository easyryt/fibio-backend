import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import Product from "../models/admin/product.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let adminToken;
let productId;

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

  const product = await Product.create({
    name: "T-Shirt",
    slug: "t-shirt",
    category: category._id,
    brand: brand._id,
  });
  productId = product._id.toString();

  await ProductVariant.create({
    product: productId,
    sku: "TS-SM-RED",
    price: 20,
    stock: 15,
    options: [{ name: "Size", value: "Small" }],
  });
});

describe("POST /api/products/:productId/variants", () => {
  it("adds a variant to an existing product", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ sku: "TS-MD-RED", price: 22, stock: 10, options: [{ name: "Size", value: "Medium" }] });

    expect(res.status).toBe(201);
    expect(res.body.data.sku).toBe("TS-MD-RED");
  });

  it("rejects a duplicate SKU", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ sku: "TS-SM-RED", price: 22, stock: 10 });

    expect(res.status).not.toBe(201);
  });

  it("rejects salePrice greater than price", async () => {
    const res = await request(app)
      .post(`/api/products/${productId}/variants`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ sku: "TS-LG-RED", price: 20, salePrice: 30, stock: 5 });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/products/:productId/variants/:id", () => {
  it("blocks deleting the only remaining variant", async () => {
    const variant = await ProductVariant.findOne({ sku: "TS-SM-RED" });

    const res = await request(app)
      .delete(`/api/products/${productId}/variants/${variant._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });

  it("allows deleting a variant when others remain", async () => {
    const secondVariant = await ProductVariant.create({
      product: productId,
      sku: "TS-MD-RED",
      price: 22,
      stock: 10,
    });

    const res = await request(app)
      .delete(`/api/products/${productId}/variants/${secondVariant._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});