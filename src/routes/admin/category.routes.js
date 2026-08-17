import express from "express";
import {
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory,
} from "../../controllers/admin/category.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createCategorySchema, updateCategorySchema } from "../../validations/admin/product.validation.js";

const router = express.Router();

/**
 * @route   GET /api/categories
 * @desc    List all categories
 * @access  Private (any authenticated role)
 */
router.get("/", authenticate, getCategories);

/**
 * @route   GET /api/categories/:id
 * @desc    Get a single category by ID
 * @access  Private (any authenticated role)
 */
router.get("/:id", authenticate, getCategoryById);

/**
 * @route   POST /api/categories
 * @desc    Create a category (top-level or nested via `parent`)
 * @access  Private (super_admin, admin)
 */
router.post("/", authenticate, authorize("super_admin", "admin"), validate(createCategorySchema), createCategory);

/**
 * @route   PUT /api/categories/:id
 * @desc    Update a category
 * @access  Private (super_admin, admin)
 */
router.put("/:id", authenticate, authorize("super_admin", "admin"), validate(updateCategorySchema), updateCategory);

/**
 * @route   DELETE /api/categories/:id
 * @desc    Delete a category (blocked if it has children or referencing products)
 * @access  Private (super_admin, admin)
 */
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteCategory);

export default router;
