import mongoose from "mongoose";
import Product from "../../models/admin/product.model.js";
import ProductVariant from "../../models/admin/productVariant.model.js";
import Category from "../../models/admin/category.model.js";
import Brand from "../../models/admin/brand.model.js";
import ImportJob from "../../models/admin/importJob.model.js";
import {
  findOrCreateCategoryPath,
  findOrCreateBrand,
  groupRowsByProduct,
  mapGroupToProduct,
  HEADER_CANDIDATES,
} from "../../utils/csvMapper.js";
import { generateUniqueSlug } from "../../utils/slugify.js";
import { logActivity } from "../../utils/activityLogger.js";
import { parseCsvBuffer } from "../../utils/csvParser.js";
import ApiError from "../../utils/apiError.js";
import { adjustStock } from "../../utils/inventory.js";
import InventoryMovement from "../../models/admin/inventoryMovement.model.js";
import imagekit from "../../utils/imagekit.js";

async function uploadExternalImageToImageKit(imageUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(imageUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("image") && !contentType.includes("octet-stream")) {
      throw new Error(`Invalid content-type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = imageUrl.split("/").pop()?.split("?")[0] || "imported-image.jpg";

    const result = await imagekit.upload({
      file: buffer.toString("base64"),
      fileName: fileName.includes(".") ? fileName : `${fileName}.jpg`,
      folder: "/ecommerce-admin/products",
    });

    return result;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export const previewCsvImport = async (req, res, next) => {
  try {
    if (!req.file) throw new ApiError(400, "No CSV file provided");

    const rows = parseCsvBuffer(req.file.buffer);
    if (rows.length === 0) throw new ApiError(400, "CSV file is empty");

    const actualColumns = Object.keys(rows[0]);
    const requiredFieldGroups = [
      { label: "Title / Product Name", candidates: HEADER_CANDIDATES.title },
      { label: "URL handle / Slug", candidates: HEADER_CANDIDATES.handle },
      { label: "SKU", candidates: HEADER_CANDIDATES.sku },
      {
        label: "Price",
        candidates: [...HEADER_CANDIDATES.price, ...HEADER_CANDIDATES.compareAtPrice],
      },
    ];

    const missingGroups = requiredFieldGroups.filter(
      (group) =>
        !group.candidates.some((candidate) =>
          actualColumns.some((col) => col.trim().toLowerCase() === candidate.trim().toLowerCase())
        )
    );

    if (missingGroups.length > 0) {
      const missingLabels = missingGroups.map((g) => g.label);
      throw new ApiError(400, `Missing required columns: ${missingLabels.join(", ")}`);
    }

    const groups = groupRowsByProduct(rows);
    const mappedProducts = await Promise.all(groups.map(mapGroupToProduct));

    // --- Per-SKU duplicate check ---
    // Collect every SKU in this CSV and look them up in the DB in one query.
    const allSkus = mappedProducts.flatMap((p) => p.variants.map((v) => v.sku));
    const existingVariants = await ProductVariant.find({ sku: { $in: allSkus } }).select("sku");
    const existingSkuSet = new Set(existingVariants.map((v) => v.sku));

    mappedProducts.forEach((product) => {
      const duplicateSkus = product.variants
        .filter((v) => existingSkuSet.has(v.sku))
        .map((v) => v.sku);

      if (duplicateSkus.length > 0) {
        product.valid = false;
        product.errors = [
          ...(product.errors || []),
          `Already imported — SKU(s) already exist: ${duplicateSkus.join(", ")}`,
        ];
      }
    });

    const validCount = mappedProducts.filter((p) => p.valid).length;
    const invalidCount = mappedProducts.length - validCount;

    res.status(200).json({
      success: true,
      data: {
        totalRows: rows.length,
        totalProducts: mappedProducts.length,
        validCount,
        invalidCount,
        products: mappedProducts,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const confirmCsvImport = async (req, res, next) => {
  const { fileName, products } = req.body;

  if (!Array.isArray(products) || products.length === 0) {
    return next(new ApiError(400, "No products provided for import"));
  }

  const errors = [];

  // PHASE 1: Pre-process image uploads outside of DB transaction
  // (Prevents keeping MongoDB transaction open during long external network operations)
  const preparedItems = await Promise.all(
    products.map(async (item) => {
      if (!item.valid || !item.product?.name || !item.variants?.length) {
        return { item, preparedProductImages: [], preparedVariantImagesList: [] };
      }

      // Process product images in parallel
      const resolvedProductImages = await Promise.all(
        (item.product.images || []).map(async (img) => {
          if (!img.url) return null;
          try {
            const uploaded = await uploadExternalImageToImageKit(img.url);
            return {
              url: uploaded.url,
              fileId: uploaded.fileId,
              source: "imagekit",
              position: img.position || 0,
              altText: img.altText || "",
            };
          } catch (uploadErr) {
            errors.push(
              `Image at ${img.url} could not be re-uploaded to ImageKit, stored as an external link instead`
            );
            return {
              url: img.url,
              fileId: null,
              source: "external",
              position: img.position || 0,
              altText: img.altText || "",
            };
          }
        })
      );

      // Process variant images in parallel
      const resolvedVariantImagesList = await Promise.all(
        (item.variants || []).map(async (v) => {
          if (!v.image) return [];
          try {
            const uploaded = await uploadExternalImageToImageKit(v.image);
            return [{ url: uploaded.url, fileId: uploaded.fileId }];
          } catch (uploadErr) {
            errors.push(
              `Image at ${v.image} could not be re-uploaded to ImageKit, stored as an external link instead`
            );
            return [{ url: v.image }];
          }
        })
      );

      // Process category image if present
      let preparedCategoryImage = null;
      if (item.product?.categoryImage) {
        try {
          const uploaded = await uploadExternalImageToImageKit(item.product.categoryImage);
          preparedCategoryImage = { url: uploaded.url, fileId: uploaded.fileId };
        } catch (uploadErr) {
          errors.push(
            `Category image at ${item.product.categoryImage} could not be re-uploaded to ImageKit, stored as an external link instead`
          );
          preparedCategoryImage = { url: item.product.categoryImage, fileId: null };
        }
      }

      return {
        item,
        preparedProductImages: resolvedProductImages.filter(Boolean),
        preparedVariantImagesList: resolvedVariantImagesList,
        preparedCategoryImage,
      };
    })
  );

  // PHASE 2: Perform DB writes inside MongoDB transaction (completes in <1 sec)
  const session = await mongoose.startSession();
  session.startTransaction();

  const createdProductIds = [];
  const createdVariantIds = [];
  const createdCategoryIds = [];
  const createdBrandIds = [];
  let successCount = 0;

  try {
    for (const prepared of preparedItems) {
      const { item, preparedProductImages, preparedVariantImagesList, preparedCategoryImage } = prepared;

      if (!item.valid) {
        errors.push(`Skipped "${item.product?.name || item.handle}": marked invalid`);
        continue;
      }
      if (!item.product?.name || !item.variants?.length) {
        errors.push(`Skipped "${item.handle}": missing name or variants`);
        continue;
      }

      const { categoryId, notice: categoryNotice } = await findOrCreateCategoryPath(
        item.product.categoryPath?.map((p) => p.name).join(">"),
        session,
        createdCategoryIds,
        preparedCategoryImage
      );
      if (categoryNotice) {
        errors.push(categoryNotice);
      }

      const brandId = await findOrCreateBrand(item.product.brandName, session, createdBrandIds);

      if (!categoryId || !brandId) {
        errors.push(`Skipped "${item.product.name}": could not resolve category/brand`);
        continue;
      }

      const slug = await generateUniqueSlug(Product, item.product.name, session);

      const [product] = await Product.create(
        [
          {
            name: item.product.name,
            slug,
            description: item.product.description,
            images: preparedProductImages,
            optionTypes: item.product.optionTypes || [],
            category: categoryId,
            brand: brandId,
            seo: item.product.seo || {},
            status: "draft", // imported products start as draft for admin review
          },
        ],
        { session }
      );
      createdProductIds.push(product._id);

      const variantDocs = item.variants.map((v, index) => ({
        product: product._id,
        sku: v.sku,
        barcode: v.barcode,
        price: v.price,
        salePrice: v.salePrice,
        costPrice: v.costPrice,
        stock: 0,
        options: v.options,
        images: preparedVariantImagesList[index] || [],
        weight: v.weight,
      }));

      // Safety net for a race condition (SKU imported by someone else between
      // preview and confirm) — let it abort the transaction cleanly rather than
      // trying to continue using a session MongoDB has already doomed.
      const createdVariants = await ProductVariant.insertMany(variantDocs, { session });
      createdVariantIds.push(...createdVariants.map((v) => v._id));

      for (let i = 0; i < createdVariants.length; i++) {
        const initialStock = item.variants[i].stock || 0;
        if (initialStock > 0) {
          await adjustStock({
            variantId: createdVariants[i]._id,
            type: "initial",
            quantity: initialStock,
            reason: `Initial stock from CSV import: ${fileName || "unnamed"}`,
            userId: req.user.id,
            session,
          });
        }
      }

      successCount++;
    }

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    return next(err);
  }
  session.endSession();

  const importJob = await ImportJob.create({
    user: req.user.id,
    fileName: fileName || "unnamed-import.csv",
    status: "completed",
    totalRows: products.length,
    totalProducts: products.length,
    successCount,
    skippedCount: products.length - successCount,
    createdProductIds,
    createdVariantIds,
    createdCategoryIds,
    createdBrandIds,
    errors,
  });

  await logActivity({
    userId: req.user.id,
    action: "create",
    resource: "ImportJob",
    resourceId: importJob._id,
    description: `CSV import: ${successCount}/${products.length} products imported from ${importJob.fileName}`,
  });

  res.status(201).json({
    success: true,
    data: {
      importJobId: importJob._id,
      successCount,
      skippedCount: importJob.skippedCount,
      errors,
    },
  });
};

export const rollbackCsvImport = async (req, res, next) => {
  try {
    const { id } = req.params;

    const importJob = await ImportJob.findById(id);
    if (!importJob) throw new ApiError(404, "Import job not found");

    if (importJob.status === "rolled_back") {
      throw new ApiError(400, "This import has already been rolled back");
    }

    // Collect ImageKit fileIds to delete before removing documents from DB
    const [productsToDelete, variantsToDelete, categoriesToRollbackDocs] = await Promise.all([
      Product.find({ _id: { $in: importJob.createdProductIds } }).select("images"),
      ProductVariant.find({ _id: { $in: importJob.createdVariantIds } }).select("images"),
      Category.find({ _id: { $in: importJob.createdCategoryIds } }).select("image"),
    ]);

    const fileIdsToDelete = [];

    for (const p of productsToDelete) {
      for (const img of p.images || []) {
        if (img.fileId) fileIdsToDelete.push(img.fileId);
      }
    }

    for (const v of variantsToDelete) {
      for (const img of v.images || []) {
        if (img.fileId) fileIdsToDelete.push(img.fileId);
      }
    }

    for (const c of categoriesToRollbackDocs) {
      if (c.image?.fileId) {
        fileIdsToDelete.push(c.image.fileId);
      }
    }

    // Delete uploaded image files from ImageKit
    for (const fileId of fileIdsToDelete) {
      try {
        await imagekit.deleteFile(fileId);
      } catch (ikErr) {
        // Ignore ImageKit deletion errors during rollback
      }
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      await ProductVariant.deleteMany({ _id: { $in: importJob.createdVariantIds } }, { session });
      await Product.deleteMany({ _id: { $in: importJob.createdProductIds } }, { session });
      await InventoryMovement.deleteMany({ product: { $in: importJob.createdProductIds } }, { session });

      // Rollback created categories in reverse order (leaf categories first, then parents)
      const categoryIdsToRollback = [...(importJob.createdCategoryIds || [])].reverse();
      for (const catId of categoryIdsToRollback) {
        const inUseByOther = await Product.exists({ category: catId }).session(session);
        const hasSubcategories = await Category.exists({ parent: catId }).session(session);
        if (!inUseByOther && !hasSubcategories) {
          await Category.deleteOne({ _id: catId }, { session });
        } else if (!inUseByOther) {
          await Category.updateOne({ _id: catId }, { $set: { image: { url: "", fileId: "" } } }, { session });
        }
      }

      // Rollback created brands if not referenced by other products
      const brandIdsToRollback = importJob.createdBrandIds || [];
      for (const brandId of brandIdsToRollback) {
        const inUseByOther = await Product.exists({ brand: brandId }).session(session);
        if (!inUseByOther) {
          await Brand.deleteOne({ _id: brandId }, { session });
        }
      }

      importJob.status = "rolled_back";
      await importJob.save({ session });

      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    await logActivity({
      userId: req.user.id,
      action: "delete",
      resource: "ImportJob",
      resourceId: importJob._id,
      description: `Rolled back CSV import: ${importJob.fileName} (${importJob.successCount} products removed)`,
    });

    res.status(200).json({
      success: true,
      message: `Rolled back ${importJob.successCount} products and their variants`,
    });
  } catch (err) {
    next(err);
  }
};

export const getImportJobs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;

    const filter = { user: req.user.id };
    if (status) filter.status = status;

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Number(page) - 1) * safeLimit;

    const [jobs, total] = await Promise.all([
      ImportJob.find(filter)
        .select("fileName status successCount skippedCount totalProducts createdAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      ImportJob.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: jobs,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / safeLimit),
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getImportJobById = async (req, res, next) => {
  try {
    const importJob = await ImportJob.findOne({
      _id: req.params.id,
      user: req.user.id, // scope to owning user
    }).select("-createdProductIds -createdVariantIds -createdCategoryIds -createdBrandIds");

    if (!importJob) throw new ApiError(404, "Import job not found");

    res.status(200).json({
      success: true,
      data: importJob,
    });
  } catch (err) {
    next(err);
  }
};
