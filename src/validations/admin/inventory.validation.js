import { z } from "zod";

const objectId = /^[0-9a-fA-F]{24}$/;

export const createMovementSchema = z.object({
  variantId: z.string().regex(objectId, "Invalid variant ID"),
  type: z.enum(["initial", "restock", "sale", "return", "damage", "correction"]),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }),
  reason: z.string().trim().max(300).optional(),
}).refine(
  (data) => data.type === "correction" || data.quantity > 0,
  { message: "Quantity must be positive (use type 'correction' for manual signed adjustments)", path: ["quantity"] }
);
