import mongoose from "mongoose";
import Product from "../../models/admin/product.model.js";
import ProductVariant from "../../models/admin/productVariant.model.js";
import Category from "../../models/admin/category.model.js";
import { Banner } from "../../models/admin/banner.model.js";
import { DEFAULT_BANNERS } from "../admin/banner.controller.js";
import ApiError from "../../utils/apiError.js";

// ---------------- GET /api/public/products ----------------
// Browsable product list — active products only, trimmed shape.
export const getPublicProducts = async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 20, sort, minPrice, maxPrice } = req.query;

    // Always restrict to active products
    const filter = { status: "active" };

    if (category) {
      // Find target category + all its subcategory IDs recursively
      const allCategories = await Category.find({ isActive: true }).select("_id parent slug");
      const target = allCategories.find(
        (c) => c._id.toString() === category || c.slug === category
      );

      if (target) {
        const categoryIds = [target._id];
        const queue = [target._id.toString()];
        while (queue.length > 0) {
          const parentId = queue.shift();
          const children = allCategories.filter(
            (c) => c.parent && c.parent.toString() === parentId
          );
          for (const child of children) {
            categoryIds.push(child._id);
            queue.push(child._id.toString());
          }
        }
        filter.category = { $in: categoryIds };
      } else if (mongoose.Types.ObjectId.isValid(category)) {
        filter.category = category;
      } else {
        // Unknown category slug or non-existent category -> Return 0 products cleanly!
        return res.status(200).json({
          success: true,
          data: [],
          pagination: {
            total: 0,
            page: Number(page),
            pages: 0,
          },
        });
      }
    }

    if (search) filter.name = { $regex: search, $options: "i" };

    // Price range filtering via variants
    if (minPrice || maxPrice) {
      const priceQuery = {};
      if (minPrice) priceQuery.$gte = Number(minPrice);
      if (maxPrice) priceQuery.$lte = Number(maxPrice);

      const matchingVariants = await ProductVariant.find(
        { price: priceQuery },
        "product"
      );
      const matchedProductIds = [...new Set(matchingVariants.map((v) => v.product.toString()))];
      filter._id = { $in: matchedProductIds };
    }

    // Sort mapping
    let sortOption = { createdAt: -1 }; // default: newest
    if (sort === "featured") sortOption = { featured: -1, createdAt: -1 };
    else if (sort === "price_asc") sortOption = { "variants.price": 1 };
    else if (sort === "price_desc") sortOption = { "variants.price": -1 };
    // "newest" is already the default above

    const skip = (Number(page) - 1) * Number(limit);

    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("brand", "name")
        .populate("category", "name")
        .sort(sortOption)
        .skip(skip)
        .limit(Number(limit))
        .select("name slug description images brand category featured"),
      Product.countDocuments(filter),
    ]);

    // Fetch variants for the returned products (trimmed: price, salePrice, stock only)
    const productIds = products.map((p) => p._id);
    const allVariants = await ProductVariant.find(
      { product: { $in: productIds } },
      "product price salePrice stock"
    );

    // Group variants by product id
    const variantMap = {};
    for (const v of allVariants) {
      const key = v.product.toString();
      if (!variantMap[key]) variantMap[key] = [];
      variantMap[key].push({
        price: v.price,
        salePrice: v.salePrice,
        stock: v.stock,
      });
    }

    const data = products.map((p) => {
      const obj = p.toObject();
      return {
        _id: obj._id,
        name: obj.name,
        slug: obj.slug,
        description: obj.description,
        images: (obj.images || []).map((img) => ({ url: img.url })),
        brand: obj.brand ? { name: obj.brand.name } : null,
        category: obj.category ? { name: obj.category.name } : null,
        featured: obj.featured,
        variants: variantMap[obj._id.toString()] || [],
      };
    });

    res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- GET /api/public/products/:slug ----------------
// Single active product by slug — full detail for a product page.
export const getPublicProductBySlug = async (req, res, next) => {
  try {
    const product = await Product.findOne({ slug: req.params.slug })
      .populate("brand", "name")
      .populate("category", "_id name")
      .select("-seoTitle -seoDescription");

    // 404 for missing or non-active products (don't leak draft/archived)
    if (!product || product.status !== "active") {
      throw new ApiError(404, "Product not found");
    }

    const variants = await ProductVariant.find(
      { product: product._id },
      "sku price salePrice stock images options"
    );

    // Strip fileId from variant images — only url is needed publicly
    const trimmedVariants = variants.map((v) => {
      const vo = v.toObject();
      return {
        _id: vo._id, // needed by the cart endpoint (addToCart sends variantId)
        sku: vo.sku,
        price: vo.price,
        salePrice: vo.salePrice,
        stock: vo.stock,
        images: (vo.images || []).map((img) => ({ url: img.url })),
        options: vo.options,
      };
    });

    const obj = product.toObject();
    const data = {
      _id: obj._id,
      name: obj.name,
      slug: obj.slug,
      description: obj.description,
      images: (obj.images || []).map((img) => ({ url: img.url })),
      brand: obj.brand ? { name: obj.brand.name } : null,
      category: obj.category ? { _id: obj.category._id, name: obj.category.name } : null,
      featured: obj.featured,
      optionTypes: obj.optionTypes,
      variants: trimmedVariants,
    };

    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ---------------- GET /api/public/categories ----------------
// All active categories as a flat array with parent populated as { _id, name }.
export const getPublicCategories = async (req, res, next) => {
  try {
    const categories = await Category.find({ isActive: true })
      .populate("parent", "_id name")
      .sort({ name: 1 });

    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

// ---------------- GET /api/public/search/suggestions ----------------
// Fast autocomplete suggestions for product names and category names
export const getPublicSearchSuggestions = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== "string" || q.trim().length < 2) {
      return res.status(200).json({
        success: true,
        data: { products: [], categories: [] },
      });
    }

    const searchTerm = q.trim();
    const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

    const [products, categories] = await Promise.all([
      Product.find({ status: "active", name: regex })
        .populate("category", "name slug")
        .select("name slug images category")
        .limit(6),
      Category.find({ isActive: true, name: regex })
        .populate("parent", "name slug")
        .select("name slug parent")
        .limit(5),
    ]);

    const productIds = products.map((p) => p._id);
    const variants = await ProductVariant.find({ product: { $in: productIds } }, "product price salePrice");
    const priceMap = {};
    for (const v of variants) {
      const pid = v.product.toString();
      const p = v.salePrice || v.price;
      if (!priceMap[pid] || p < priceMap[pid]) {
        priceMap[pid] = p;
      }
    }

    const formattedProducts = products.map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      image: p.images?.[0]?.url || null,
      categoryName: p.category?.name || null,
      price: priceMap[p._id.toString()] || null,
    }));

    const formattedCategories = categories.map((c) => ({
      _id: c._id,
      name: c.name,
      slug: c.slug || c._id,
      parentName: c.parent?.name || null,
    }));

    res.status(200).json({
      success: true,
      data: {
        products: formattedProducts,
        categories: formattedCategories,
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- GET /api/public/banners ----------------
// Returns active banner configurations for the storefront
export const getPublicBanners = async (req, res, next) => {
  try {
    const dbBanners = await Banner.find({ isActive: true }).lean();
    const bannerMap = {};

    dbBanners.forEach((b) => {
      bannerMap[b.key] = b;
    });

    const keys = ["hero", "secondary-left", "secondary-right", "bottom"];
    const result = {};

    keys.forEach((key) => {
      if (bannerMap[key]) {
        result[key] = {
          ...DEFAULT_BANNERS[key],
          ...bannerMap[key],
          image: bannerMap[key].image?.url ? bannerMap[key].image : DEFAULT_BANNERS[key].image,
        };
      } else {
        result[key] = DEFAULT_BANNERS[key];
      }
    });

    res.status(200).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};


