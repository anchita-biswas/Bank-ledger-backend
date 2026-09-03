const express = require("express");
const authController = require("../controllers/auth.controller");
const authMiddleware = require("../middleware/auth.middleware");

const router = express.Router();

/* POST /api/auth/register */
router.post("/register", authController.userRegisterController);

/* POST /api/auth/login */
router.post("/login", authController.userLoginController);

/* POST /api/auth/logout */
router.post("/logout", authController.userLogoutController);

/**
 * - GET /api/auth/me
 * - Protected Route
 * - Used by the frontend to restore a session on page load.
 */
router.get(
  "/me",
  authMiddleware.authMiddleware,
  authController.getCurrentUserController,
);

module.exports = router;
