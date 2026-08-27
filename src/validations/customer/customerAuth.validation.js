import { z } from "zod";

export const registerCustomerSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().trim().optional(),
});

export const loginCustomerSchema = z.object({
  email: z.string().trim().email("Invalid email"),
  password: z.string().min(1, "Password is required"),
});

export const updateCustomerProfileSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").optional(),
  email: z.string().trim().email("Invalid email").optional(),
  phone: z.string().trim().optional().nullable(),
  addresses: z
    .array(
      z.object({
        _id: z.string().optional(),
        label: z.string().trim().optional(),
        line1: z.string().trim().min(1, "Address line 1 is required"),
        line2: z.string().trim().optional(),
        city: z.string().trim().min(1, "City is required"),
        state: z.string().trim().optional(),
        postalCode: z.string().trim().min(1, "Postal code is required"),
        country: z.string().trim().min(1, "Country is required"),
        phone: z.string().trim().optional(),
        isDefault: z.boolean().optional(),
      })
    )
    .optional(),
});

