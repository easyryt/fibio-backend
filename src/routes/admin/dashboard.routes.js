import express from "express";
import { getDashboardStats } from "../../controllers/admin/dashboard.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";

const router = express.Router();

/**
 * @route   GET /api/dashboard/stats
 * @desc    Aggregate stats: product/category/brand counts, low stock, latest activity
 * @access  Private (any authenticated role)
 */
router.get("/stats", authenticate, getDashboardStats);

export default router;
