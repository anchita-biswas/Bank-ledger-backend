/**
 * app.js has mainly two roles:
 * 1. to start the server
 * 2. to configure the server
 */

const path = require("path");
const express = require("express");
const cookieParser = require("cookie-parser");

const app = express();

/** By default the express server cannot read the data from req.body its not that capable
 * So we use the middleware: express.json() to read the data
 */
app.use(express.json());
app.use(cookieParser());

/**
 * - Routes
 * - Any endpoints ending with /api/auth will be redirected to authRouter
 * - Any endpoints ending with /api/account will be redirected to accountRouter
 */
const authRouter = require("./routes/auth.routes");
const accountRouter = require("./routes/account.routes");
const transactionRoutes = require("./routes/transaction.routes");

/**
 * - Implementing the middleware for the routes
 * - Any endpoints ending with /api/auth will be redirected to authRouter and visa-versa
 * - The first argument is for authentication, the second will take user to their account details
 */
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions", transactionRoutes);

/**
 * - Liveness probe, used by Render to confirm the service is up.
 */
app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

/**
 * - The frontend is plain static files served by this same process, so there
 *   is a single origin, a single Render service and no CORS to configure.
 */
app.use(express.static(path.join(__dirname, "..", "public")));

/**
 * - Unmatched API routes must return JSON, never the frontend HTML.
 */
app.use("/api", (req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/**
 * - Central error handler.
 * - Express 5 forwards rejections from async handlers here automatically, so
 *   controllers do not need their own try/catch for unexpected failures.
 */
app.use((err, req, res, next) => {
  console.error(err);

  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: Object.values(err.errors)
        .map((e) => e.message)
        .join(", "),
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: "Duplicate value" });
  }

  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;
