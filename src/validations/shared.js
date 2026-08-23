import { z } from "zod";

/**
 * Reusable Zod validator for MongoDB ObjectId strings.
 * Use across all validation schemas instead of redefining the regex.
 */
export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");
