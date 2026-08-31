import express from "express";
import rateLimit from "express-rate-limit";
import { register, login, logout, refresh } from "../../controllers/admin/auth.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "../../validations/admin/auth.validation.js";

const router = express.Router();

// Strict limiter for login/register — 10 attempts per 15-minute window.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { success: false, message: "Too many attempts, please try again later" },
});

// Industry-standard limiter for refresh — 60 per 15-minute window (4/min).
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { success: false, message: "Too many refresh requests, please try again later" },
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Staff/Admin/Super Admin)
 * @access  Private (super_admin only)
 */
router.post("/register", authLimiter, authenticate, authorize("super_admin"), validate(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Log in and receive an access token + refresh token cookie
 * @access  Public
 */
router.post("/login", authLimiter, validate(loginSchema), login);

/**
 * @route   POST /api/auth/logout
 * @desc    Revoke the refresh token and clear the cookie
 * @access  Public (requires valid refresh cookie)
 */
router.post("/logout", logout);

/**
 * @route   POST /api/auth/refresh
 * @desc    Exchange a valid refresh token cookie for a new access token
 * @access  Public (requires valid refresh cookie)
 */
router.post("/refresh", refreshLimiter, refresh);

export default router;
