const userModel = require("../models/user.model");
const tokenBlackListModel = require("../models/blackList.model");
const jwt = require("jsonwebtoken");
const emailService = require("../services/email.service");

const TOKEN_TTL_DAYS = 3;

function issueToken(res, userId) {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: `${TOKEN_TTL_DAYS}d`,
  });

  res.cookie("token", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });

  return token;
}

/**
 * - user register controller
 * - POST /api/auth/register
 */
async function userRegisterController(req, res) {
  const { email, password, name } = req.body;

  if (!email || !password || !name) {
    return res.status(400).json({
      message: "Email, name and password are required",
      status: "Failed",
    });
  }

  const isExists = await userModel.findOne({ email });

  if (isExists) {
    return res.status(422).json({
      message: "User already exists with email",
      status: "Failed",
    });
  }

  const user = await userModel.create({ email, password, name });

  const token = issueToken(res, user._id);

  res.status(201).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
    },
    token,
  });

  /**
   * - Fired after the response so a mail outage never fails a registration.
   */
  emailService
    .sendRegistrationEmail(user.email, user.name)
    .catch((err) => console.error("Registration email failed:", err.message));
}

/**
 * - User login controller
 * - POST /api/auth/login
 */
async function userLoginController(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required" });
  }

  const user = await userModel.findOne({ email }).select("+password");

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const isValidPassword = await user.comparePassword(password);

  if (!isValidPassword) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  const token = issueToken(res, user._id);

  res.status(200).json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
    },
    token,
  });
}

/**
 * - User logout controller
 * - POST /api/auth/logout
 * - The token is added to the blacklist so it cannot be replayed before it
 *   naturally expires.
 */
async function userLogoutController(req, res) {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (token) {
    /**
     * - Ignore duplicates: logging out twice with the same token is harmless.
     */
    await tokenBlackListModel
      .create({ token })
      .catch(() => null);
  }

  res.clearCookie("token");

  res.status(200).json({ message: "User logged out successfully" });
}

/**
 * - Current user controller
 * - GET /api/auth/me
 * - Lets the frontend restore a session on page load without a re-login.
 */
async function getCurrentUserController(req, res) {
  res.status(200).json({
    user: {
      _id: req.user._id,
      email: req.user.email,
      name: req.user.name,
    },
  });
}

module.exports = {
  userRegisterController,
  userLoginController,
  userLogoutController,
  getCurrentUserController,
};
