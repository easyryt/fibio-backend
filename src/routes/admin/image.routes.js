import express from "express";
import { uploadImage } from "../../controllers/admin/image.controller.js";
import { authenticate } from "../../middleware/authenticate.middleware.js";
import { authorize } from "../../middleware/authorize.middleware.js";
import { upload } from "../../middleware/upload.middleware.js";

const router = express.Router();

/**
 * @route   POST /api/images/upload
 * @desc    Upload a single image to ImageKit, returns url + fileId
 * @access  Private (super_admin, admin)
 */
router.post(
  "/upload",
  authenticate,
  authorize("super_admin", "admin"),
  upload.array("image", 4),
  uploadImage
);

export default router;
