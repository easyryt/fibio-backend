import { z } from "zod";
import { objectId } from "../shared.js";


export const createMovementSchema = z.object({
  variantId: objectId,
  type: z.enum(["initial", "restock", "sale", "return", "damage", "correction"]),
  quantity: z.number({ invalid_type_error: "Quantity must be a number" }),
  reason: z.string().trim().max(300).optional(),
}).refine(
  (data) => data.type === "correction" || data.quantity > 0,
  { message: "Quantity must be positive (use type 'correction' for manual signed adjustments)", path: ["quantity"] }
);
