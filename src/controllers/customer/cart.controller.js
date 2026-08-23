import Cart from "../../models/customer/cart.model.js";
import ProductVariant from "../../models/admin/productVariant.model.js";
import ApiError from "../../utils/apiError.js";

// Shared populate chain — used by every cart endpoint that returns the populated cart.
const populateCart = (cartId) =>
  Cart.findById(cartId).populate({
    path: "items.variant",
    select: "sku price salePrice stock images product",
    populate: { path: "product", select: "name slug images" },
  });

// ---------------- GET /api/customers/cart ----------------
export const getCart = async (req, res, next) => {
  try {
    let cart = await populateCart(
      (await Cart.findOne({ customer: req.customer.id }))?._id
    );

    if (!cart) {
      // find-or-create: return an empty cart instead of 404
      cart = await Cart.create({ customer: req.customer.id, items: [] });
    }

    res.status(200).json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};

// ---------------- POST /api/customers/cart/items ----------------
export const addToCart = async (req, res, next) => {
  try {
    const { variantId, quantity } = req.body;

    const variant = await ProductVariant.findById(variantId);
    if (!variant) throw new ApiError(404, "Variant not found");
    if (!variant.isActive) throw new ApiError(400, "This variant is no longer available");

    let cart = await Cart.findOne({ customer: req.customer.id });
    if (!cart) {
      cart = await Cart.create({ customer: req.customer.id, items: [] });
    }

    const existingItem = cart.items.find(
      (item) => item.variant.toString() === variantId
    );

    let message = null;

    if (existingItem) {
      const desired = existingItem.quantity + quantity;
      const clamped = Math.min(desired, variant.stock);
      if (clamped < desired) {
        message = `Only ${variant.stock} in stock — quantity adjusted to ${clamped}.`;
      }
      existingItem.quantity = clamped;
    } else {
      const clamped = Math.min(quantity, variant.stock);
      if (clamped < quantity) {
        message = `Only ${variant.stock} in stock — quantity adjusted to ${clamped}.`;
      }
      if (clamped > 0) {
        cart.items.push({ variant: variantId, quantity: clamped });
      }
    }

    await cart.save();

    const populated = await populateCart(cart._id);

    res.status(200).json({
      success: true,
      data: populated,
      ...(message && { message }),
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- PUT /api/customers/cart/items/:variantId ----------------
export const updateCartItem = async (req, res, next) => {
  try {
    const { variantId } = req.params;
    const { quantity } = req.body;

    const cart = await Cart.findOne({ customer: req.customer.id });
    if (!cart) throw new ApiError(404, "Cart not found");

    const itemIndex = cart.items.findIndex(
      (item) => item.variant.toString() === variantId
    );
    if (itemIndex === -1) throw new ApiError(404, "Item not in cart");

    // If quantity <= 0, remove the item instead of setting zero/negative
    if (quantity <= 0) {
      cart.items.splice(itemIndex, 1);
      await cart.save();
      const populated = await populateCart(cart._id);
      return res.status(200).json({ success: true, data: populated });
    }

    const variant = await ProductVariant.findById(variantId);
    if (!variant) throw new ApiError(404, "Variant not found");

    let message = null;
    const clamped = Math.min(quantity, variant.stock);
    if (clamped < quantity) {
      message = `Only ${variant.stock} in stock — quantity adjusted to ${clamped}.`;
    }

    cart.items[itemIndex].quantity = clamped;
    await cart.save();

    const populated = await populateCart(cart._id);

    res.status(200).json({
      success: true,
      data: populated,
      ...(message && { message }),
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- DELETE /api/customers/cart/items/:variantId ----------------
export const removeCartItem = async (req, res, next) => {
  try {
    const { variantId } = req.params;

    const cart = await Cart.findOne({ customer: req.customer.id });
    if (!cart) throw new ApiError(404, "Cart not found");

    cart.items = cart.items.filter(
      (item) => item.variant.toString() !== variantId
    );
    await cart.save();

    const populated = await populateCart(cart._id);

    res.status(200).json({ success: true, data: populated });
  } catch (err) {
    next(err);
  }
};

// ---------------- DELETE /api/customers/cart ----------------
export const clearCart = async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ customer: req.customer.id });
    if (!cart) throw new ApiError(404, "Cart not found");

    cart.items = [];
    await cart.save();

    res.status(200).json({ success: true, data: cart });
  } catch (err) {
    next(err);
  }
};
