# Google OAuth + Role-Based Access Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user sign in with Google, get issued a JWT, and have every subsequent request authorized against one of four roles (Admin, Investment Manager, Salesperson, Accounts Team) — with new users landing in a "pending" (roleless) state until an Admin manually assigns a role.

**Architecture:** Frontend (not built in this plan) obtains a Google ID token via Google Identity Services and POSTs it to `/auth/google`. The backend verifies the ID token server-side with `google-auth-library`, upserts a `users` row keyed by `google_id`, and issues a signed JWT carrying `{ user_id, email, role }`. An Express middleware (`authenticate`) verifies that JWT on protected routes and attaches `req.user`; a second middleware (`requireRole(...roles)`) gates routes by role. A new user's `role` starts `NULL` ("pending") until an Admin assigns one — the very first Admin in a fresh deployment must be set directly via SQL (`UPDATE users SET role = 'admin' WHERE email = '...'`), since there's no bootstrapping route (matches the resolved decision: manual admin assignment, admin-panel UI deferred to Phase 2).

**Tech Stack:** Node.js, Express (existing `src/app.js`), `google-auth-library` (ID token verification), `jsonwebtoken` (JWT issuance/verification), existing `pg` pool, Jest + Supertest.

## Global Constraints

- Roles are exactly: `admin`, `investment_manager`, `salesperson`, `accounts_team` (PLAN.md:656-661 role table, lower-snake-case for storage).
- Role assignment is manual-by-admin only — no self-select, no auto-detect by email domain (resolved decision from this project's planning conversation).
- Auth mechanism: Google OAuth 2.0 sign-in, JWT session tokens (PLAN.md:664-666).
- No ORM; raw SQL via the existing `pg` pool (`src/db/pool.js`).
- All new schema changes are additive migrations under `src/db/migrations/`, following the existing numbered-file convention from the foundation scaffold (next number is `005`).
- Do not modify any file from the foundation scaffold plan except `src/app.js` (to mount new routers) and `package.json` (to add dependencies) — this plan only adds new files otherwise.

---

## File Structure

```
src/
  db/
    migrations/
      005_create_users.sql
  auth/
    jwt.js                 # signToken(payload), verifyToken(token) — thin wrapper over jsonwebtoken
    googleVerify.js         # verifyGoogleIdToken(idToken) — wraps google-auth-library, returns { google_id, email, name }
    middleware.js           # authenticate, requireRole(...roles)
  routes/
    auth.js                 # POST /auth/google, GET /auth/me
    users.js                # PATCH /users/:id/role (admin-only)
tests/
  auth/
    jwt.test.js
    middleware.test.js
    authRoute.test.js
    usersRoute.test.js
  db/
    migrate.test.js          # (existing file — extended, not replaced, to assert the users table appears)
```

---

### Task 1: `users` table migration

**Files:**
- Create: `src/db/migrations/005_create_users.sql`
- Modify: `tests/db/migrate.test.js` (extend the existing table-list assertion and `DROP TABLE` cleanup to include `users`)

**Interfaces:**
- Consumes: existing `runMigrations()` from `src/db/migrate.js` (foundation scaffold) — no change to its signature.
- Produces: a `users` table with columns `id UUID PRIMARY KEY`, `google_id TEXT UNIQUE NOT NULL`, `email TEXT UNIQUE NOT NULL`, `name TEXT NOT NULL`, `role TEXT NULL CHECK (role IN ('admin','investment_manager','salesperson','accounts_team'))`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`. Later tasks (Task 2 upsert, Task 4 role-assignment route) rely on these exact column names and the nullable `role`.

- [ ] **Step 1: Write the failing test — extend the existing migration test**

Open `tests/db/migrate.test.js` (from the foundation scaffold) and replace its body with:

```js
// tests/db/migrate.test.js
const pool = require("../../src/db/pool");
const { runMigrations } = require("../../src/db/migrate");

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query(
    "DROP TABLE IF EXISTS agreements, payouts, calendar_events, audit_trail, users, schema_migrations CASCADE"
  );
});

test("runMigrations creates all core tables and is idempotent", async () => {
  const first = await runMigrations();
  expect(first.applied).toEqual([
    "001_create_agreements.sql",
    "002_create_payouts.sql",
    "003_create_calendar_events.sql",
    "004_create_audit_trail.sql",
    "005_create_users.sql",
  ]);

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const names = tables.rows.map((r) => r.table_name).sort();
  expect(names).toEqual(
    ["agreements", "audit_trail", "calendar_events", "payouts", "users", "schema_migrations"].sort()
  );

  const second = await runMigrations();
  expect(second.applied).toEqual([]);
});

test("users.role accepts NULL and rejects invalid values", async () => {
  await runMigrations();

  const inserted = await pool.query(
    `INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING role`,
    ["g-123", "person@example.com", "Test Person"]
  );
  expect(inserted.rows[0].role).toBeNull();

  await expect(
    pool.query(
      `INSERT INTO users (google_id, email, name, role) VALUES ($1, $2, $3, $4)`,
      ["g-456", "other@example.com", "Other Person", "not_a_real_role"]
    )
  ).rejects.toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/db/migrate.test.js`
Expected: FAIL — `first.applied` won't include `005_create_users.sql` (file doesn't exist yet), and/or the `users` table won't exist for the second test.

- [ ] **Step 3: Write the migration SQL**

```sql
-- src/db/migrations/005_create_users.sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT CHECK (role IN ('admin', 'investment_manager', 'salesperson', 'accounts_team')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/db/migrate.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/migrations/005_create_users.sql tests/db/migrate.test.js
git commit -m "feat: add users table with nullable role for manual admin assignment"
```

---

### Task 2: JWT helper + Google ID token verification

**Files:**
- Create: `src/auth/jwt.js`
- Create: `src/auth/googleVerify.js`
- Test: `tests/auth/jwt.test.js`
- Modify: `package.json` (add `google-auth-library`, `jsonwebtoken`)
- Modify: `.env.example` (add `GOOGLE_CLIENT_ID`, `JWT_SECRET`)

**Interfaces:**
- Produces: `src/auth/jwt.js` exports `{ signToken(payload), verifyToken(token) }` — `signToken` returns a string JWT (expires in 7 days), `verifyToken` returns the decoded payload object or throws. `src/auth/googleVerify.js` exports `{ verifyGoogleIdToken(idToken) }` — an async function returning `Promise<{ google_id: string, email: string, name: string }>`, throwing if the token is invalid. Task 3 (route) and Task 4 (middleware) both import these by these exact names.

- [ ] **Step 1: Add dependencies**

Edit `package.json`'s `dependencies` block to add:

```json
    "google-auth-library": "^9.14.1",
    "jsonwebtoken": "^9.0.2",
```

Run: `npm install`
Expected: exit code 0, `package-lock.json` updated.

- [ ] **Step 2: Add env vars to `.env.example`**

Append to `.env.example`:

```
GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
JWT_SECRET=replace-with-a-long-random-secret
```

- [ ] **Step 3: Write the failing test for `jwt.js`**

```js
// tests/auth/jwt.test.js
process.env.JWT_SECRET = "test-secret-do-not-use-in-prod";
const { signToken, verifyToken } = require("../../src/auth/jwt");

test("signToken produces a token verifyToken can decode back to the same payload", () => {
  const payload = { user_id: "abc-123", email: "person@example.com", role: "admin" };
  const token = signToken(payload);
  const decoded = verifyToken(token);

  expect(decoded.user_id).toBe(payload.user_id);
  expect(decoded.email).toBe(payload.email);
  expect(decoded.role).toBe(payload.role);
});

test("verifyToken throws on a tampered token", () => {
  const token = signToken({ user_id: "abc-123", email: "x@example.com", role: "admin" });
  const tampered = token.slice(0, -2) + "zz";

  expect(() => verifyToken(tampered)).toThrow();
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/auth/jwt.test.js`
Expected: FAIL — `Cannot find module '../../src/auth/jwt'`

- [ ] **Step 5: Write `src/auth/jwt.js`**

```js
// src/auth/jwt.js
const jwt = require("jsonwebtoken");

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET environment variable is not set");
  }
  return secret;
}

function signToken(payload) {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}

function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

module.exports = { signToken, verifyToken };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/auth/jwt.test.js`
Expected: PASS

- [ ] **Step 7: Write `src/auth/googleVerify.js`** (no dedicated unit test here — it's a thin wrapper over `google-auth-library`, exercised indirectly by Task 3's route test via mocking)

```js
// src/auth/googleVerify.js
const { OAuth2Client } = require("google-auth-library");

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

async function verifyGoogleIdToken(idToken) {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  return {
    google_id: payload.sub,
    email: payload.email,
    name: payload.name,
  };
}

module.exports = { verifyGoogleIdToken };
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .env.example src/auth/jwt.js src/auth/googleVerify.js tests/auth/jwt.test.js
git commit -m "feat: add JWT signing/verification and Google ID token verification helpers"
```

---

### Task 3: `POST /auth/google` and `GET /auth/me` routes

**Files:**
- Create: `src/routes/auth.js`
- Modify: `src/app.js` (mount `authRouter` at `/auth`)
- Test: `tests/auth/authRoute.test.js`

**Interfaces:**
- Consumes: `verifyGoogleIdToken` (Task 2), `signToken`/`verifyToken` (Task 2), `pool` (`src/db/pool.js`, foundation scaffold).
- Produces: `module.exports = router` (Express Router) mounted at `/auth`. `POST /auth/google` accepts `{ id_token: string }`, returns `200 { token: string, user: { id, email, name, role } }` on success (role may be `null`), `401` on invalid Google token. `GET /auth/me` requires `Authorization: Bearer <jwt>`, returns `200 { id, email, name, role }` for the current user, `401` if missing/invalid token. Task 4's middleware will reuse the same `Authorization: Bearer` parsing convention established here.

- [ ] **Step 1: Write the failing test**

```js
// tests/auth/authRoute.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/auth/authRoute.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/auth'` (via `src/app.js` not yet mounting it) or 404s on `/auth/google`.

- [ ] **Step 3: Write `src/routes/auth.js`**

```js
// src/routes/auth.js
const express = require("express");
const pool = require("../db/pool");
const { verifyGoogleIdToken } = require("../auth/googleVerify");
const { signToken, verifyToken } = require("../auth/jwt");

const router = express.Router();

router.post("/google", async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) {
    return res.status(400).json({ error: "id_token is required" });
  }

  let profile;
  try {
    profile = await verifyGoogleIdToken(id_token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid Google ID token" });
  }

  const { rows: existingRows } = await pool.query(
    "SELECT id, email, name, role FROM users WHERE google_id = $1",
    [profile.google_id]
  );

  let user;
  if (existingRows.length > 0) {
    user = existingRows[0];
  } else {
    const { rows: insertedRows } = await pool.query(
      "INSERT INTO users (google_id, email, name) VALUES ($1, $2, $3) RETURNING id, email, name, role",
      [profile.google_id, profile.email, profile.name]
    );
    user = insertedRows[0];
  }

  const token = signToken({ user_id: user.id, email: user.email, role: user.role });
  res.json({ token, user });
});

router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { rows } = await pool.query(
    "SELECT id, email, name, role FROM users WHERE id = $1",
    [decoded.user_id]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "User no longer exists" });
  }

  res.json(rows[0]);
});

module.exports = router;
```

- [ ] **Step 4: Wire the router into `src/app.js`**

In `src/app.js` (from the foundation scaffold), add the import and mount alongside the existing health router:

```js
const authRouter = require("./routes/auth");
// ...
app.use("/auth", authRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/auth/authRoute.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/routes/auth.js src/app.js tests/auth/authRoute.test.js
git commit -m "feat: add POST /auth/google and GET /auth/me routes"
```

---

### Task 4: `authenticate` + `requireRole` middleware, and admin-only role assignment route

**Files:**
- Create: `src/auth/middleware.js`
- Create: `src/routes/users.js`
- Modify: `src/app.js` (mount `usersRouter` at `/users`)
- Test: `tests/auth/middleware.test.js`
- Test: `tests/auth/usersRoute.test.js`

**Interfaces:**
- Consumes: `verifyToken` (Task 2), `pool` (foundation scaffold).
- Produces: `src/auth/middleware.js` exports `{ authenticate, requireRole }`. `authenticate` is an Express middleware `(req, res, next)` that verifies the `Authorization: Bearer <jwt>` header (same convention as Task 3's `/auth/me`), re-fetches the user row from the DB (so a role change takes effect without waiting for token expiry), and sets `req.user = { id, email, name, role }`, else responds `401`. `requireRole(...roles)` returns an Express middleware that responds `403` if `req.user.role` is not in the given list (including when `role` is `null`) — it must run after `authenticate`. Later feature plans (agreements, payouts) will import `{ authenticate, requireRole }` from `src/auth/middleware.js` by these exact names to protect their routes, per the role table in PLAN.md:656-661.

- [ ] **Step 1: Write the failing test for the middleware**

```js
// tests/auth/middleware.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/auth/middleware.test.js`
Expected: FAIL — `Cannot find module '../../src/auth/middleware'`

- [ ] **Step 3: Write `src/auth/middleware.js`**

```js
// src/auth/middleware.js
const pool = require("../db/pool");
const { verifyToken } = require("./jwt");

async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const { rows } = await pool.query(
    "SELECT id, email, name, role FROM users WHERE id = $1",
    [decoded.user_id]
  );

  if (rows.length === 0) {
    return res.status(401).json({ error: "User no longer exists" });
  }

  req.user = rows[0];
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient role for this action" });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/auth/middleware.test.js`
Expected: PASS

- [ ] **Step 5: Write the failing test for the admin-only role-assignment route**

```js
// tests/auth/usersRoute.test.js
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
```

- [ ] **Step 6: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/auth/usersRoute.test.js`
Expected: FAIL — `Cannot find module '../../src/routes/users'` / 404 on the route.

- [ ] **Step 7: Write `src/routes/users.js`**

```js
// src/routes/users.js
const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../auth/middleware");

const VALID_ROLES = ["admin", "investment_manager", "salesperson", "accounts_team"];

const router = express.Router();

router.patch("/:id/role", authenticate, requireRole("admin"), async (req, res) => {
  const { role } = req.body;

  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
  }

  const { rows } = await pool.query(
    "UPDATE users SET role = $1, updated_at = now() WHERE id = $2 RETURNING id, email, name, role",
    [role, req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }

  res.json(rows[0]);
});

module.exports = router;
```

- [ ] **Step 8: Wire the router into `src/app.js`**

```js
const usersRouter = require("./routes/users");
// ...
app.use("/users", usersRouter);
```

- [ ] **Step 9: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/auth/usersRoute.test.js`
Expected: PASS

- [ ] **Step 10: Run the full suite to confirm no regressions**

Run: `NODE_ENV=test npm test`
Expected: all suites PASS (foundation scaffold's `health.test.js`, `pool.test.js`, `migrate.test.js`, plus this plan's `jwt.test.js`, `authRoute.test.js`, `middleware.test.js`, `usersRoute.test.js`).

- [ ] **Step 11: Commit**

```bash
git add src/auth/middleware.js src/routes/users.js src/app.js tests/auth/middleware.test.js tests/auth/usersRoute.test.js
git commit -m "feat: add authenticate/requireRole middleware and admin-only role assignment route"
```

---

## Self-Review Notes

- **Spec coverage:** Implements PLAN.md's Authentication & Authorization section (PLAN.md:652-666) in full for Phase 1: Google OAuth 2.0 sign-in, JWT tokens, and the four-role model. The admin panel UI for role assignment is explicitly Phase 2 per PLAN.md:665 and this project's resolved decision — Task 4 provides the API endpoint an admin panel would call, plus the documented SQL fallback for bootstrapping the very first Admin.
- **Placeholder scan:** No TBDs; every step has runnable code and an exact test command.
- **Type/name consistency:** `req.user.role`, `signToken`/`verifyToken` payload shape (`user_id`, `email`, `role`), and `authenticate`/`requireRole` names are used identically across Tasks 3 and 4 — checked against each task's Interfaces block.
- **Known follow-up (not in this plan):** JWTs are stateless — revoking a compromised token before its 7-day expiry isn't possible yet (no blocklist/refresh-token rotation). Acceptable for Phase 1 per PLAN.md's session management note (PLAN.md:666); flag for a later hardening pass if this becomes a real requirement.
