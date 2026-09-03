const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const mongoose = require("mongoose");

/**
 * - Reject anything that is not a finite, strictly positive number.
 * - A zero or negative amount would let a caller invert the direction of a
 *   transfer, so this is a hard gate rather than a schema min alone.
 */
function isValidAmount(amount) {
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0;
}

/**
 * * - Create a new transaction
 * THE 10-STEP TRANSFER FLOW:
 * 1. Validate the request. (amount, fromAccount, toAccount)
 * 2. Validate idempotency key.
 * 3. Check account status.
 * 4. Derive sender balance from ledger.
 * 5. Create transaction with status PENDING.
 * 6. Create debit ledger entry for sender.
 * 7. Create credit ledger entry for receiver.
 * 8. Update transaction status to COMPLETED.
 * 9. Commit mongodb session.
 * 10. Send email notification to the sender.
 */
async function createTransaction(req, res) {
  /**
   * 1. Validate request
   */
  const { fromAccount, toAccount, amount, idempotencyKey } = req.body;

  if (!fromAccount || !toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message:
        "Missing required fields: fromAccount, toAccount, amount, idempotencyKey",
      status: "Failed",
    });
  }

  if (!isValidAmount(amount)) {
    return res.status(400).json({
      message: "Amount must be a positive number",
      status: "Failed",
    });
  }

  if (
    !mongoose.isValidObjectId(fromAccount) ||
    !mongoose.isValidObjectId(toAccount)
  ) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
      status: "Failed",
    });
  }

  if (String(fromAccount) === String(toAccount)) {
    return res.status(400).json({
      message: "Cannot transfer to the same account",
      status: "Failed",
    });
  }

  /**
   * - The sender account is looked up scoped to the authenticated user.
   * - Without that scope any logged-in user could debit any account by id.
   */
  const fromUserAccount = await accountModel.findOne({
    _id: fromAccount,
    user: req.user._id,
  });

  if (!fromUserAccount) {
    return res.status(403).json({
      message: "fromAccount does not belong to the authenticated user",
      status: "Failed",
    });
  }

  const toUserAccount = await accountModel.findOne({ _id: toAccount });

  if (!toUserAccount) {
    return res.status(400).json({
      message: "Invalid toAccount",
      status: "Failed",
    });
  }

  /**
   * 2. Validate idempotency key
   * - A retry of a request that already landed must return the original
   *   outcome instead of moving money a second time.
   */
  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  if (isTransactionAlreadyExists) {
    if (isTransactionAlreadyExists.status === "COMPLETED") {
      return res.status(200).json({
        message: "Transaction already processed",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists.status === "PENDING") {
      return res.status(200).json({
        message: "Transaction is still processing",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists.status === "FAILED") {
      return res.status(500).json({
        message: "Transaction processing failed, please retry with a new key",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists.status === "REVERSED") {
      return res.status(409).json({
        message: "Transaction was reversed",
        transaction: isTransactionAlreadyExists,
      });
    }
  }

  /**
   * 3. Check account status
   */
  if (fromUserAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
    return res.status(400).json({
      message:
        "Both fromAccount and toAccount must be ACTIVE to process transaction",
    });
  }

  /**
   * 4. Derive sender balance from ledger
   */
  const balance = await fromUserAccount.getBalance();

  if (balance < amount) {
    return res.status(400).json({
      message: `Insufficient balance. Current balance is ${balance}. Requested amount is ${amount}`,
    });
  }

  /**
   * 5 - 9. Everything below runs inside one mongodb transaction, so either
   * both ledger legs and the status update land, or none of them do.
   */
  let transaction;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      transaction = (
        await transactionModel.create(
          [
            {
              fromAccount,
              toAccount,
              amount,
              idempotencyKey,
              status: "PENDING",
            },
          ],
          { session },
        )
      )[0];

      await ledgerModel.create(
        [
          {
            account: fromAccount,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT",
          },
          {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT",
          },
        ],
        { session, ordered: true },
      );

      transaction.status = "COMPLETED";
      await transaction.save({ session });
    });
  } catch (error) {
    /**
     * - A duplicate idempotency key means a concurrent request won the race.
     * - The ledger was rolled back, so this is safe to surface as a conflict.
     */
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A transaction with this idempotency key is already in flight",
      });
    }

    console.error("Transfer failed:", error.message);

    return res.status(500).json({
      message: "Transaction could not be completed, please retry",
    });
  } finally {
    await session.endSession();
  }

  /**
   * 10. Send notification email
   * - Fired after the commit so a mail outage never rolls back money that
   *   has already moved.
   */
  emailService
    .sendTransactionEmail(req.user.email, req.user.name, amount, toAccount)
    .catch((err) => console.error("Transaction email failed:", err.message));

  return res.status(201).json({
    message: "Transaction completed successfully",
    transaction: transaction,
  });
}

/**
 * - Mint funds into a user account from the system account.
 * - Reachable only through authSystemUserMiddleware, so an ordinary session
 *   cannot create money.
 */
async function createInitialFundsTransaction(req, res) {
  const { toAccount, amount, idempotencyKey } = req.body;

  if (!toAccount || !amount || !idempotencyKey) {
    return res.status(400).json({
      message: "toAccount, amount and idempotencyKey are required",
    });
  }

  if (!isValidAmount(amount)) {
    return res
      .status(400)
      .json({ message: "Amount must be a positive number" });
  }

  if (!mongoose.isValidObjectId(toAccount)) {
    return res.status(400).json({ message: "Invalid toAccount" });
  }

  const toUserAccount = await accountModel.findOne({ _id: toAccount });

  if (!toUserAccount) {
    return res.status(400).json({ message: "Invalid toAccount" });
  }

  const fromUserAccount = await accountModel.findOne({ user: req.user._id });

  if (!fromUserAccount) {
    return res.status(400).json({ message: "System user account not found" });
  }

  if (String(fromUserAccount._id) === String(toUserAccount._id)) {
    return res
      .status(400)
      .json({ message: "Cannot fund the system account from itself" });
  }

  const existing = await transactionModel.findOne({ idempotencyKey });

  if (existing) {
    return res.status(200).json({
      message: "Transaction already processed",
      transaction: existing,
    });
  }

  let transaction;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      transaction = (
        await transactionModel.create(
          [
            {
              fromAccount: fromUserAccount._id,
              toAccount,
              amount,
              idempotencyKey,
              status: "PENDING",
            },
          ],
          { session },
        )
      )[0];

      await ledgerModel.create(
        [
          {
            account: fromUserAccount._id,
            amount: amount,
            transaction: transaction._id,
            type: "DEBIT",
          },
          {
            account: toAccount,
            amount: amount,
            transaction: transaction._id,
            type: "CREDIT",
          },
        ],
        { session, ordered: true },
      );

      transaction.status = "COMPLETED";
      await transaction.save({ session });
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A transaction with this idempotency key is already in flight",
      });
    }

    console.error("Initial funds transfer failed:", error.message);

    return res.status(500).json({
      message: "Transaction could not be completed, please retry",
    });
  } finally {
    await session.endSession();
  }

  return res.status(201).json({
    message: "Initial funds transaction completed successfully",
    transaction: transaction,
  });
}

/**
 * - Transaction history for the logged-in user.
 * - GET /api/transactions
 * - Returns every transaction touching one of the accounts owned by the
 *   caller, newest first, annotated with its direction relative to them.
 */
async function getUserTransactions(req, res) {
  const limit = Math.min(Number(req.query.limit) || 25, 100);

  const accounts = await accountModel
    .find({ user: req.user._id })
    .select("_id");

  const accountIds = accounts.map((account) => account._id);

  if (accountIds.length === 0) {
    return res.status(200).json({ transactions: [] });
  }

  const transactions = await transactionModel
    .find({
      $or: [
        { fromAccount: { $in: accountIds } },
        { toAccount: { $in: accountIds } },
      ],
    })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const ownedIds = new Set(accountIds.map(String));

  const annotated = transactions.map((transaction) => ({
    ...transaction,
    direction: ownedIds.has(String(transaction.fromAccount)) ? "OUT" : "IN",
  }));

  res.status(200).json({ transactions: annotated });
}

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
  getUserTransactions,
};
