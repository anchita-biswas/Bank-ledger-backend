const mongoose = require("mongoose");

/**
 * - Stores JWTs that have been invalidated by an explicit logout.
 * - Documents self-expire after 3 days, which matches the token lifetime,
 *   so the collection never grows without bound.
 */
const tokenBlacklistSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: [true, "Token is required to blacklist"],
      unique: true,
    },
  },
  {
    timestamps: true,
  },
);

tokenBlacklistSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 3 },
);

const tokenBlackListModel = mongoose.model(
  "tokenBlackList",
  tokenBlacklistSchema,
);

module.exports = tokenBlackListModel;
