import { z } from "zod";
import { objectId } from "../shared.js";


export const addToWishlistSchema = z.object({
  productId: objectId,
});
