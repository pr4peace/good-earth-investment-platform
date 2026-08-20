const request = require("supertest");
const app = require("../src/app");
const pool = require("../src/db/pool");

afterAll(async () => {
  await pool.end();
});

test("GET /health returns liveness ok", async () => {
  const res = await request(app).get("/health");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: "ok" });
});

test("GET /health/db returns db readiness ok", async () => {
  const res = await request(app).get("/health/db");
  expect(res.status).toBe(200);
  expect(res.body).toEqual({ status: "ok", db: "connected" });
});
