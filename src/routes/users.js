const express = require("express");
const pool = require("../db/pool");
const { authenticate, requireRole } = require("../auth/middleware");
const { asyncHandler } = require("../utils/asyncHandler");

const VALID_ROLES = ["admin", "investment_manager", "salesperson", "accounts_team"];

const router = express.Router();

router.patch("/:id/role", authenticate, requireRole("admin"), asyncHandler(async (req, res) => {
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
}));

module.exports = router;
