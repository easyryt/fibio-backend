import express from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  bulkUpdateProducts,
  bulkDeleteProducts,
} from "../../controllers/admin/product.controller.js";
import {
  createVariant,
  getVariantsByProduct,
  getVariantById,
  updateVariant,
  deleteVariant,
} from "../../controllers/admin/productVariant.controller.js";
import {
  createProductSchema,
  updateProductSchema,
  createVariantSchema,
  updateVariantSchema,
  nestedCreateVariantSchema,
} from "../../validations/admin/product.validation.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import {
  previewCsvImport,
  confirmCsvImport,
  rollbackCsvImport,
  getImportJobs,
  getImportJobById,
} from "../../controllers/admin/csvImport.controller.js";
import { csvUpload } from "../../middleware/csvUpload.middleware.js";

const router = express.Router();

// ---- Product ----

/**
 * @route   GET /api/products
 * @desc    List products with filters (category, brand, status, featured, search) + pagination
 * @access  Private (any authenticated role)
 */
router.get("/", authenticate, getProducts);

/**
 * @route   PATCH /api/products/bulk
 * @desc    Bulk update product status or featured flag
 * @access  Private (super_admin, admin)
 */
router.patch("/bulk", authenticate, authorize("super_admin", "admin"), bulkUpdateProducts);

/**
 * @route   DELETE /api/products/bulk
 * @desc    Bulk delete products and their variants
 * @access  Private (super_admin, admin)
 */
router.delete("/bulk", authenticate, authorize("super_admin", "admin"), bulkDeleteProducts);


// ---- CSV Import (confirm + rollback) ----

/**
 * @route   POST /api/products/import/confirm
 * @desc    Re-validates and imports valid rows from a previewed CSV (transactional), records an ImportJob
 * @access  Private (super_admin, admin)
 */
router.post("/import/confirm", authenticate, authorize("super_admin", "admin"), confirmCsvImport);

/**
 * @route   POST /api/products/import/:id/rollback
 * @desc    Undo a completed import using its ImportJob's tracked created IDs
 * @access  Private (super_admin, admin)
 */
router.post(
  "/import/:id/rollback",
  authenticate,
  authorize("super_admin", "admin"),
  rollbackCsvImport
);

/**
 * @route   POST /api/products/import/preview
 * @desc    Parse + validate a Shopify-format CSV, group rows into products/variants. No DB writes.
 * @access  Private (super_admin, admin)
 */
router.post(
  "/import/preview",
  authenticate,
  authorize("super_admin", "admin"),
  csvUpload.single("file"),
  previewCsvImport
);

/**
 * @route   GET /api/products/import
 * @desc    List recent ImportJob documents for the current user, paginated
 *          (supports ?page=&limit=&status= query params)
 * @access  Private (super_admin, admin)
 */
router.get("/import", authenticate, authorize("super_admin", "admin"), getImportJobs);

/**
 * @route   GET /api/products/import/:id
 * @desc    Fetch a single ImportJob by ID (server-verified status — use this to
 *          determine whether the rollback button should be shown/disabled)
 * @access  Private (super_admin, admin)
 */
router.get("/import/:id", authenticate, authorize("super_admin", "admin"), getImportJobById);

/**
 * @route   GET /api/products/:id
 * @desc    Get a single product with its populated category/brand + its variants
 * @access  Private (any authenticated role)
 */
router.get("/:id", authenticate, getProductById);

/**
 * @route   POST /api/products
 * @desc    Create a product with at least one variant (transactional)
 * @access  Private (super_admin, admin)
 */
router.post(
  "/",
  authenticate,
  authorize("super_admin", "admin"),
  validate(createProductSchema),
  createProduct
);

/**
 * @route   PUT /api/products/:id
 * @desc    Update product fields (does not touch variants)
 * @access  Private (super_admin, admin)
 */
router.put(
  "/:id",
  authenticate,
  authorize("super_admin", "admin"),
  validate(updateProductSchema),
  updateProduct
);

/**
 * @route   DELETE /api/products/:id
 * @desc    Delete a product and cascade-delete its variants (transactional)
 * @access  Private (super_admin, admin)
 */
router.delete("/:id", authenticate, authorize("super_admin", "admin"), deleteProduct);

// ---- Variants (nested under a product) ----

/**
 * @route   GET /api/products/:productId/variants
 * @desc    List all variants for a product
 * @access  Private (any authenticated role)
 */
router.get("/:productId/variants", authenticate, getVariantsByProduct);

/**
 * @route   GET /api/products/:productId/variants/:id
 * @desc    Get a single variant by ID
 * @access  Private (any authenticated role)
 */
router.get("/:productId/variants/:id", authenticate, getVariantById);

/**
 * @route   POST /api/products/:productId/variants
 * @desc    Add a new variant to an existing product
 * @access  Private (super_admin, admin)
 */
router.post(
  "/:productId/variants",
  authenticate,
  authorize("super_admin", "admin"),
  validate(nestedCreateVariantSchema),
  createVariant
);

/**
 * @route   PUT /api/products/:productId/variants/:id
 * @desc    Update a variant (product reassignment not allowed)
 * @access  Private (super_admin, admin)
 */
router.put(
  "/:productId/variants/:id",
  authenticate,
  authorize("super_admin", "admin"),
  validate(updateVariantSchema),
  updateVariant
);

/**
 * @route   DELETE /api/products/:productId/variants/:id
 * @desc    Delete a variant (blocked if it's the product's only remaining variant)
 * @access  Private (super_admin, admin)
 */
router.delete(
  "/:productId/variants/:id",
  authenticate,
  authorize("super_admin", "admin"),
  deleteVariant
);

export default router;
