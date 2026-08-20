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
