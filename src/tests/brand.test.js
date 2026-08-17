import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
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
});

describe("POST /api/brands", () => {
  it("creates a brand with a valid token", async () => {
    const res = await request(app)
      .post("/api/brands")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Nike" });

    expect(res.status).toBe(201);
    expect(res.body.data.slug).toBe("nike");
  });

  it("rejects duplicate brand name", async () => {
    await Brand.create({ name: "Nike", slug: "nike" });

    const res = await request(app)
      .post("/api/brands")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Nike" });

    expect(res.status).not.toBe(201);
  });

  it("rejects with no token", async () => {
    const res = await request(app).post("/api/brands").send({ name: "Adidas" });
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/brands/:id", () => {
  it("blocks deletion when a product references the brand", async () => {
    // TODO: create Category + Brand + Product referencing that brand,
    // then attempt delete, expect 400
  });

  it("deletes an unused brand", async () => {
    const brand = await Brand.create({ name: "Puma", slug: "puma" });

    const res = await request(app)
      .delete(`/api/brands/${brand._id}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });
});