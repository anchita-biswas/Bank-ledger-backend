const userModel = require("../models/user.model");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");

/**
 * - Shared auth core.
 * - Reads the token from the cookie or the Authorization header, rejects it if
 *   it has been blacklisted by a logout, verifies it and loads the user.
 * - `requireSystemUser` additionally gates the route to the system account,
 *   which is the only account allowed to mint funds out of thin air.
 */
async function authenticate(req, res, requireSystemUser) {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Unauthorized access, token is missing" });
    return false;
  }

  const isBlacklisted = await tokenBlackListModel.findOne({ token });

  if (isBlacklisted) {
    res.status(401).json({ message: "Unauthorized access, token is invalid" });
    return false;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    res.status(401).json({ message: "Unauthorized access, token is invalid" });
    return false;
  }

  const user = await userModel
    .findById(decoded.userId)
    .select(requireSystemUser ? "+systemUser" : "");

  if (!user) {
    res.status(401).json({ message: "Unauthorized access, user not found" });
    return false;
  }

  if (requireSystemUser && !user.systemUser) {
    res.status(403).json({ message: "Forbidden access, not a system user" });
    return false;
  }

  req.user = user;
  req.token = token;
  return true;
}

async function authMiddleware(req, res, next) {
  if (await authenticate(req, res, false)) {
    return next();
  }
}

async function authSystemUserMiddleware(req, res, next) {
  if (await authenticate(req, res, true)) {
    return next();
  }
}

module.exports = {
  authMiddleware,
  authSystemUserMiddleware,
};
