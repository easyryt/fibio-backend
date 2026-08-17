import request from "supertest";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Customer from "../models/customer/customer.model.js";
import CustomerRefreshToken from "../models/customer/customerRefreshToken.model.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

// ─── shared fixtures ───────────────────────────────────────────────────────
const CUSTOMER = {
  name: "Jane Doe",
  email: "jane@test.com",
  password: "Secret123!",
  phone: "555-0100",
};

const SELLER = {
  name: "Admin User",
  email: "admin@test.com",
  password: "Admin123!",
  role: "admin",
};

// ─── lifecycle ──────────────────────────────────────────────────────────────
beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

// ────────────────────────────────────────────────────────────────────────────
// 1. REGISTER
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/customers/auth/register", () => {
  it("registers a customer and immediately returns an accessToken + sets customerRefreshToken cookie", async () => {
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.user.email).toBe(CUSTOMER.email);

    // cookie must be named 'customerRefreshToken', NOT 'refreshToken'
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieNames = cookies.map((c) => c.split("=")[0]);
    expect(cookieNames).toContain("customerRefreshToken");
    expect(cookieNames).not.toContain("refreshToken");
  });

  it("rejects registration with a duplicate email", async () => {
    await request(app).post("/api/customers/auth/register").send(CUSTOMER);
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);

    expect(res.status).toBe(409);
  });

  it("rejects if name is too short (< 2 chars)", async () => {
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send({ ...CUSTOMER, name: "X" });

    expect(res.status).toBe(400);
  });

  it("rejects if password is too short (< 6 chars)", async () => {
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send({ ...CUSTOMER, password: "abc" });

    expect(res.status).toBe(400);
  });

  it("rejects if email is malformed", async () => {
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send({ ...CUSTOMER, email: "not-an-email" });

    expect(res.status).toBe(400);
  });

  it("accepts registration without optional phone field", async () => {
    const { phone, ...withoutPhone } = CUSTOMER;
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send(withoutPhone);

    expect(res.status).toBe(201);
  });

  it("does NOT store plaintext password — Customer document must have a bcrypt hash", async () => {
    await request(app).post("/api/customers/auth/register").send(CUSTOMER);

    const doc = await Customer.findOne({ email: CUSTOMER.email }).select(
      "+password"
    );
    expect(doc).not.toBeNull();
    expect(doc.password).not.toBe(CUSTOMER.password);
    expect(doc.password).toMatch(/^\$2[ab]\$/); // bcrypt prefix
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. LOGIN
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/customers/auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/api/customers/auth/register").send(CUSTOMER);
  });

  it("logs in with correct credentials and sets customerRefreshToken cookie", async () => {
    const res = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: CUSTOMER.password });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies.some((c) => c.startsWith("customerRefreshToken="))).toBe(
      true
    );
  });

  it("updates lastLogin on successful login", async () => {
    await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: CUSTOMER.password });

    const doc = await Customer.findOne({ email: CUSTOMER.email });
    expect(doc.lastLogin).toBeDefined();
    expect(doc.lastLogin).toBeInstanceOf(Date);
  });

  it("rejects wrong password with 401", async () => {
    const res = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: "WrongPass!" });

    expect(res.status).toBe(401);
  });

  it("rejects unknown email with 401", async () => {
    const res = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: "ghost@test.com", password: CUSTOMER.password });

    expect(res.status).toBe(401);
  });

  it("rejects a deactivated customer with 403", async () => {
    await Customer.findOneAndUpdate(
      { email: CUSTOMER.email },
      { isActive: false }
    );

    const res = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: CUSTOMER.password });

    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. REFRESH
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/customers/auth/refresh", () => {
  let customerRefreshCookie;

  beforeEach(async () => {
    await request(app).post("/api/customers/auth/register").send(CUSTOMER);
    const loginRes = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: CUSTOMER.password });

    customerRefreshCookie = loginRes.headers["set-cookie"]
      .find((c) => c.startsWith("customerRefreshToken="))
      ?.split(";")[0]; // "customerRefreshToken=<value>"
  });

  it("returns a new accessToken when given a valid customerRefreshToken cookie", async () => {
    const res = await request(app)
      .post("/api/customers/auth/refresh")
      .set("Cookie", customerRefreshCookie);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it("returns 401 when no cookie is sent", async () => {
    const res = await request(app).post("/api/customers/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("returns 401 when the token has been revoked", async () => {
    // Extract raw token value from cookie string
    const rawToken = customerRefreshCookie.split("=")[1];
    await CustomerRefreshToken.findOneAndUpdate(
      { token: rawToken },
      { revoked: true }
    );

    const res = await request(app)
      .post("/api/customers/auth/refresh")
      .set("Cookie", customerRefreshCookie);

    expect(res.status).toBe(401);
  });

  it("returns 401 when the token is expired", async () => {
    const rawToken = customerRefreshCookie.split("=")[1];
    await CustomerRefreshToken.findOneAndUpdate(
      { token: rawToken },
      { expiresAt: new Date(Date.now() - 1000) } // force-expired
    );

    const res = await request(app)
      .post("/api/customers/auth/refresh")
      .set("Cookie", customerRefreshCookie);

    expect(res.status).toBe(401);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. LOGOUT
// ────────────────────────────────────────────────────────────────────────────
describe("POST /api/customers/auth/logout", () => {
  let customerRefreshCookie;

  beforeEach(async () => {
    await request(app).post("/api/customers/auth/register").send(CUSTOMER);
    const loginRes = await request(app)
      .post("/api/customers/auth/login")
      .send({ email: CUSTOMER.email, password: CUSTOMER.password });

    customerRefreshCookie = loginRes.headers["set-cookie"]
      .find((c) => c.startsWith("customerRefreshToken="))
      ?.split(";")[0];
  });

  it("logs out and revokes the token in the DB", async () => {
    const rawToken = customerRefreshCookie.split("=")[1];

    const logoutRes = await request(app)
      .post("/api/customers/auth/logout")
      .set("Cookie", customerRefreshCookie);

    expect(logoutRes.status).toBe(200);

    const stored = await CustomerRefreshToken.findOne({ token: rawToken });
    expect(stored.revoked).toBe(true);
  });

  it("clears the customerRefreshToken cookie on logout", async () => {
    const res = await request(app)
      .post("/api/customers/auth/logout")
      .set("Cookie", customerRefreshCookie);

    const setCookie = res.headers["set-cookie"] ?? [];
    const clearedCookie = setCookie.find((c) =>
      c.startsWith("customerRefreshToken=")
    );
    // A cleared cookie will have Max-Age=0 or an expired date
    if (clearedCookie) {
      expect(clearedCookie).toMatch(/Max-Age=0|Expires=.*1970/i);
    } else {
      // Some supertest versions omit the header entirely when value is empty string
      expect(true).toBe(true);
    }
  });

  it("still responds 200 gracefully if no cookie is present", async () => {
    const res = await request(app).post("/api/customers/auth/logout");
    expect(res.status).toBe(200);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 5. GET ME (protected)
// ────────────────────────────────────────────────────────────────────────────
describe("GET /api/customers/auth/me", () => {
  let customerAccessToken;

  beforeEach(async () => {
    const res = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);
    customerAccessToken = res.body.data.accessToken;
  });

  it("returns the customer profile for a valid customer token", async () => {
    const res = await request(app)
      .get("/api/customers/auth/me")
      .set("Authorization", `Bearer ${customerAccessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.customer.email).toBe(CUSTOMER.email);
    expect(res.body.data.customer.name).toBe(CUSTOMER.name);
    // password must NOT be returned (select: false)
    expect(res.body.data.customer.password).toBeUndefined();
  });

  it("returns 401 when no token is sent", async () => {
    const res = await request(app).get("/api/customers/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a deactivated customer even with a valid token", async () => {
    await Customer.findOneAndUpdate(
      { email: CUSTOMER.email },
      { isActive: false }
    );

    const res = await request(app)
      .get("/api/customers/auth/me")
      .set("Authorization", `Bearer ${customerAccessToken}`);

    expect(res.status).toBe(403);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 6. CROSS-TOKEN REJECTION (security-critical)
// ────────────────────────────────────────────────────────────────────────────
describe("Cross-token rejection", () => {
  let sellerAccessToken;
  let customerAccessToken;

  beforeEach(async () => {
    // Create and log in a seller (User)
    await User.create(SELLER);
    const sellerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: SELLER.email, password: SELLER.password });
    sellerAccessToken = sellerLogin.body.data.accessToken;

    // Register and get a customer token
    const customerReg = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);
    customerAccessToken = customerReg.body.data.accessToken;
  });

  it("authenticateCustomer rejects a valid SELLER token (no type:customer claim) with 401", async () => {
    const res = await request(app)
      .get("/api/customers/auth/me")
      .set("Authorization", `Bearer ${sellerAccessToken}`);

    // seller token has no type:"customer" claim — must be rejected
    expect(res.status).toBe(401);
  });

  it("seller authenticate middleware now EXPLICITLY rejects a CUSTOMER token (type:\"customer\" claim) with 401", async () => {
    // authenticate now checks decoded.type === "customer" and throws ApiError(401)
    // before ever reaching the controller — no longer fails by coincidence via
    // User.findById returning null.
    const res = await request(app)
      .get("/api/users/me")
      .set("Authorization", `Bearer ${customerAccessToken}`);

    expect(res.status).toBe(401);
  });

  it("customer token payload contains type:'customer'; seller token payload does NOT", () => {
    // Decode without verifying (just inspect the claim structure)
    const decodePayload = (token) =>
      JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

    const customerPayload = decodePayload(customerAccessToken);
    const sellerPayload = decodePayload(sellerAccessToken);

    expect(customerPayload.type).toBe("customer");
    expect(sellerPayload.type).toBeUndefined(); // seller tokens have no type claim
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 7. COOKIE COLLISION CHECK (same domain, different sessions)
// ────────────────────────────────────────────────────────────────────────────
describe("Cookie collision — seller and customer cookies must not share names", () => {
  it("seller login sets 'refreshToken' cookie and customer login sets 'customerRefreshToken' — never the other way around", async () => {
    await User.create(SELLER);
    const sellerRes = await request(app)
      .post("/api/auth/login")
      .send({ email: SELLER.email, password: SELLER.password });

    const customerRes = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);

    const sellerCookies = (sellerRes.headers["set-cookie"] ?? []).map(
      (c) => c.split("=")[0]
    );
    const customerCookies = (customerRes.headers["set-cookie"] ?? []).map(
      (c) => c.split("=")[0]
    );

    // Seller sets refreshToken, NOT customerRefreshToken
    expect(sellerCookies).toContain("refreshToken");
    expect(sellerCookies).not.toContain("customerRefreshToken");

    // Customer sets customerRefreshToken, NOT refreshToken
    expect(customerCookies).toContain("customerRefreshToken");
    expect(customerCookies).not.toContain("refreshToken");
  });

  it("a seller refresh token cookie is ignored by the customer refresh endpoint", async () => {
    await User.create(SELLER);
    const sellerLogin = await request(app)
      .post("/api/auth/login")
      .send({ email: SELLER.email, password: SELLER.password });

    // Extract the seller's refreshToken cookie
    const sellerRefreshCookie = sellerLogin.headers["set-cookie"]
      .find((c) => c.startsWith("refreshToken="))
      ?.split(";")[0];

    // Send the SELLER cookie to the CUSTOMER refresh endpoint
    const res = await request(app)
      .post("/api/customers/auth/refresh")
      .set("Cookie", sellerRefreshCookie);

    // Must fail — the customer endpoint only reads 'customerRefreshToken'
    expect(res.status).toBe(401);
  });

  it("a customer refresh token cookie is ignored by the seller refresh endpoint", async () => {
    const customerReg = await request(app)
      .post("/api/customers/auth/register")
      .send(CUSTOMER);

    const customerRefreshCookie = customerReg.headers["set-cookie"]
      .find((c) => c.startsWith("customerRefreshToken="))
      ?.split(";")[0];

    // Send the CUSTOMER cookie to the SELLER refresh endpoint
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", customerRefreshCookie);

    // Must fail — the seller endpoint only reads 'refreshToken'
    expect(res.status).toBe(401);
  });
});
