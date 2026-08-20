# Foundation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the project skeleton — Express server, PostgreSQL connection, and the core schema (agreements, payouts, calendar_events, audit_trail) — as a tested, runnable foundation for the Investment Agreement Management System.

**Architecture:** A single Node.js/Express service (`src/`) backed by PostgreSQL via the `pg` driver. Schema is managed as plain SQL migration files run by a small custom runner (no ORM — PLAN.md calls for raw PostgreSQL). Tests use Jest + Supertest against a real local Postgres test database.

**Tech Stack:** Node.js, Express, `pg` (node-postgres), Jest, Supertest, dotenv.

## Global Constraints

- Data store: PostgreSQL, hosted on Railway in later deployment — locally, any reachable Postgres instance (PLAN.md:889).
- Backend framework: Express.js (PLAN.md:892).
- All money amounts stored/returned as numbers rounded to 2 decimals (PLAN.md:456).
- All dates/times assumed IST; no timezone conversion logic in this phase (PLAN.md:455, 989).
- Schema field names must match PLAN.md's data model exactly (PLAN.md:25-123) — later plans (forms, orchestration) depend on these exact names.
- No ORM; use raw SQL via `pg`.

---

## File Structure

```
package.json
.env.example
.gitignore
src/
  server.js              # Express app entry point, starts HTTP listener
  app.js                 # Express app definition (routes, middleware) — separated from server.js so tests can import without binding a port
  db/
    pool.js              # pg Pool instance, reads config from env
    migrate.js            # Migration runner: applies pending .sql files in order
    migrations/
      001_create_agreements.sql
      002_create_payouts.sql
      003_create_calendar_events.sql
      004_create_audit_trail.sql
  routes/
    health.js             # GET /health (liveness), GET /health/db (readiness incl. DB check)
tests/
  health.test.js
  db/
    pool.test.js
    migrate.test.js
```

---

### Task 1: Project scaffolding (package.json, env, gitignore)

**Files:**
- Create: `package.json`
- Create: `.env.example`
- Create: `.gitignore`
- Create: `jest.config.js`

**Interfaces:**
- Produces: npm scripts `start`, `dev`, `test`, `migrate` that later tasks and CI rely on by name.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "investment-agreement-platform",
  "version": "0.1.0",
  "private": true,
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "migrate": "node src/db/migrate.js",
    "test": "NODE_ENV=test jest --runInBand"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "pg": "^8.12.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 2: Create `.env.example`**

```
PORT=3000
DATABASE_URL=postgres://localhost:5432/investment_platform
TEST_DATABASE_URL=postgres://localhost:5432/investment_platform_test
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.env
*.log
```

- [ ] **Step 4: Create `jest.config.js`**

```js
module.exports = {
  testEnvironment: "node",
  testPathIgnorePatterns: ["/node_modules/"],
};
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 6: Commit**

```bash
git init
git add package.json package-lock.json .env.example .gitignore jest.config.js
git commit -m "chore: scaffold project with express, pg, jest"
```

---

### Task 2: Database connection pool

**Files:**
- Create: `src/db/pool.js`
- Test: `tests/db/pool.test.js`

**Interfaces:**
- Consumes: `process.env.DATABASE_URL` / `process.env.TEST_DATABASE_URL` (`TEST_DATABASE_URL` used when `NODE_ENV=test`).
- Produces: `module.exports = pool` — a `pg.Pool` instance with a `.query(text, params)` method, used by every later task that touches the DB.

**Preconditions:** A local Postgres server must be running and reachable, with both `investment_platform` and `investment_platform_test` databases created:

```bash
createdb investment_platform
createdb investment_platform_test
```

- [ ] **Step 1: Write the failing test**

```js
// tests/db/pool.test.js
const pool = require("../../src/db/pool");

afterAll(async () => {
  await pool.end();
});

test("pool connects and runs a trivial query", async () => {
  const result = await pool.query("SELECT 1 + 1 AS sum");
  expect(result.rows[0].sum).toBe(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/db/pool.test.js`
Expected: FAIL — `Cannot find module '../../src/db/pool'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/db/pool.js
require("dotenv").config();
const { Pool } = require("pg");

const connectionString =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_URL
    : process.env.DATABASE_URL;

const pool = new Pool({ connectionString });

module.exports = pool;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/db/pool.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/pool.js tests/db/pool.test.js
git commit -m "feat: add postgres connection pool"
```

---

### Task 3: Migration runner + core schema

**Files:**
- Create: `src/db/migrations/001_create_agreements.sql`
- Create: `src/db/migrations/002_create_payouts.sql`
- Create: `src/db/migrations/003_create_calendar_events.sql`
- Create: `src/db/migrations/004_create_audit_trail.sql`
- Create: `src/db/migrate.js`
- Test: `tests/db/migrate.test.js`

**Interfaces:**
- Consumes: `pool` from `src/db/pool.js` (Task 2).
- Produces: `module.exports = { runMigrations }` — `runMigrations()` returns a Promise resolving to `{ applied: string[] }` (filenames applied this run). Later tasks (routes, orchestration) rely on the resulting tables: `agreements`, `payouts`, `calendar_events`, `audit_trail`, and on a `schema_migrations(filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ)` bookkeeping table.

- [ ] **Step 1: Write the failing test**

```js
// tests/db/migrate.test.js
const pool = require("../../src/db/pool");
const { runMigrations } = require("../../src/db/migrate");

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await pool.query("DROP TABLE IF EXISTS agreements, payouts, calendar_events, audit_trail, schema_migrations CASCADE");
});

test("runMigrations creates all core tables and is idempotent", async () => {
  const first = await runMigrations();
  expect(first.applied).toEqual([
    "001_create_agreements.sql",
    "002_create_payouts.sql",
    "003_create_calendar_events.sql",
    "004_create_audit_trail.sql",
  ]);

  const tables = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
  );
  const names = tables.rows.map((r) => r.table_name).sort();
  expect(names).toEqual(
    ["agreements", "audit_trail", "calendar_events", "payouts", "schema_migrations"].sort()
  );

  const second = await runMigrations();
  expect(second.applied).toEqual([]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/db/migrate.test.js`
Expected: FAIL — `Cannot find module '../../src/db/migrate'`

- [ ] **Step 3: Write the migration SQL files**

```sql
-- src/db/migrations/001_create_agreements.sql
CREATE TABLE agreements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'expired', 'withdrawn')),

  agreement_number TEXT NOT NULL UNIQUE,
  agreement_date DATE NOT NULL,

  client_name TEXT NOT NULL,
  client_age INTEGER NOT NULL,
  client_pan TEXT NOT NULL,
  client_aadhar TEXT NOT NULL,
  client_address TEXT NOT NULL,
  client_relation_type TEXT NOT NULL CHECK (client_relation_type IN ('S/o', 'D/o', 'W/o')),
  client_relation_name TEXT NOT NULL,

  principal NUMERIC(14, 2) NOT NULL,
  rate_of_interest NUMERIC(5, 2) NOT NULL,
  tenure_years NUMERIC(4, 2) NOT NULL,
  lock_in_period_years NUMERIC(4, 2) NOT NULL,
  payout_frequency TEXT NOT NULL CHECK (payout_frequency IN ('monthly', 'quarterly', 'semi-annual', 'annual')),

  start_date DATE NOT NULL,
  end_date DATE NOT NULL,

  first_party_name TEXT NOT NULL DEFAULT 'M/s Good Earth Eco Projects',
  first_party_pan TEXT NOT NULL DEFAULT 'AAIFG8316P',
  first_party_office_address TEXT NOT NULL DEFAULT '',
  first_party_partner_name TEXT NOT NULL DEFAULT 'Parthasarathy S',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL,
  related_salesperson TEXT NOT NULL,

  tds_rate_override NUMERIC(5, 2),
  tds_last_filed_quarter TEXT,
  renewal_notice_sent BOOLEAN NOT NULL DEFAULT false,
  post_dated_check_number TEXT,
  post_dated_check_amount NUMERIC(14, 2),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT NOT NULL
);
```

```sql
-- src/db/migrations/002_create_payouts.sql
CREATE TABLE payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  payout_number INTEGER NOT NULL,
  amount NUMERIC(14, 2) NOT NULL,
  tds_amount NUMERIC(14, 2) NOT NULL,
  payout_date DATE NOT NULL,
  net_amount NUMERIC(14, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'on-hold')),
  paid_date DATE,
  UNIQUE (agreement_id, payout_number)
);
```

```sql
-- src/db/migrations/003_create_calendar_events.sql
CREATE TABLE calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  payout_number INTEGER,
  event_type TEXT NOT NULL CHECK (event_type IN ('interest_payout', 'tds_filing', 'renewal_check', 'agreement_expiry')),
  trigger_date DATE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC(14, 2),
  recipients JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'notified', 'completed')),
  notified_at TIMESTAMPTZ
);
```

```sql
-- src/db/migrations/004_create_audit_trail.sql
CREATE TABLE audit_trail (
  audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id UUID NOT NULL REFERENCES agreements(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN ('created', 'modified', 'status_changed', 'payout_paid', 'tds_filed')),
  changed_by TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  notes TEXT
);
```

- [ ] **Step 4: Write the migration runner**

```js
// src/db/migrate.js
const fs = require("fs");
const path = require("path");
const pool = require("./pool");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function runMigrations() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  await ensureMigrationsTable();

  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await pool.query("SELECT filename FROM schema_migrations");
  const already = new Set(rows.map((r) => r.filename));

  const applied = [];
  for (const file of files) {
    if (already.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    await pool.query("BEGIN");
    try {
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await pool.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await pool.query("ROLLBACK");
      throw err;
    }
  }
  return { applied };
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(({ applied }) => {
      console.log(`Applied ${applied.length} migration(s):`, applied);
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/db/migrate.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations src/db/migrate.js tests/db/migrate.test.js
git commit -m "feat: add migration runner and core schema (agreements, payouts, calendar_events, audit_trail)"
```

---

### Task 4: Express app skeleton with health endpoints

**Files:**
- Create: `src/app.js`
- Create: `src/server.js`
- Create: `src/routes/health.js`
- Test: `tests/health.test.js`

**Interfaces:**
- Consumes: `pool` from `src/db/pool.js` (Task 2).
- Produces: `module.exports = app` (Express instance, from `src/app.js`) for Supertest to import without binding a port. `src/server.js` calls `app.listen(process.env.PORT)`. Later route tasks (`src/routes/agreements.js`, etc.) will do `app.use("/agreements", agreementsRouter)` in `src/app.js`.

- [ ] **Step 1: Write the failing test**

```js
// tests/health.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `NODE_ENV=test npx jest tests/health.test.js`
Expected: FAIL — `Cannot find module '../src/app'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/routes/health.js
const express = require("express");
const pool = require("../db/pool");

const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "ok" });
});

router.get("/db", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

module.exports = router;
```

```js
// src/app.js
const express = require("express");
const healthRouter = require("./routes/health");

const app = express();
app.use(express.json());
app.use("/health", healthRouter);

module.exports = app;
```

```js
// src/server.js
require("dotenv").config();
const app = require("./app");

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `NODE_ENV=test npx jest tests/health.test.js`
Expected: PASS

- [ ] **Step 5: Manually verify the server boots**

Run: `npm run migrate && npm start`
Expected: Console prints `Server listening on port 3000`; `curl localhost:3000/health` returns `{"status":"ok"}`; `curl localhost:3000/health/db` returns `{"status":"ok","db":"connected"}`. Stop with Ctrl+C.

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/server.js src/routes/health.js tests/health.test.js
git commit -m "feat: add express app skeleton with health and db-readiness endpoints"
```

---

## Self-Review Notes

- **Spec coverage:** This plan covers PLAN.md's Week 1 items 1–2 (PostgreSQL schema + Railway-compatible connection setup, Express backend scaffold, core tables). It deliberately excludes Google OAuth, the agreement form, and the payout generator (PLAN.md Week 1 items 3–4) — those need their own plans since they depend on this foundation existing and tested first, and each is a large enough subsystem to warrant separate review gates.
- **Field-name fidelity:** All column names in the migrations were checked against PLAN.md's Agreement/Payout Schedule/Calendar Event/Audit Trail JSON shapes (PLAN.md:25-123, 709-734) plus the two resolved decisions (`tds_rate_override`, weekend-shift handled in the payout-generation task, not schema).
- **No placeholders:** every step has runnable code and an exact command with expected output.
