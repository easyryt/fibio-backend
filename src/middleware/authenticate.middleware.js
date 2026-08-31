import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import ApiError from "../utils/apiError.js";
import User from "../models/admin/user.model.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret.secret);

    // Reject customer tokens — they carry type:"customer" and must only be
    // accepted by authenticateCustomer, not this seller/admin middleware.
    if (decoded.type === "customer") {
      throw new ApiError(401, "Invalid token");
    }

    // Verify the user still exists and is active in the database.
    // Without this check, a deleted or deactivated admin could keep
    // using their access token until it naturally expired.
    const user = await User.findById(decoded.id).select("role isActive");
    if (!user) throw new ApiError(401, "User not found");
    if (!user.isActive) throw new ApiError(403, "Account has been deactivated");

    req.user = { id: user._id.toString(), role: user.role };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new ApiError(401, "Access token expired"));
    }
    if (err.name === "JsonWebTokenError") {
      const message = config.nodeEnv === "development" ? `Invalid token: ${err.message}` : "Invalid token";
      return next(new ApiError(401, message));
    }
    next(err);
  }
};