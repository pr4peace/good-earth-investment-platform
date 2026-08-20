const pool = require("../../src/db/pool");

afterAll(async () => {
  await pool.end();
});

test("pool connects and runs a trivial query", async () => {
  const result = await pool.query("SELECT 1 + 1 AS sum");
  expect(result.rows[0].sum).toBe(2);
});
