import request from "supertest";
import app from "../app.js";

describe("CORS Origin Predicate", () => {
  const originalFrontendUrl = process.env.FRONTEND_URL;

  afterEach(() => {
    if (originalFrontendUrl !== undefined) {
      process.env.FRONTEND_URL = originalFrontendUrl;
    } else {
      delete process.env.FRONTEND_URL;
    }
  });

  test("fails closed when FRONTEND_URL is unset or empty", async () => {
    delete process.env.FRONTEND_URL;

    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("allows requests without Origin header (curl/mobile/same-origin)", async () => {
    delete process.env.FRONTEND_URL;

    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
  });

  test("allows exact match for explicitly configured single FRONTEND_URL with credentialed CORS", async () => {
    process.env.FRONTEND_URL = "http://localhost:3000/";

    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  test("normalizes trailing slashes on both FRONTEND_URL and Origin header", async () => {
    process.env.FRONTEND_URL = "https://app.example.com";

    const res = await request(app)
      .get("/health")
      .set("Origin", "https://app.example.com/");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("https://app.example.com/");
  });

  test("rejects unconfigured localhost origins (no broad localhost match)", async () => {
    process.env.FRONTEND_URL = "http://localhost:3000";

    const res = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("rejects random vercel.app domains (no broad .vercel.app match)", async () => {
    process.env.FRONTEND_URL = "https://my-app.vercel.app";

    const res = await request(app)
      .get("/health")
      .set("Origin", "https://malicious-app.vercel.app");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  test("allows multiple comma-separated configured origins", async () => {
    process.env.FRONTEND_URL = "http://localhost:3000, https://app.example.com";

    const res1 = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:3000");
    expect(res1.headers["access-control-allow-origin"]).toBe("http://localhost:3000");

    const res2 = await request(app)
      .get("/health")
      .set("Origin", "https://app.example.com");
    expect(res2.headers["access-control-allow-origin"]).toBe("https://app.example.com");
  });
});
