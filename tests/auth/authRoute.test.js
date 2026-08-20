process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";

jest.mock("../../src/auth/googleVerify", () => ({
  verifyGoogleIdToken: jest.fn(),
}));

const request = require("supertest");
const app = require("../../src/app");
const pool = require("../../src/db/pool");
const { verifyGoogleIdToken } = require("../../src/auth/googleVerify");
const { signToken } = require("../../src/auth/jwt");
const { runMigrations } = require("../../src/db/migrate");

beforeAll(async () => {
  await runMigrations();
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("DELETE FROM users");
  jest.clearAllMocks();
});

describe("POST /auth/google", () => {
  test("creates a new user with role=null and returns a token", async () => {
    verifyGoogleIdToken.mockResolvedValue({
      google_id: "g-1",
      email: "new@example.com",
      name: "New Person",
    });

    const res = await request(app).post("/auth/google").send({ id_token: "fake-token" });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("new@example.com");
    expect(res.body.user.role).toBeNull();
    expect(typeof res.body.token).toBe("string");

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", ["new@example.com"]);
    expect(rows).toHaveLength(1);
  });

  test("returns the existing user (with their assigned role) on repeat login, without duplicating the row", async () => {
    await pool.query(
      "INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, $4)",
      ["g-2", "existing@example.com", "Existing Person", "accounts_team"]
    );
    verifyGoogleIdToken.mockResolvedValue({
      google_id: "g-2",
      email: "existing@example.com",
      name: "Existing Person",
    });

    const res = await request(app).post("/auth/google").send({ id_token: "fake-token" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("accounts_team");

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", ["existing@example.com"]);
    expect(rows).toHaveLength(1);
  });

  test("returns 401 when the Google token is invalid", async () => {
    verifyGoogleIdToken.mockRejectedValue(new Error("invalid token"));

    const res = await request(app).post("/auth/google").send({ id_token: "bad-token" });

    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  test("returns the current user when given a valid token", async () => {
    const inserted = await pool.query(
      "INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, $4) RETURNING id",
      ["g-3", "me@example.com", "Me Person", "salesperson"]
    );
    const token = signToken({ user_id: inserted.rows[0].id, email: "me@example.com", role: "salesperson" });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe("me@example.com");
    expect(res.body.role).toBe("salesperson");
  });

  test("returns 401 when no Authorization header is present", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });
});
