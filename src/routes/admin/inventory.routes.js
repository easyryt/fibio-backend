import express from "express";
import { createMovement, getMovementsByVariant, reconcileStock } from "../../controllers/admin/inventory.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { createMovementSchema } from "../../validations/admin/inventory.validation.js";

const router = express.Router();

/**
 * @route   POST /api/inventory/movements
 * @desc    Record a stock movement (restock, sale, return, damage, correction) and update variant.stock
 * @access  Private (super_admin, admin)
 */
router.post("/movements", authenticate, authorize("super_admin", "admin"), validate(createMovementSchema), createMovement);

/**
 * @route   GET /api/inventory/movements/:variantId
 * @desc    Get full movement history for a variant
 * @access  Private (any authenticated role)
 */
router.get("/movements/:variantId", authenticate, getMovementsByVariant);

/**
 * @route   GET /api/inventory/reconcile/:variantId
 * @desc    Recompute stock from the full ledger, to detect drift from variant.stock
 * @access  Private (super_admin, admin)
 */
router.get("/reconcile/:variantId", authenticate, authorize("super_admin", "admin"), reconcileStock);

export default router;
