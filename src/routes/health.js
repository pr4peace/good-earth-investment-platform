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
    console.error("Health check DB query failed:", err);
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

module.exports = router;
