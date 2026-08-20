const pool = require("../db/pool");
const { verifyToken } = require("./jwt");
const { extractBearerToken } = require("./extractBearerToken");
const { asyncHandler } = require("../utils/asyncHandler");

async function authenticate(req, res, next) {
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

module.exports = { authenticate: asyncHandler(authenticate), requireRole };
