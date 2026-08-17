import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let adminToken;

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
});

describe("GET /api/dashboard/stats", () => {
  it("returns zero counts when nothing exists", async () => {
    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.totalProducts).toBe(0);
    expect(res.body.data.totalCategories).toBe(0);
    expect(res.body.data.totalBrands).toBe(0);
  });

  it("reflects real counts and flags low stock items", async () => {
    const category = await Category.create({ name: "Clothing", slug: "clothing" });
    const brand = await Brand.create({ name: "Nike", slug: "nike" });

    await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        name: "Low Stock Item",
        category: category._id.toString(),
        brand: brand._id.toString(),
        variants: [{ sku: "LOW-001", price: 10, stock: 3 }],
      });

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.totalProducts).toBe(1);
    expect(res.body.data.lowStock.count).toBe(1);
    expect(res.body.data.lowStock.items[0].sku).toBe("LOW-001");
  });

  it("logs and returns the create-brand activity", async () => {
    await request(app)
      .post("/api/brands")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Adidas" });

    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.body.data.latestActivity.length).toBeGreaterThan(0);
    expect(res.body.data.latestActivity[0].description).toMatch(/Created brand/);
  });

  it("returns empty recentImports and null csvImportStatus when none exist", async () => {
    const res = await request(app)
      .get("/api/dashboard/stats")
      .set("Authorization", `Bearer ${adminToken}`);

    // field is 'recentImports' in the controller response (not 'recentUploads')
    expect(res.body.data.recentImports).toEqual([]);
    expect(res.body.data.csvImportStatus).toBeNull();
  });
});