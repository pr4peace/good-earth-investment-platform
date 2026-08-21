const express = require("express");
const path = require("path");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");

const app = express();
app.use(express.json());

// Serve static files from public folder if it exists
app.use(express.static(path.join(__dirname, "public")));

// Root route
app.get("/", (req, res) => {
  res.json({
    message: "Good Earth Investment Platform API",
    version: "1.0.0",
    endpoints: {
      health: "/health",
      auth: "/auth",
      users: "/users"
    }
  });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
