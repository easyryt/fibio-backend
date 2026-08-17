import express from "express";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
} from "../../controllers/customer/wishlist.controller.js";
import { authenticateCustomer } from "../../middleware/authenticateCustomer.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { addToWishlistSchema } from "../../validations/customer/wishlist.validation.js";

const router = express.Router();

/**
 * @route   GET /api/customers/wishlist
 * @desc    Get (or create) the authenticated customer's wishlist
 * @access  Private (authenticateCustomer)
 */
router.get("/", authenticateCustomer, getWishlist);

/**
 * @route   POST /api/customers/wishlist/items
 * @desc    Add a product to the wishlist (no-op if already present)
 * @access  Private (authenticateCustomer)
 */
router.post("/items", authenticateCustomer, validate(addToWishlistSchema), addToWishlist);

/**
 * @route   DELETE /api/customers/wishlist/items/:productId
 * @desc    Remove a product from the wishlist
 * @access  Private (authenticateCustomer)
 */
router.delete("/items/:productId", authenticateCustomer, removeFromWishlist);

export default router;
