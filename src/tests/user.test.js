import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import RefreshToken from "../models/admin/refreshToken.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let superAdminToken;
let superAdminId;
let staffUserId;

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
  const superAdmin = await User.create({
    name: "Super Admin",
    email: "super@test.com",
    password: "Test1234!",
    role: "super_admin",
  });
  superAdminId = superAdmin._id.toString();

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "super@test.com", password: "Test1234!" });

  superAdminToken = loginRes.body.data.accessToken;

  const staffUser = await User.create({
    name: "Staff User",
    email: "staff@test.com",
    password: "Test1234!",
    role: "staff",
  });
  staffUserId = staffUser._id.toString();
});

describe("GET /api/users", () => {
  it("lists users for super_admin", async () => {
    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by role", async () => {
    const res = await request(app)
      .get("/api/users?role=staff")
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.body.data.every((u) => u.role === "staff")).toBe(true);
  });

  it("rejects a non-super_admin token", async () => {
    const staffLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: "staff@test.com", password: "Test1234!" });

    const res = await request(app)
      .get("/api/users")
      .set("Authorization", `Bearer ${staffLogin.body.data.accessToken}`);

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/users/:id", () => {
  it("updates a user's role", async () => {
    const res = await request(app)
      .put(`/api/users/${staffUserId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ role: "admin" });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe("admin");
  });

  it("blocks a super_admin from changing their own role", async () => {
    const res = await request(app)
      .put(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ role: "staff" });

    expect(res.status).toBe(400);
  });

  it("blocks a super_admin from deactivating themselves", async () => {
    const res = await request(app)
      .put(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ isActive: false });

    expect(res.status).toBe(400);
  });

  it("allows a super_admin to update their own name", async () => {
    const res = await request(app)
      .put(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`)
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Updated Name");
  });
});

describe("DELETE /api/users/:id", () => {
  it("deletes a user and cleans up their refresh tokens", async () => {
    await request(app)
      .post("/api/auth/login")
      .send({ email: "staff@test.com", password: "Test1234!" });

    const res = await request(app)
      .delete(`/api/users/${staffUserId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);

    const remainingUser = await User.findById(staffUserId);
    expect(remainingUser).toBeNull();

    const remainingTokens = await RefreshToken.find({ user: staffUserId });
    expect(remainingTokens).toHaveLength(0);
  });

  it("blocks a super_admin from deleting themselves", async () => {
    const res = await request(app)
      .delete(`/api/users/${superAdminId}`)
      .set("Authorization", `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
  });
});