import { z } from "zod";

const objectId = /^[0-9a-fA-F]{24}$/;

export const addToWishlistSchema = z.object({
  productId: z.string().regex(objectId, "Invalid product ID"),
});
