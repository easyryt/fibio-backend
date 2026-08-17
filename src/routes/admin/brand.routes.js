import express from "express";
import {
  createBrand,
  getBrands,
  getBrandById,
  updateBrand,
  deleteBrand,
} from "../../controllers/admin/brand.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createBrandSchema, updateBrandSchema } from "../../validations/admin/product.validation.js";

const router = express.Router();

/**
 * @route   GET /api/brands
 * @desc    List all brands
 * @access  Private (any authenticated role)
 */
router.get("/", authenticate, getBrands);

/**
 * @route   GET /api/brands/:id
 * @desc    Get a single brand by ID
 * @access  Private (any authenticated role)
 */
router.get("/:id", authenticate, getBrandById);

/**
 * @route   POST /api/brands
 * @desc    Create a new brand
 * @access  Private (super_admin, admin)
 */
router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  validate(createBrandSchema),
  createBrand
);

/**
 * @route   PUT /api/brands/:id
 * @desc    Update a brand
 * @access  Private (super_admin, admin)
 */
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  validate(updateBrandSchema),
  updateBrand
);

/**
 * @route   DELETE /api/brands/:id
 * @desc    Delete a brand (blocked if any product references it)
 * @access  Private (super_admin, admin)
 */
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteBrand);

export default router;
