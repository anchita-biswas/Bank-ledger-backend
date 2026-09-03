const accountModel = require("../models/account.model");

// Create Account
async function createAccountController(req, res) {
  const { currency } = req.body;

  const account = await accountModel.create({
    user: req.user._id,
    ...(currency ? { currency } : {}),
  });

  res.status(201).json({ account });
}

/**
 * - Fetch every account owned by the logged-in user, with its derived balance.
 * - ponytail: balances are resolved one aggregate per account. A user holds a
 *   handful of accounts, so this is fine; batch into a single $group over all
 *   account ids if a user ever holds hundreds.
 */
async function getUserAccountsController(req, res) {
  const accounts = await accountModel.find({ user: req.user._id }).lean(false);

  const accountsWithBalance = await Promise.all(
    accounts.map(async (account) => ({
      _id: account._id,
      status: account.status,
      currency: account.currency,
      createdAt: account.createdAt,
      balance: await account.getBalance(),
    })),
  );

  res.status(200).json({ accounts: accountsWithBalance });
}

// Fetch account balance
async function getAccountBalanceController(req, res) {
  const { accountId } = req.params;

  const account = await accountModel.findOne({
    _id: accountId,
    user: req.user._id,
  });

  if (!account) {
    return res.status(404).json({ message: "Account not found" });
  }

  const balance = await account.getBalance();

  res.status(200).json({
    accountId: account._id,
    balance: balance,
    currency: account.currency,
  });
}

module.exports = {
  createAccountController,
  getUserAccountsController,
  getAccountBalanceController,
};
