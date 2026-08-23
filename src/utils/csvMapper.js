import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import Product from "../models/admin/product.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import { slugify, generateUniqueSlug } from "./slugify.js";
import { escapeRegex } from "./escapeRegex.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Case-insensitive, whitespace-trimmed findOne by name + optional parent.
 * Uses $regex with ^…$ anchors so "Clothing" and "clothing" and " Clothing "
 * all resolve to the same document.
 */
function findCategoryCI(name, parentId, session) {
  const trimmed = name.trim();
  const pattern = `^${escapeRegex(trimmed)}$`;
  const query = {
    name: { $regex: pattern, $options: "i" },
    parent: parentId,
  };
  return session
    ? Category.findOne(query).session(session)
    : Category.findOne(query);
}

function findBrandCI(name, session) {
  const trimmed = name.trim();
  const pattern = `^${escapeRegex(trimmed)}$`;
  const query = { name: { $regex: pattern, $options: "i" } };
  return session
    ? Brand.findOne(query).session(session)
    : Brand.findOne(query);
}

// ── Preview-time helpers (read-only — no session, no create) ─────────────────

// resolves "Apparel & Accessories > Clothing > T-Shirts" into a Category chain,
// checking which levels already exist vs would need to be created
const resolveCategoryPath = async (categoryPathString) => {
  if (!categoryPathString) return { exists: false, path: [], missing: [] };

  const levels = categoryPathString.split(">").map((s) => s.trim());
  const path = [];
  const missing = [];
  let parentId = null;

  for (const levelName of levels) {
    // Use case-insensitive match at preview time too so preview and confirm agree
    const existing = await findCategoryCI(levelName, parentId, null);
    if (existing) {
      path.push({ name: levelName, id: existing._id, existing: true });
      parentId = existing._id;
    } else {
      path.push({ name: levelName, id: null, existing: false });
      missing.push(levelName);
      parentId = null; // can't resolve deeper levels if this one doesn't exist yet
    }
  }

  return { path, missing, finalExists: missing.length === 0 };
};

const resolveBrand = async (vendorName) => {
  if (!vendorName) return { existing: false, id: null };
  // Case-insensitive match
  const brand = await findBrandCI(vendorName, null);
  return brand ? { existing: true, id: brand._id } : { existing: false, id: null };
};

// ── Row grouping / mapping ────────────────────────────────────────────────────

// groups raw CSV rows into { product, variants[] } structures by "URL handle"
export const groupRowsByProduct = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    const handle = row["URL handle"];
    if (!handle) continue; // rows without a handle can't be grouped — flagged as an error elsewhere

    if (!groups.has(handle)) {
      groups.set(handle, { parentRow: null, variantRows: [] });
    }

    const group = groups.get(handle);

    // the parent row is the one carrying Title (Shopify leaves it blank on variant-only rows)
    if (row.Title && row.Title.trim() !== "") {
      group.parentRow = row;
    }
    group.variantRows.push(row);
  }

  return Array.from(groups.entries()).map(([handle, group]) => ({ handle, ...group }));
};

const getRowValue = (row, candidateKeys) => {
  for (const key of candidateKeys) {
    if (row[key] !== undefined && row[key] !== null) {
      const str = String(row[key]).trim();
      if (str !== "") return str;
    }
  }
  return "";
};

// converts one grouped { parentRow, variantRows } into your Product/Variant shape,
// with validation errors attached per field
export const mapGroupToProduct = async (group) => {
  const errors = [];
  const { parentRow, variantRows, handle } = group;

  if (!parentRow) {
    errors.push(`No parent row (row with Title) found for handle "${handle}"`);
  }

  const category = await resolveCategoryPath(parentRow?.["Product category"]);
  const brand = await resolveBrand(parentRow?.Vendor);

  if (!parentRow?.Vendor) errors.push("Missing Vendor (Brand)");
  if (!parentRow?.["Product category"]) errors.push("Missing Product category");

  // Extract product-level images (supporting multiple CSV header variants like "Product image URL", "Image Src", etc.)
  const productImages = [];
  const seenUrls = new Set();

  const productImageKeys = [
    "Product image URL",
    "Product Image URL",
    "Image Src",
    "Image SRC",
    "Image URL",
    "Image Url",
  ];
  const positionKeys = ["Image position", "Image Position", "Position"];
  const altTextKeys = ["Image alt text", "Image Alt Text", "Alt Text", "Alt text"];
  const variantImageKeys = [
    "Variant image URL",
    "Variant Image URL",
    "Variant Image",
    "Variant image",
    "Variant Image Url",
  ];

  const categoryImageKeys = [
    "Category image URL",
    "Category Image URL",
    "Category image",
    "Category Image",
    "Category Image Url",
    "Category image url",
    "Category Img",
    "Category img",
    "Category Image Link",
    "Category image link",
  ];

  let categoryImage = null;
  for (const row of variantRows) {
    const imgUrl = getRowValue(row, categoryImageKeys);
    if (imgUrl) {
      categoryImage = imgUrl;
      break;
    }
  }

  for (const row of variantRows) {
    const src = getRowValue(row, productImageKeys);
    if (src && !seenUrls.has(src)) {
      seenUrls.add(src);
      const posRaw = getRowValue(row, positionKeys);
      const position = posRaw && !isNaN(Number(posRaw)) ? Number(posRaw) : 0;
      const altText = getRowValue(row, altTextKeys);
      productImages.push({
        url: src,
        position,
        altText,
      });
    }
  }
  productImages.sort((a, b) => a.position - b.position);

  const variants = variantRows.map((row, index) => {
    const variantErrors = [];
    if (!row.SKU) variantErrors.push("Missing SKU");
    if (!row.Price || isNaN(Number(row.Price))) variantErrors.push("Missing or invalid Price");
    if (row["Inventory quantity"] && isNaN(Number(row["Inventory quantity"]))) {
      variantErrors.push("Invalid Inventory quantity");
    }

    const options = [];
    if (row["Option1 name"] && row["Option1 value"]) {
      options.push({ name: row["Option1 name"], value: row["Option1 value"] });
    }
    if (row["Option2 name"] && row["Option2 value"]) {
      options.push({ name: row["Option2 name"], value: row["Option2 value"] });
    }
    if (row["Option3 name"] && row["Option3 value"]) {
      options.push({ name: row["Option3 name"], value: row["Option3 value"] });
    }

    const variantImage = getRowValue(row, variantImageKeys) || null;

    return {
      rowIndex: index,
      sku: row.SKU,
      barcode: row.Barcode || undefined,
      price: Number(row.Price) || 0,
      salePrice: row["Compare-at price"] ? Number(row["Compare-at price"]) : undefined,
      stock: Number(row["Inventory quantity"]) || 0,
      options,
      image: variantImage,
      weight: row["Weight value (grams)"]
        ? { value: Number(row["Weight value (grams)"]), unit: "g" }
        : undefined,
      errors: variantErrors,
      valid: variantErrors.length === 0,
    };
  });

  // Derive optionTypes from variant options
  const optionTypesMap = new Map();
  for (const variant of variants) {
    for (const opt of variant.options || []) {
      if (opt.name && opt.value) {
        if (!optionTypesMap.has(opt.name)) {
          optionTypesMap.set(opt.name, new Set());
        }
        optionTypesMap.get(opt.name).add(opt.value);
      }
    }
  }
  const optionTypes = Array.from(optionTypesMap.entries()).map(([name, valuesSet]) => ({
    name,
    values: Array.from(valuesSet),
  }));

  const productData = {
    name: parentRow?.Title,
    description: parentRow?.Description,
    seoTitle: parentRow?.["SEO title"],
    seoDescription: parentRow?.["SEO description"],
    images: productImages,
    optionTypes,
    categoryPath: category.path,
    categoryResolved: category.finalExists,
    categoryImage,
    brandName: parentRow?.Vendor,
    brandResolved: brand.existing,
    brandId: brand.id,
  };

  const allVariantsValid = variants.every((v) => v.valid);

  return {
    handle,
    product: productData,
    variants,
    errors,
    valid: errors.length === 0 && allVariantsValid,
  };
};

// ── Confirm-time helpers (write — session required) ───────────────────────────

/**
 * findOrCreateCategoryPath: like resolveCategoryPath but actually creates
 * missing levels inside a transaction session.
 *
 * Uses case-insensitive, trimmed matching so "Clothing", "clothing", and
 * " Clothing " all resolve to the same existing category document rather than
 * creating a duplicate that would collide on the slug unique index (E11000).
 *
 * Within a MongoDB transaction, findCategoryCI reads the session's own
 * uncommitted writes (read-your-own-writes guarantee), so a category created
 * earlier in this same transaction is always visible to subsequent find calls.
 * E11000 should therefore never be reached for same-CSV duplicates.
 * If a genuine concurrent-import race produces E11000, it propagates to the
 * outer confirmCsvImport catch which correctly aborts + endSession + next(err).
 */
export const findOrCreateCategoryPath = async (
  categoryPathString,
  session,
  createdCategoryIds,
  categoryImage = null
) => {
  if (!categoryPathString) return null;

  const levels = categoryPathString.split(">").map((s) => s.trim());
  let parentId = null;
  let finalCategoryId = null;

  for (let i = 0; i < levels.length; i++) {
    const levelName = levels[i];
    const isLeaf = i === levels.length - 1;

    // Case-insensitive find — also sees this transaction's own uncommitted writes
    let category = await findCategoryCI(levelName, parentId, session);

    if (!category) {
      // Use generateUniqueSlug with the session so the uniqueness check sees
      // uncommitted writes from this transaction (read-your-own-writes).
      // This prevents E11000 when two categories at different tree positions
      // share the same name (e.g. top-level "Clothing" vs "Apparel > Clothing").
      const slug = await generateUniqueSlug(Category, levelName, session);
      const catDoc = { name: levelName.trim(), slug, parent: parentId };

      if (isLeaf && categoryImage && categoryImage.url) {
        catDoc.image = categoryImage;
      }

      [category] = await Category.create([catDoc], { session });
      createdCategoryIds.push(category._id);
    } else if (isLeaf && categoryImage && categoryImage.url && (!category.image || !category.image.url)) {
      category.image = categoryImage;
      await category.save({ session });
    }

    parentId = category._id;
    finalCategoryId = category._id;
  }

  return finalCategoryId;
};

/**
 * findOrCreateBrand: case-insensitive find, create if missing.
 * Same transaction read-your-own-writes guarantee applies — no E11000
 * recovery needed. If a genuine concurrent race produces E11000, it
 * propagates to confirmCsvImport's outer catch.
 */
export const findOrCreateBrand = async (vendorName, session, createdBrandIds) => {
  if (!vendorName) return null;

  // Case-insensitive find — also sees this transaction's own uncommitted writes
  let brand = await findBrandCI(vendorName, session);

  if (!brand) {
    const trimmed = vendorName.trim();
    // Use generateUniqueSlug with the session for the same collision-safety reason.
    const slug = await generateUniqueSlug(Brand, trimmed, session);
    [brand] = await Brand.create([{ name: trimmed, slug }], { session });
    createdBrandIds.push(brand._id);
  }

  return brand._id;
};