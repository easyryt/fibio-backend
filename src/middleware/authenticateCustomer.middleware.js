import jwt from "jsonwebtoken";
import { config } from "../config/config.js";
import ApiError from "../utils/apiError.js";
import Customer from "../models/customer/customer.model.js";

export const authenticateCustomer = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new ApiError(401, "No token provided");
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, config.jwtSecret.secret);

    // Reject tokens that are not specifically customer tokens
    if (decoded.type !== "customer") {
      throw new ApiError(401, "Invalid token type");
    }

    const customer = await Customer.findById(decoded.id);
    if (!customer) {
      throw new ApiError(401, "Customer not found");
    }
    if (!customer.isActive) {
      throw new ApiError(403, "This account has been deactivated");
    }

    req.customer = { id: customer._id, name: customer.name };
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
