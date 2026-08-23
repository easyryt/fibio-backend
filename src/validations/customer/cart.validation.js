import { z } from "zod";
import { objectId } from "../shared.js";


export const addToCartSchema = z.object({
  variantId: objectId,
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0, "Quantity cannot be negative"),
});
