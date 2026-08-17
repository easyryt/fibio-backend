import User from "../../models/admin/user.model.js";
import ApiError from "../../utils/apiError.js";
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
    if (search) filter.name = { $regex: search, $options: "i" };

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: users,
      pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) },
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
    const updates = { ...req.body };

    // prevent a Super Admin from demoting/deactivating themselves
    if (req.params.id === req.user.id && (updates.role || updates.isActive === false)) {
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
    if (req.params.id === req.user.id) {
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
