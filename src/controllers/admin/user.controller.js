import User from "../../models/admin/user.model.js";
import ApiError from "../../utils/apiError.js";
import { escapeRegex } from "../../utils/escapeRegex.js";
import { logActivity } from "../../utils/activityLogger.js";
import RefreshToken from "../../models/admin/refreshToken.model.js";

export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) throw new ApiError(404, "User not found");

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const getUsers = async (req, res, next) => {
  try {
    const { role, isActive, search, page = 1, limit = 20 } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === "true";
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    const skip = (Number(page) - 1) * safeLimit;

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: { total, page: Number(page), pages: Math.ceil(total / safeLimit) },
    });
  } catch (err) {
    next(err);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) throw new ApiError(404, "User not found");

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    // Explicit allowlist — only these fields can be changed through this endpoint.
    // Using a spread of req.body would be a latent vulnerability: if a new field
    // (e.g. password) is ever added to the validation schema, findByIdAndUpdate
    // bypasses the pre-save hook and would store it unhashed.
    const { name, role, isActive } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;

    // prevent a Super Admin from demoting/deactivating themselves
    if (String(req.params.id) === String(req.user.id) && (updates.role || updates.isActive === false)) {
      throw new ApiError(400, "You cannot change your own role or deactivate your own account");
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    if (!user) throw new ApiError(404, "User not found");

    await logActivity({
      userId: req.user.id,
      action: "update",
      resource: "User",
      resourceId: user._id,
      description: `Updated user: ${user.name} (${user.email})`,
    });

    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user.id)) {
      throw new ApiError(400, "You cannot delete your own account");
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) throw new ApiError(404, "User not found");

    await RefreshToken.deleteMany({ user: user._id });

    await logActivity({
      userId: req.user.id,
      action: "delete",
      resource: "User",
      resourceId: user._id,
      description: `Deleted user: ${user.name} (${user.email})`,
    });

    res.status(200).json({ success: true, message: "User deleted" });
  } catch (err) {
    next(err);
  }
};
