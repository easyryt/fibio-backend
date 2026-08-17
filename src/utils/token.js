import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/config.js";

export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, name: user.name },
    config.jwtSecret.secret,
    { expiresIn: config.jwtSecret.accessExpiry }
  );
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex");
};

export const generateCustomerAccessToken = (customer) => {
  return jwt.sign(
    { id: customer._id, name: customer.name, type: "customer" },
    config.jwtSecret.secret,
    { expiresIn: config.jwtSecret.accessExpiry }
  );
};