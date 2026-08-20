const express = require("express");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");

const app = express();
app.use(express.json());
app.use("/health", healthRouter);
app.use("/auth", authRouter);

module.exports = app;
