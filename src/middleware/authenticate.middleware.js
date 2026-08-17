import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import ApiError from "../utils/apiError.js";

export const authenticate = (req, res, next) => {
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

    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return next(new ApiError(401, "Access token expired"));
    }
    if (err.name === "JsonWebTokenError") {
      return next(new ApiError(401, "Invalid token"));
    }
    next(err);
  }
};