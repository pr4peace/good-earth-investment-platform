const express = require("express");
const healthRouter = require("./routes/health");
const authRouter = require("./routes/auth");
const usersRouter = require("./routes/users");

const app = express();
app.use(express.json());
app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/users", usersRouter);

module.exports = app;
