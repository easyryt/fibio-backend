import express from "express";
import { register, login, logout, refresh } from "../../controllers/admin/auth.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { registerSchema, loginSchema } from "../../validations/admin/auth.validation.js";

const router = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user (Staff/Admin/Super Admin)
 * @access  Private (super_admin only)
 */
router.post("/register", authenticate, authorize("super_admin"), validate(registerSchema), register);

/**
 * @route   POST /api/auth/login
 * @desc    Log in and receive an access token + refresh token cookie
 * @access  Public
 */
router.post("/login", validate(loginSchema), login);

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
router.post("/refresh", refresh);

export default router;
