import Brand from "../../models/admin/brand.model.js";
import ApiError from "../../utils/apiError.js";
import { generateUniqueSlug } from "../../utils/slugify.js";
import Product from "../../models/admin/product.model.js";
import { logActivity } from "../../utils/activityLogger.js";

export const createBrand = async (req, res, next) => {
  try {
    const { name, logo, isActive } = req.body;

    const slug = await generateUniqueSlug(Brand, name);

    const brand = await Brand.create({ name, slug, logo, isActive });

    await logActivity({
      userId: req.user.id,
      action: "create",
      resource: "Brand",
      resourceId: brand._id,
      description: `Created brand: ${brand.name}`,
    });

    res.status(201).json({ success: true, data: brand });
  } catch (err) {
    next(err);
  }
};

export const getBrands = async (req, res, next) => {
  try {
    const brands = await Brand.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: brands });
  } catch (err) {
    next(err);
  }
};

export const getBrandById = async (req, res, next) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) throw new ApiError(404, "Brand not found");

    res.status(200).json({ success: true, data: brand });
  } catch (err) {
    next(err);
  }
};

export const updateBrand = async (req, res, next) => {
  try {
    const updates = { ...req.body };

    // if name is being changed, regenerate the slug to match
    if (updates.name) {
      updates.slug = await generateUniqueSlug(Brand, updates.name);
    }

    const brand = await Brand.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!brand) throw new ApiError(404, "Brand not found");

    await logActivity({
      userId: req.user.id,
      action: "update",
      resource: "Brand",
      resourceId: brand._id,
      description: `Updated brand: ${brand.name}`,
    });

    res.status(200).json({ success: true, data: brand });
  } catch (err) {
    next(err);
  }
};

export const deleteBrand = async (req, res, next) => {
  try {
    const inUse = await Product.exists({ brand: req.params.id });
    if (inUse) {
      throw new ApiError(400, "Cannot delete a brand that has products assigned to it");
    }

    const brand = await Brand.findByIdAndDelete(req.params.id);
    if (!brand) throw new ApiError(404, "Brand not found");

    await logActivity({
      userId: req.user.id,
      action: "delete",
      resource: "Brand",
      resourceId: brand._id,
      description: `Deleted brand: ${brand.name}`,
    });

    res.status(200).json({ success: true, message: "Brand deleted" });
  } catch (err) {
    next(err);
  }
};
