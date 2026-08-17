import { z } from "zod";

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, "Name is required").optional(),
  role: z.enum(["super_admin", "admin", "staff"]).optional(),
  isActive: z.boolean().optional(),
});
