import express from "express";
import {
  getPublicProducts,
  getPublicProductBySlug,
  getPublicCategories,
  getPublicSearchSuggestions,
  getPublicBanners,
} from "../../controllers/customer/public.controller.js";

const router = express.Router();

// No authenticate / authenticateCustomer middleware — fully public
router.get("/search/suggestions", getPublicSearchSuggestions);
router.get("/products", getPublicProducts);
router.get("/products/:slug", getPublicProductBySlug);
router.get("/categories", getPublicCategories);
router.get("/banners", getPublicBanners);

export default router;
