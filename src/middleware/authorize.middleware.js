import ApiError from "../utils/apiError.js";

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ApiError(403, "You don't have permission for this action"));
    }
    next();
  };
};