import Product from "../../models/admin/product.model.js";
import ProductVariant from "../../models/admin/productVariant.model.js";
import Category from "../../models/admin/category.model.js";
import Brand from "../../models/admin/brand.model.js";
import ApiError from "../../utils/apiError.js";
import { generateUniqueSlug } from "../../utils/slugify.js";
import { escapeRegex } from "../../utils/escapeRegex.js";
import { logActivity } from "../../utils/activityLogger.js";
import { adjustStock } from "../../utils/inventory.js";
import mongoose from "mongoose";

// ---------------- CREATE ----------------
// expects: { ...productFields, variants: [{ sku, price, stock, ... }, ...] }
export const createProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let product, createdVariants, finalVariants;

  try {
    const { variants, ...productData } = req.body;

    const categoryExists = await Category.findById(productData.category);
    if (!categoryExists) throw new ApiError(400, "Category not found");

    const brandExists = await Brand.findById(productData.brand);
    if (!brandExists) throw new ApiError(400, "Brand not found");

    const slug = await generateUniqueSlug(Product, productData.name);

    [product] = await Product.create([{ ...productData, slug }], { session });

    // create variants with stock 0 first — the ledger is the source of truth,
    // so initial stock gets set via adjustStock, not written directly
    const variantDocs = variants.map((v) => ({ ...v, stock: 0, product: product._id }));
    createdVariants = await ProductVariant.insertMany(variantDocs, { session }); // no `const` — assign to outer var

    for (let i = 0; i < createdVariants.length; i++) {
      const initialStock = variants[i].stock || 0;
      if (initialStock > 0) {
        await adjustStock({
          variantId: createdVariants[i]._id,
          type: "initial",
          quantity: initialStock,
          reason: "Initial stock on product creation",
          userId: req.user.id,
          session,
        });
      }
    }

    finalVariants = await ProductVariant.find({ product: product._id }).session(session); // no `const`

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    return next(err);
  } finally {
    session.endSession();
  }

  await logActivity({
    userId: req.user.id,
    action: "create",
    resource: "Product",
    resourceId: product._id,
    description: `Created product: ${product.name} (${finalVariants.length} variant${finalVariants.length > 1 ? "s" : ""})`,
  });

  res.status(201).json({
    success: true,
    data: { ...product.toObject(), variants: finalVariants },
  });
};

// ---------------- GET ALL (with filters + population) ----------------
export const getProducts = async (req, res, next) => {
  try {
    const { category, brand, status, featured, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (category) {
      if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { total: 0, page: Number(page), pages: 0 },
        });
      }
    }

    if (brand) {
      if (mongoose.Types.ObjectId.isValid(brand)) {
        filter.brand = brand;
      } else {
        return res.status(200).json({
          success: true,
          data: [],
          pagination: { total: 0, page: Number(page), pages: 0 },
        });
      }
    }

    if (status) filter.status = status;
    if (featured !== undefined) filter.featured = featured === "true";
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Number(page) - 1) * safeLimit;

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("category", "name slug")
        .populate("brand", "name slug")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),
      Product.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: products,
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

// ---------------- GET ONE (with its variants) ----------------
export const getProductById = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("category", "name slug")
      .populate("brand", "name slug");

    if (!product) throw new ApiError(404, "Product not found");

    const variants = await ProductVariant.find({ product: product._id });

    res.status(200).json({
      success: true,
      data: { ...product.toObject(), variants },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- UPDATE ----------------
// updates product fields only — variants are managed via separate variant endpoints
export const updateProduct = async (req, res, next) => {
  try {
    const updates = { ...req.body };
    delete updates.variants; // variants aren't touched through this endpoint

    if (updates.category) {
      const categoryExists = await Category.findById(updates.category);
      if (!categoryExists) throw new ApiError(400, "Category not found");
    }

    if (updates.brand) {
      const brandExists = await Brand.findById(updates.brand);
      if (!brandExists) throw new ApiError(400, "Brand not found");
    }

    if (updates.name) {
      updates.slug = await generateUniqueSlug(Product, updates.name);
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!product) throw new ApiError(404, "Product not found");

    await logActivity({
      userId: req.user.id,
      action: "update",
      resource: "Product",
      resourceId: product._id,
      description: `Updated product: ${product.name}`,
    });

    res.status(200).json({ success: true, data: product });
  } catch (err) {
    next(err);
  }
};

// ---------------- DELETE (product + all its variants) ----------------
export const deleteProduct = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let product;

  try {
    product = await Product.findById(req.params.id).session(session);
    if (!product) throw new ApiError(404, "Product not found");

    await ProductVariant.deleteMany({ product: product._id }, { session });
    await Product.deleteOne({ _id: product._id }, { session });

    await session.commitTransaction();
  } catch (err) {
    await session.abortTransaction();
    return next(err);
  } finally {
    session.endSession();
  }

  await logActivity({
    userId: req.user.id,
    action: "delete",
    resource: "Product",
    resourceId: product._id,
    description: `Deleted product: ${product.name}`,
  });

  res.status(200).json({
    success: true,
    message: "Product and its variants deleted",
  });
};

// ---------------- BULK UPDATE (status, featured) ----------------
export const bulkUpdateProducts = async (req, res, next) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, "No product IDs provided");
    }
    if (!updates || typeof updates !== "object") {
      throw new ApiError(400, "No updates provided");
    }

    const allowedUpdates = {};
    if (updates.status && ["draft", "active", "archived"].includes(updates.status)) {
      allowedUpdates.status = updates.status;
    }
    if (typeof updates.featured === "boolean") {
      allowedUpdates.featured = updates.featured;
    }

    if (Object.keys(allowedUpdates).length === 0) {
      throw new ApiError(400, "No valid update fields provided");
    }

    const result = await Product.updateMany(
      { _id: { $in: ids } },
      { $set: allowedUpdates }
    );

    await logActivity({
      userId: req.user.id,
      action: "update",
      resource: "Product",
      description: `Bulk updated ${result.modifiedCount} products: ${JSON.stringify(allowedUpdates)}`,
    });

    res.status(200).json({
      success: true,
      message: `Updated ${result.modifiedCount} product(s)`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- BULK DELETE (products + their variants) ----------------
export const bulkDeleteProducts = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ApiError(400, "No product IDs provided");
    }

    await ProductVariant.deleteMany({ product: { $in: ids } }, { session });
    const result = await Product.deleteMany({ _id: { $in: ids } }, { session });

    await session.commitTransaction();

    await logActivity({
      userId: req.user.id,
      action: "delete",
      resource: "Product",
      description: `Bulk deleted ${result.deletedCount} products and their variants`,
    });

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} product(s)`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    await session.abortTransaction();
    return next(err);
  } finally {
    session.endSession();
  }
};

