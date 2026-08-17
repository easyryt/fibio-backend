import Category from "../../models/admin/category.model.js";
import ApiError from "../../utils/apiError.js";
import { generateUniqueSlug } from "../../utils/slugify.js";
import Product from "../../models/admin/product.model.js";
import { logActivity } from "../../utils/activityLogger.js";

export const createCategory = async (req, res, next) => {
  try {
    const { name, parent, isActive, image } = req.body;

    if (parent) {
      const parentExists = await Category.findById(parent);
      if (!parentExists) throw new ApiError(400, "Parent category not found");
    }

    const slug = await generateUniqueSlug(Category, name);

    const category = await Category.create({
      name,
      slug,
      parent: parent || null,
      isActive,
      image: image || { url: "", fileId: "" },
    });

    await logActivity({
      userId: req.user.id,
      action: "create",
      resource: "Category",
      resourceId: category._id,
      description: `Created category: ${category.name}`,
    });

    res.status(201).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

export const getCategories = async (req, res, next) => {
  try {
    const categories = await Category.find().sort({ name: 1 });
    res.status(200).json({ success: true, data: categories });
  } catch (err) {
    next(err);
  }
};

export const getCategoryById = async (req, res, next) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) throw new ApiError(404, "Category not found");

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

export const updateCategory = async (req, res, next) => {
  try {
    const updates = { ...req.body };

    if (updates.parent) {
      if (updates.parent === req.params.id) {
        throw new ApiError(400, "A category cannot be its own parent");
      }
      const parentExists = await Category.findById(updates.parent);
      if (!parentExists) throw new ApiError(400, "Parent category not found");
    }

    if (updates.name) {
      updates.slug = await generateUniqueSlug(Category, updates.name);
    }

    const category = await Category.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!category) throw new ApiError(404, "Category not found");

    await logActivity({
      userId: req.user.id,
      action: "update",
      resource: "Category",
      resourceId: category._id,
      description: `Updated category: ${category.name}`,
    });

    res.status(200).json({ success: true, data: category });
  } catch (err) {
    next(err);
  }
};

export const deleteCategory = async (req, res, next) => {
  try {
    const hasChildren = await Category.exists({ parent: req.params.id });
    if (hasChildren) {
      throw new ApiError(400, "Cannot delete a category that has subcategories");
    }

    const inUse = await Product.exists({ category: req.params.id });
    if (inUse) {
      throw new ApiError(400, "Cannot delete a category that has products assigned to it");
    }

    const categoryToDelete = await Category.findById(req.params.id);
    if (!categoryToDelete) throw new ApiError(404, "Category not found");

    await Category.findByIdAndDelete(req.params.id);

    await logActivity({
      userId: req.user.id,
      action: "delete",
      resource: "Category",
      resourceId: categoryToDelete._id,
      description: `Deleted category: ${categoryToDelete.name}`,
    });

    res.status(200).json({ success: true, message: "Category deleted" });
  } catch (err) {
    next(err);
  }
};
