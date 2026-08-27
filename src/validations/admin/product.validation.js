import { z } from "zod";
import { objectId } from "../shared.js";


const imageSchema = z.object({
  url: z.string().url("Invalid image URL"),
  fileId: z.string().nullable().optional(),
  source: z.enum(["imagekit", "external"]).optional().default("imagekit"),
  altText: z.string().trim().optional(),
  position: z.number().int().min(0).optional(),
});

// ------ Brand ------
// Note: slug is auto-generated server-side from `name` in the controller,
// so it's intentionally not part of this schema.

export const createBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .max(100, "Brand name cannot exceed 100 characters"),

  logo: z.string().url("Invalid logo URL").optional(),

  isActive: z.boolean().optional(),
});

export const updateBrandSchema = createBrandSchema.partial();

// ------- Category -------
// Note: slug is auto-generated server-side from `name`, same as Brand.

export const createCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Category name must be at least 2 characters")
    .max(100, "Category name cannot exceed 100 characters"),

  description: z.string().trim().optional(),

  parent: objectId.nullable().optional(),

  isActive: z.boolean().optional(),

  image: z
    .object({
      url: z.string().optional().or(z.literal("")),
      fileId: z.string().optional().or(z.literal("")),
    })
    .optional(),
});

export const updateCategorySchema = createCategorySchema.partial();

// --------- Product Variant ---------

// base schema kept separate (no refine) so both create and update
// can independently apply .partial() / .omit() before adding refine checks
const baseVariantSchema = z.object({
  product: objectId,

  sku: z.string().trim().min(1, "SKU is required").max(100),

  barcode: z.string().trim().optional(),

  options: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Option name is required"),
        value: z.string().trim().min(1, "Option value is required"),
      })
    )
    .optional(),

  price: z
    .number({
      invalid_type_error: "Price must be a number",
    })
    .min(0, "Price cannot be negative"),

  salePrice: z
    .number({
      invalid_type_error: "Sale price must be a number",
    })
    .min(0)
    .optional(),

  costPrice: z
    .number({
      invalid_type_error: "Cost price must be a number",
    })
    .min(0)
    .optional(),

  stock: z
    .number({
      invalid_type_error: "Stock must be a number",
    })
    .int()
    .min(0, "Stock cannot be negative"),

  weight: z
    .object({
      value: z.number().positive("Weight must be greater than 0"),
      unit: z.enum(["g", "kg", "lb", "oz"]),
    })
    .optional(),

  images: z
    .array(
      z.object({
        url: z.string().url("Invalid image URL"),
        fileId: z.string().optional(),
      })
    )
    .max(4, "A variant can have at most 4 images")
    .optional(),

  isActive: z.boolean().optional(),
});

// shared check: salePrice, if present, must not exceed price
const salePriceCheck = (data) => !data.salePrice || data.salePrice <= data.price;
const salePriceCheckOptions = {
  message: "Sale price cannot be greater than price",
  path: ["salePrice"],
};

export const createVariantSchema = baseVariantSchema.refine(salePriceCheck, salePriceCheckOptions);

// Used when creating a product with nested variants.
// Product ID doesn't exist yet, so omit it.
export const nestedCreateVariantSchema = baseVariantSchema
  .omit({ product: true })
  .refine(salePriceCheck, salePriceCheckOptions);

// `product` is deliberately excluded from updates — a variant shouldn't be
// reassignable to a different product through an edit request.
// `stock` is deliberately excluded — stock is ledger-only, mutated exclusively
// via POST /inventory/movements (adjustStock). Direct writes are blocked here
// to ensure the inventory movement history is always the source of truth.
export const updateVariantSchema = baseVariantSchema
  .omit({ product: true, stock: true })
  .partial()
  .refine(salePriceCheck, salePriceCheckOptions);

// ------- Product --------
// Note: slug is auto-generated server-side from `name`, same as Brand/Category.

export const createProductSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Product name must be at least 2 characters")
    .max(200, "Product name cannot exceed 200 characters"),

  description: z.string().trim().optional(),

  category: objectId,

  brand: objectId,

  status: z.enum(["draft", "active", "archived"]).optional(),

  featured: z.boolean().optional(),

  images: z.array(imageSchema).optional(),

  seo: z
    .object({
      metaTitle: z.string().trim().optional(),
      metaDescription: z.string().trim().optional(),
      keywords: z.array(z.string().trim()).optional(),
    })
    .optional(),

  optionTypes: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Option type name is required"),
        values: z.array(z.string().trim().min(1)).min(1, "Add at least one value"),
      })
    )
    .optional(),

  variants: z.array(nestedCreateVariantSchema).min(1, "At least one variant is required"),
});

export const updateProductSchema = createProductSchema.partial();
