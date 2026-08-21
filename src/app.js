const express = require("express");
const path = require("path");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");

const app = express();
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, "public")));

// Root route
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

module.exports = app;
