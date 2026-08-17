import InventoryMovement from "../models/admin/inventoryMovement.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import ApiError from "./apiError.js";

// direction: which movement types increase vs decrease stock
const INCREASING_TYPES = ["initial", "restock", "return"];
const DECREASING_TYPES = ["sale", "damage"];
// "correction" can go either way — the caller supplies a signed quantityChange directly

export const adjustStock = async ({ variantId, type, quantity, reason, userId, session }) => {
  const variant = await ProductVariant.findById(variantId).session(session);
  if (!variant) throw new ApiError(404, "Variant not found");

  let quantityChange;
  if (type === "correction") {
    quantityChange = quantity; // caller passes a signed delta directly for corrections
  } else if (INCREASING_TYPES.includes(type)) {
    quantityChange = Math.abs(quantity);
  } else if (DECREASING_TYPES.includes(type)) {
    quantityChange = -Math.abs(quantity);
  } else {
    throw new ApiError(400, "Invalid movement type");
  }

  const previousStock = variant.stock;
  const newStock = previousStock + quantityChange;

  if (newStock < 0) {
    throw new ApiError(400, `Insufficient stock: cannot reduce below 0 (current: ${previousStock})`);
  }

  variant.stock = newStock;
  await variant.save({ session });

  const [movement] = await InventoryMovement.create(
    [
      {
        variant: variant._id,
        product: variant.product,
        type,
        quantityChange,
        previousStock,
        newStock,
        reason,
        user: userId,
      },
    ],
    { session }
  );

  return { variant, movement };
};