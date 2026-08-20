process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";

const express = require("express");
const request = require("supertest");
const pool = require("../../src/db/pool");
const { runMigrations } = require("../../src/db/migrate");
const { signToken } = require("../../src/auth/jwt");
const { authenticate, requireRole } = require("../../src/auth/middleware");

let testApp;
let adminId, pendingId;

beforeAll(async () => {
  await runMigrations();
  await pool.query("DELETE FROM users");

  const admin = await pool.query(
    "INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["g-admin", "admin@example.com", "Admin Person", "admin"]
  );
  adminId = admin.rows[0].id;

  const pending = await pool.query(
    "INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING id",
    ["g-pending", "pending@example.com", "Pending Person"]
  );
  pendingId = pending.rows[0].id;

  testApp = express();
  testApp.get("/protected", authenticate, requireRole("admin"), (req, res) => {
    res.json({ ok: true, user: req.user });
  });
  testApp.get("/any-authenticated", authenticate, (req, res) => {
    res.json({ ok: true });
  });
});

afterAll(async () => {
  await pool.end();
});

test("authenticate + requireRole allows an admin through", async () => {
  const token = signToken({ user_id: adminId, email: "admin@example.com", role: "admin" });
  const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(200);
  expect(res.body.user.role).toBe("admin");
});

test("requireRole blocks a pending (roleless) user with 403", async () => {
  const token = signToken({ user_id: pendingId, email: "pending@example.com", role: null });
  const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${token}`);
  expect(res.status).toBe(403);
});

test("authenticate rejects a missing token with 401", async () => {
  const res = await request(testApp).get("/any-authenticated");
  expect(res.status).toBe(401);
});

test("authenticate re-fetches the role from the DB rather than trusting a stale token", async () => {
  const staleToken = signToken({ user_id: pendingId, email: "pending@example.com", role: "admin" });
  await pool.query("UPDATE users SET role = NULL WHERE id = $1", [pendingId]);

  const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${staleToken}`);
  expect(res.status).toBe(403);
});
