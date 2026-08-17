import express from "express";
import { getUsers, getUserById, updateUser, deleteUser, getMe } from "../../controllers/admin/user.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { updateUserSchema } from "../../validations/admin/user.validation.js";

const router = express.Router();

/**
 * @route   GET /api/users/me
 * @desc    Return the authenticated user's own profile (session hydration)
 * @access  Private (any authenticated role)
 */
router.get("/me", authenticate, getMe);

/**
 * @route   GET /api/users
 * @desc    List users with filters (role, isActive, search) + pagination
 * @access  Private (super_admin only)
 */
router.get("/", authenticate, authorize("super_admin"), getUsers);

/**
 * @route   GET /api/users/:id
 * @desc    Get a single user by ID
 * @access  Private (super_admin only)
 */
router.get("/:id", authenticate, authorize("super_admin"), getUserById);

/**
 * @route   PUT /api/users/:id
 * @desc    Update a user's name, role, or active status (self-modification blocked)
 * @access  Private (super_admin only)
 */
router.put("/:id", authenticate, authorize("super_admin"), validate(updateUserSchema), updateUser);

/**
 * @route   DELETE /api/users/:id
 * @desc    Hard delete a user (self-deletion blocked)
 * @access  Private (super_admin only)
 */
router.delete("/:id", authenticate, authorize("super_admin"), deleteUser);

export default router;
