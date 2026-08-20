const express = require("express");
const pool = require("../db/pool");
const { verifyGoogleIdToken } = require("../auth/googleVerify");
const { signToken, verifyToken } = require("../auth/jwt");
const { extractBearerToken } = require("../auth/extractBearerToken");
const { asyncHandler } = require("../utils/asyncHandler");

const router = express.Router();

router.post("/google", asyncHandler(async (req, res) => {
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

  const { rows } = await pool.query(
    `INSERT INTO users (google_id, email, name)
     VALUES ($1, $2, $3)
     ON CONFLICT (google_id) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name
     RETURNING id, email, name, role`,
    [profile.google_id, profile.email, profile.name]
  );
  const user = rows[0];

  const token = signToken({ user_id: user.id, email: user.email, role: user.role });
  res.json({ token, user });
}));

router.get("/me", asyncHandler(async (req, res) => {
  const token = extractBearerToken(req);

  if (!token) {
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
}));

module.exports = router;
