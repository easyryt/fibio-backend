import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerCustomer,
  loginCustomer,
  refreshCustomer,
  logoutCustomer,
  getMeCustomer,
} from "../../controllers/customer/customerAuth.controller.js";
import { authenticateCustomer } from "../../middleware/authenticateCustomer.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  registerCustomerSchema,
  loginCustomerSchema,
} from "../../validations/customer/customerAuth.validation.js";

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

// Lighter limiter for refresh — 30 per 15-minute window.
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { success: false, message: "Too many refresh requests, please try again later" },
});

/**
 * @route   POST /api/customers/auth/register
 * @desc    Register a new customer and immediately log them in
 * @access  Public
 */
router.post("/register", authLimiter, validate(registerCustomerSchema), registerCustomer);

/**
 * @route   POST /api/customers/auth/login
 * @desc    Log in and receive an access token + customerRefreshToken cookie
 * @access  Public
 */
router.post("/login", authLimiter, validate(loginCustomerSchema), loginCustomer);

/**
 * @route   POST /api/customers/auth/refresh
 * @desc    Exchange a valid customerRefreshToken cookie for a new access token
 * @access  Public (requires valid customerRefreshToken cookie)
 */
router.post("/refresh", refreshLimiter, refreshCustomer);

/**
 * @route   POST /api/customers/auth/logout
 * @desc    Revoke the customerRefreshToken and clear the cookie
 * @access  Public (requires valid customerRefreshToken cookie)
 */
router.post("/logout", logoutCustomer);

/**
 * @route   GET /api/customers/auth/me
 * @desc    Return the authenticated customer's profile
 * @access  Private (authenticateCustomer)
 */
router.get("/me", authenticateCustomer, getMeCustomer);

export default router;

