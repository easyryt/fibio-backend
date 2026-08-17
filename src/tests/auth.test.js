import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

describe("POST /api/auth/register", () => {
  let superAdminToken;

  beforeEach(async () => {
    // seed a super admin directly via the model, bypassing the API
    const admin = await User.create({
      name: "Super Admin",
      email: "super@test.com",
      password: "Test1234!",
      role: "super_admin",
    });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "super@test.com", password: "Test1234!" });

    superAdminToken = loginRes.body.data.accessToken;
  });

  it("rejects registration with no token", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Test", email: "test@test.com", password: "Test1234!" });

    expect(res.status).toBe(401);
  });

  it("rejects registration from a non-super_admin token", async () => {
    const staffLogin = await User.create({
      name: "Staff User",
      email: "staff@test.com",
      password: "Test1234!",
      role: "staff",
    });

    const staffLoginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "staff@test.com", password: "Test1234!" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${staffLoginRes.body.data.accessToken}`)
      .send({ name: "Test", email: "test2@test.com", password: "Test1234!" });

    expect(res.status).toBe(403);
  });

  it("creates a user when authorized as super_admin", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "New Admin", email: "newadmin@test.com", password: "Test1234!", role: "admin" });

    expect(res.status).toBe(201);
    expect(res.body.data.email).toBe("newadmin@test.com");
  });

  it("rejects a duplicate email", async () => {
    await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "Dup", email: "dup@test.com", password: "Test1234!" });

    const res = await request(app)
      .post("/api/auth/register")
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "Dup2", email: "dup@test.com", password: "Test1234!" });

    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  beforeEach(async () => {
    await User.create({
      name: "Login Test",
      email: "login@test.com",
      password: "Test1234!",
      role: "staff",
    });
  });

  it("logs in with correct credentials", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.com", password: "Test1234!" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.headers["set-cookie"]).toBeDefined(); // refreshToken cookie
  });

  it("rejects wrong password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.com", password: "WrongPass" });

    expect(res.status).toBe(401);
  });

  it("rejects deactivated user", async () => {
    await User.findOneAndUpdate({ email: "login@test.com" }, { isActive: false });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "login@test.com", password: "Test1234!" });

    expect(res.status).toBe(403);
  });
});