process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";

const request = require("supertest");
const app = require("../../src/app");
const pool = require("../../src/db/pool");
const { runMigrations } = require("../../src/db/migrate");
const { signToken } = require("../../src/auth/jwt");

let adminId, targetId;

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM users");

  const admin = await pool.query(
    "INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, $4) RETURNING id",
    ["g-admin", "admin@example.com", "Admin Person", "admin"]
  );
  adminId = admin.rows[0].id;

  const target = await pool.query(
    "INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING id",
    ["g-target", "target@example.com", "Target Person"]
  );
  targetId = target.rows[0].id;
});

test("an admin can assign a role to a pending user", async () => {
  const adminToken = signToken({ user_id: adminId, email: "admin@example.com", role: "admin" });

  const res = await request(app)
    .patch(`/users/${targetId}/role`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "salesperson" });

  expect(res.status).toBe(200);
  expect(res.body.role).toBe("salesperson");

  const { rows } = await pool.query("SELECT role FROM users WHERE id = $1", [targetId]);
  expect(rows[0].role).toBe("salesperson");
});

test("a non-admin cannot assign roles", async () => {
  const salespersonToken = signToken({ user_id: targetId, email: "target@example.com", role: null });

  const res = await request(app)
    .patch(`/users/${targetId}/role`)
    .set("Authorization", `Bearer ${salespersonToken}`)
    .send({ role: "salesperson" });

  expect(res.status).toBe(403);
});

test("rejects an invalid role value with 400", async () => {
  const adminToken = signToken({ user_id: adminId, email: "admin@example.com", role: "admin" });

  const res = await request(app)
    .patch(`/users/${targetId}/role`)
    .set("Authorization", `Bearer ${adminToken}`)
    .send({ role: "not_a_real_role" });

  expect(res.status).toBe(400);
});
