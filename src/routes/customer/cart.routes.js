import express from "express";
import {
  getCart,
  addToCart,
  updateCartItem,
  removeCartItem,
  clearCart,
} from "../../controllers/customer/cart.controller.js";
import { authenticateCustomer } from "../../middleware/authenticateCustomer.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  addToCartSchema,
  updateCartItemSchema,
} from "../../validations/customer/cart.validation.js";

const router = express.Router();

/**
 * @route   GET /api/customers/cart
 * @desc    Get (or create) the authenticated customer's cart
 * @access  Private (authenticateCustomer)
 */
router.get("/", authenticateCustomer, getCart);

/**
 * @route   POST /api/customers/cart/items
 * @desc    Add a variant to the cart (increments quantity if already present, clamps to stock)
 * @access  Private (authenticateCustomer)
 */
router.post("/items", authenticateCustomer, validate(addToCartSchema), addToCart);

/**
 * @route   PUT /api/customers/cart/items/:variantId
 * @desc    Set the quantity of a cart item directly (quantity <= 0 removes the item, clamps to stock)
 * @access  Private (authenticateCustomer)
 */
router.put("/items/:variantId", authenticateCustomer, validate(updateCartItemSchema), updateCartItem);

/**
 * @route   DELETE /api/customers/cart/items/:variantId
 * @desc    Remove a single line item from the cart
 * @access  Private (authenticateCustomer)
 */
router.delete("/items/:variantId", authenticateCustomer, removeCartItem);

/**
 * @route   DELETE /api/customers/cart
 * @desc    Empty the entire cart
 * @access  Private (authenticateCustomer)
 */
router.delete("/", authenticateCustomer, clearCart);

export default router;
