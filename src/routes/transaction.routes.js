const { Router } = require("express");
const authMiddleware = require("../middleware/auth.middleware");
const transactionController = require("../controllers/transaction.controller");

const transactionRoutes = Router();

/**
 * - POST /api/transactions/
 * - Create new transaction
 */
transactionRoutes.post(
  "/",
  authMiddleware.authMiddleware,
  transactionController.createTransaction,
);

/**
 * - GET /api/transactions/
 * - Transaction history for the logged-in user
 */
transactionRoutes.get(
  "/",
  authMiddleware.authMiddleware,
  transactionController.getUserTransactions,
);

/**
 * - POST /api/transactions/system/initial-funds
 * - Create initial funds transaction from the system account
 */
transactionRoutes.post(
  "/system/initial-funds",
  authMiddleware.authSystemUserMiddleware,
  transactionController.createInitialFundsTransaction,
);

module.exports = transactionRoutes;
