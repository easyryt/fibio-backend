import { z } from "zod";

const objectId = /^[0-9a-fA-F]{24}$/;

export const addToCartSchema = z.object({
  variantId: z.string().regex(objectId, "Invalid variant ID"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0, "Quantity cannot be negative"),
});
