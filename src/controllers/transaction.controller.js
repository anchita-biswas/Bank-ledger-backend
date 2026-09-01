const transactionModel = require("../models/transaction.model");
const ledgerModel = require("../models/ledger.model");
const accountModel = require("../models/account.model");
const emailService = require("../services/email.service");
const mongoose = require("mongoose");

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
 * 10. Send email notifications to both sender and receiver.
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

  const fromUserAccount = await accountModel.findOne({
    _id: fromAccount,
  });

  const toUserAccount = await accountModel.findOne({
    _id: toAccount,
  });

  if (!fromUserAccount || !toUserAccount) {
    return res.status(400).json({
      message: "Invalid fromAccount or toAccount",
      status: "Failed",
    });
  }

  /**
   * 2. Validate idempotency key
   */
  const isTransactionAlreadyExists = await transactionModel.findOne({
    idempotencyKey: idempotencyKey,
  });

  if (isTransactionAlreadyExists) {
    if (isTransactionAlreadyExists === "COMPLETED") {
      res.status(200).json({
        message: "Transaction already processed",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists === "PENDING") {
      res.status(200).json({
        message: "Transaction is still processing",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists === "FAILED") {
      res.status(500).json({
        message: "Transaction processing failed",
        transaction: isTransactionAlreadyExists,
      });
    }

    if (isTransactionAlreadyExists === "REVERSED") {
      res.status(500).json({
        message: "Transaction was reversed, please retry",
        transaction: isTransactionAlreadyExists,
      });
    }
  }

  /**
   * 3. Check account status
   */
  if (fromAccount.status !== "ACTIVE" || toUserAccount.status !== "ACTIVE") {
    return res.status(400).json({
      message:
        "Both fromAccount and toAccount must be Active to process transaction",
    });
  }

  /**
   * 4. Derive sender balance from ledger   *
   */
  const balance = await fromUserAccount.getBalance();

  if (balance < amount) {
    return res.status(400).json({
      message: `Insufficient balance. Current balance is ${balance}. Requested balance is ${amount}`,
    });
  }

  /**
   * 5. Create transaction (Pending)
   */

  // After this point of creating a mongodb transaction, either all steps will be completed or nothing will
  const session = await mongoose.startSession();
  session.startTransaction();

  const transaction = (await transactionModel.create(
    [{
      fromAccount,
      toAccount,
      amount,
      idempotencyKey,
      status: "PENDING",
    }],
    { session },
  ))[0];

  const debitLedgerEntry = await ledgerModel.create(
    [
      {
        account: fromAccount,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT",
      },
    ],
    { session },
  );

  const creditLedgerEntry = await ledgerModel.create(
    [
      {
        account: toAccount,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT",
      },
    ],
    { session },
  );

  transaction.status = "COMPLETED";
  await transaction.save({ session });

  await session.commitTransaction();
  session.endSession();

  /**
   * 10. Send verification email
   */
  await emailService.sendTransactionSuccessEmail(
    req.user.email,
    req.user.name,
    amount,
    toAccount,
  );

  return res.status(201).json({
    message: "Transaction completed successfully",
    transaction: transaction,
  });
}

async function createInitialFundsTransaction(req, res) {
  const { toAccount, amount, idempotencyKey } = req.body;

  if (!toAccount || !amount || !idempotencyKey) {
    return res.status(401).json({
      message: "toAccount, amount and idempotency key is required",
    });
  }

  const toUserAccount = await accountModel.findOne({
    _id: toAccount,
  });

  if (!toUserAccount) {
    return res.status(400).json({
      message: "Invalid toAccount",
    });
  }

  const fromUserAccount = await accountModel.findOne({
    // systemUser: true,
    user: req.user._id,
  });

  if (!fromUserAccount) {
    return res.status(400).json({
      message: "System user account not found",
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  const transaction = new transactionModel({
    fromAccount: fromUserAccount._id,
    toAccount,
    amount,
    idempotencyKey,
    status: "PENDING",
  });

  const debitLedgerEntry = await ledgerModel.create(
    [
      {
        account: fromUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "DEBIT",
      },
    ],
    { session },
  );

  const creditLedgerEntry = await ledgerModel.create(
    [
      {
        account: toUserAccount._id,
        amount: amount,
        transaction: transaction._id,
        type: "CREDIT",
      },
    ],
    { session },
  );

  transaction.status = "COMPLETED";
  await transaction.save({ session });

  await session.commitTransaction();
  session.endSession();

  return res.status(201).json({
    message: "Initial funds transaction completed successfully",
    transaction: transaction,
  });
}

module.exports = {
  createTransaction,
  createInitialFundsTransaction,
};
