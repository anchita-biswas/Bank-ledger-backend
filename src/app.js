/**
 * app.js has mainly two roles:
 * 1. to start the server
 * 2. to configure the server
 */

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
const transactionRoutes = require("./routes/transaction.routes")

// 
/**
 * - Implementing the middleware for the routes
 * - Any endpoints ending with /api/auth will be redirected to authRouter and visa-versa
 * - The first argument is for authentication, the second will take user to their account details
 */
app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions", transactionRoutes);


module.exports = app;
