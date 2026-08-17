import express from "express";
import { getAllBanners, updateBannerByKey } from "../../controllers/admin/banner.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";

const router = express.Router();

router.use(authenticate);

// Staff, admin, super_admin can view banner configurations
router.get("/", authorize("super_admin", "admin", "staff"), getAllBanners);

// ONLY admin and super_admin can update banner configurations (staff is blocked with 403 Forbidden)
router.put("/:key", authorize("super_admin", "admin"), updateBannerByKey);

export default router;
