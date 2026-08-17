import Wishlist from "../../models/customer/wishlist.model.js";
import ProductVariant from "../../models/admin/productVariant.model.js";
import Product from "../../models/admin/product.model.js";
import ApiError from "../../utils/apiError.js";

// ── Shared helper: attach lightweight variant data to populated products ──────
async function attachVariants(products) {
  if (!products.length) return products;
  const productIds = products.map((p) => p._id);
  const variants = await ProductVariant.find(
    { product: { $in: productIds } },
    "_id product price salePrice stock"
  );
  const variantMap = {};
  for (const v of variants) {
    const key = v.product.toString();
    if (!variantMap[key]) variantMap[key] = [];
    variantMap[key].push({ _id: v._id, price: v.price, salePrice: v.salePrice, stock: v.stock });
  }
  return products.map((p) => ({
    ...p,
    variants: variantMap[p._id.toString()] || [],
  }));
}

// ── Shared helper: populate + attach variants, return plain object ─────────────
async function populatedWishlist(wishlistId) {
  const doc = await Wishlist.findById(wishlistId).populate(
    "products",
    "name slug images brand category status"
  );
  const obj = doc.toObject();
  obj.products = await attachVariants(obj.products);
  return obj;
}

// ---------------- GET /api/customers/wishlist ----------------
export const getWishlist = async (req, res, next) => {
  try {
    let wishlist = await Wishlist.findOne({ customer: req.customer.id });

    if (!wishlist) {
      // find-or-create: return empty wishlist instead of 404
      wishlist = await Wishlist.create({ customer: req.customer.id, products: [] });
    }

    const data = await populatedWishlist(wishlist._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ---------------- POST /api/customers/wishlist/items ----------------
export const addToWishlist = async (req, res, next) => {
  try {
    const { productId } = req.body;

    const product = await Product.findById(productId);
    if (!product) throw new ApiError(404, "Product not found");
    if (product.status !== "active") throw new ApiError(400, "Product is not available");

    let wishlist = await Wishlist.findOne({ customer: req.customer.id });
    if (!wishlist) {
      wishlist = await Wishlist.create({ customer: req.customer.id, products: [] });
    }

    const alreadyPresent = wishlist.products.some(
      (id) => id.toString() === productId
    );

    if (!alreadyPresent) {
      wishlist.products.push(productId);
      await wishlist.save();
    }

    const data = await populatedWishlist(wishlist._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// ---------------- DELETE /api/customers/wishlist/items/:productId ----------------
export const removeFromWishlist = async (req, res, next) => {
  try {
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ customer: req.customer.id });
    if (!wishlist) throw new ApiError(404, "Wishlist not found");

    wishlist.products = wishlist.products.filter(
      (id) => id.toString() !== productId
    );
    await wishlist.save();

    const data = await populatedWishlist(wishlist._id);
    res.status(200).json({ success: true, data });
  } catch (err) {
    next(err);
  }
};
