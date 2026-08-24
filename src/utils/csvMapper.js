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

// ── Standard Header Candidates (2–4 clean options per field) ───────────────────

export const HEADER_CANDIDATES = {
  handle: ["URL handle", "Handle", "Slug"],
  title: ["Title", "Product Name", "Name"],
  sku: ["SKU", "Variant SKU"],
  barcode: ["Barcode", "Variant Barcode"],
  price: ["Price", "Sale Price", "Discount Price"],
  compareAtPrice: ["Compare-at price", "Compare-at Price", "Regular Price", "Original Price"],
  costPrice: ["Cost per item", "Cost Per Item", "Cost Price", "Cost"],
  stock: ["Inventory quantity", "Stock", "Quantity"],
  vendor: ["Vendor", "Brand"],
  category: ["Product category", "Category"],
  productImage: ["Product Image URL", "Image Src", "Image URL"],
  position: ["Image Position", "Position"],
  altText: ["Image Alt Text", "Alt Text"],
  variantImage: ["Variant Image URL", "Variant Image"],
  categoryImage: ["Category Image URL", "Category Image"],
  weight: ["Weight value (grams)", "Weight"],
  description: ["Description", "Body (HTML)", "Body"],
  seoTitle: ["SEO title", "SEO Title"],
  seoDescription: ["SEO description", "SEO Description"],
};

const getRowValue = (row, candidateKeys) => {
  if (!row) return "";
  const rowKeys = Object.keys(row);
  for (const candidate of candidateKeys) {
    const candidateLower = candidate.trim().toLowerCase();
    const actualKey = rowKeys.find((k) => k.trim().toLowerCase() === candidateLower);
    if (actualKey && row[actualKey] !== undefined && row[actualKey] !== null) {
      const str = String(row[actualKey]).trim();
      if (str !== "") return str;
    }
  }
  return "";
};

// groups raw CSV rows into { product, variants[] } structures by "URL handle"
export const groupRowsByProduct = (rows) => {
  const groups = new Map();

  for (const row of rows) {
    const handle = getRowValue(row, HEADER_CANDIDATES.handle);
    if (!handle) continue; // rows without a handle can't be grouped — flagged as an error elsewhere

    if (!groups.has(handle)) {
      groups.set(handle, { parentRow: null, variantRows: [] });
    }

    const group = groups.get(handle);

    // the parent row is the one carrying Title/Name (Shopify leaves it blank on variant-only rows)
    const title = getRowValue(row, HEADER_CANDIDATES.title);
    if (title) {
      group.parentRow = row;
    }
    group.variantRows.push(row);
  }

  return Array.from(groups.entries()).map(([handle, group]) => ({ handle, ...group }));
};

// converts one grouped { parentRow, variantRows } into your Product/Variant shape,
// with validation errors attached per field
export const mapGroupToProduct = async (group) => {
  const errors = [];
  const { parentRow, variantRows, handle } = group;

  const title = getRowValue(parentRow, HEADER_CANDIDATES.title);
  const vendorStr = getRowValue(parentRow, HEADER_CANDIDATES.vendor);
  const categoryStr = getRowValue(parentRow, HEADER_CANDIDATES.category);

  if (!parentRow || !title) {
    errors.push(`No parent row (row with Title) found for handle "${handle}"`);
  }

  const category = await resolveCategoryPath(categoryStr);
  const brand = await resolveBrand(vendorStr);

  if (!vendorStr) errors.push("Missing Vendor (Brand)");
  if (!categoryStr) errors.push("Missing Product category");

  // Extract product-level images (supporting 2-4 candidate header options)
  const productImages = [];
  const seenUrls = new Set();

  let categoryImage = null;
  for (const row of variantRows) {
    const imgUrl = getRowValue(row, HEADER_CANDIDATES.categoryImage);
    if (imgUrl) {
      categoryImage = imgUrl;
      break;
    }
  }

  for (const row of variantRows) {
    const src = getRowValue(row, HEADER_CANDIDATES.productImage);
    if (src && !seenUrls.has(src)) {
      seenUrls.add(src);
      const posRaw = getRowValue(row, HEADER_CANDIDATES.position);
      const position = posRaw && !isNaN(Number(posRaw)) ? Number(posRaw) : 0;
      const altText = getRowValue(row, HEADER_CANDIDATES.altText);
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
    const sku = getRowValue(row, HEADER_CANDIDATES.sku);
    const barcode = getRowValue(row, HEADER_CANDIDATES.barcode) || undefined;
    const rawPrice = getRowValue(row, HEADER_CANDIDATES.price);
    const rawComparePrice = getRowValue(row, HEADER_CANDIDATES.compareAtPrice);
    const rawStock = getRowValue(row, HEADER_CANDIDATES.stock);

    if (!sku) variantErrors.push("Missing SKU");

    // Price extraction logic:
    // In our database model (productVariant.model.js):
    // - `price`: Regular / Original Price (e.g. ₹5,499)
    // - `salePrice`: Discounted / Sale Price (e.g. ₹4,499)
    const numPrice = rawPrice && !isNaN(Number(rawPrice)) ? Number(rawPrice) : null;
    const numCompare = rawComparePrice && !isNaN(Number(rawComparePrice)) ? Number(rawComparePrice) : null;

    if (numPrice === null && numCompare === null) {
      variantErrors.push("Missing or invalid Price");
    }

    let price = 0;
    let salePrice = undefined;

    if (numPrice !== null && numCompare !== null) {
      if (numPrice === numCompare) {
        price = numPrice;
        salePrice = undefined;
      } else {
        // Regular/Original price is always the higher price.
        // Discounted/Sale price is the lower price.
        price = Math.max(numPrice, numCompare);
        salePrice = Math.min(numPrice, numCompare);
      }
    } else if (numPrice !== null) {
      price = numPrice;
      salePrice = undefined;
    } else if (numCompare !== null) {
      price = numCompare;
      salePrice = undefined;
    }

    const rawCost = getRowValue(row, HEADER_CANDIDATES.costPrice);
    const costPrice =
      rawCost && !isNaN(Number(rawCost)) && Number(rawCost) >= 0 ? Number(rawCost) : undefined;

    if (rawStock && isNaN(Number(rawStock))) {
      variantErrors.push("Invalid Inventory quantity");
    }
    const stock = rawStock ? Number(rawStock) || 0 : 0;

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

    const variantImage = getRowValue(row, HEADER_CANDIDATES.variantImage) || null;
    const rawWeight = getRowValue(row, HEADER_CANDIDATES.weight);

    return {
      rowIndex: index,
      sku,
      barcode,
      price,
      salePrice,
      costPrice,
      stock,
      options,
      image: variantImage,
      weight: rawWeight && !isNaN(Number(rawWeight))
        ? { value: Number(rawWeight), unit: "g" }
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
    name: title,
    description: getRowValue(parentRow, HEADER_CANDIDATES.description),
    seoTitle: getRowValue(parentRow, HEADER_CANDIDATES.seoTitle),
    seoDescription: getRowValue(parentRow, HEADER_CANDIDATES.seoDescription),
    images: productImages,
    optionTypes,
    categoryPath: category.path,
    categoryResolved: category.finalExists,
    categoryImage,
    brandName: vendorStr,
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
  if (!categoryPathString) return { categoryId: null, notice: null };

  const levels = categoryPathString.split(">").map((s) => s.trim());
  let parentId = null;
  let finalCategoryId = null;
  let notice = null;

  for (let i = 0; i < levels.length; i++) {
    const levelName = levels[i];
    const isParent = i === 0; // attach category image to the top-level parent category

    // Case-insensitive find — also sees this transaction's own uncommitted writes
    let category = await findCategoryCI(levelName, parentId, session);

    if (!category) {
      // Use generateUniqueSlug with the session so the uniqueness check sees
      // uncommitted writes from this transaction (read-your-own-writes).
      // This prevents E11000 when two categories at different tree positions
      // share the same name (e.g. top-level "Clothing" vs "Apparel > Clothing").
      const slug = await generateUniqueSlug(Category, levelName, session);
      const catDoc = { name: levelName.trim(), slug, parent: parentId };

      if (isParent && categoryImage && categoryImage.url) {
        catDoc.image = categoryImage;
      }

      [category] = await Category.create([catDoc], { session });
      createdCategoryIds.push(category._id);
    } else if (isParent && categoryImage && categoryImage.url) {
      if (!category.image || !category.image.url) {
        // Parent exists but has no image -> update with new image
        category.image = categoryImage;
        await category.save({ session });
        notice = `Updated image for existing top-level category "${category.name}".`;
      } else {
        // Parent exists and already has an image -> keep existing image intact, inform admin
        notice = `Top-level category "${category.name}" already has an image set; new CSV image link was skipped.`;
      }
    }

    parentId = category._id;
    finalCategoryId = category._id;
  }

  return { categoryId: finalCategoryId, notice };
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