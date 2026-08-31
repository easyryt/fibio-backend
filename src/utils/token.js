import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/config.js";

export const getRefreshTokenExpiryDate = () => {
  const days = parseInt(config.jwtSecret.refreshExpiry); // "7d" -> 7
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

export const generateAccessToken = (user) => {
  return jwt.sign(
    { id: user._id.toString(), role: user.role, name: user.name },
    config.jwtSecret.secret,
    { expiresIn: config.jwtSecret.accessExpiry }
  );
};

export const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString("hex");
};

export const generateCustomerAccessToken = (customer) => {
  return jwt.sign(
    { id: customer._id.toString(), name: customer.name, type: "customer" },
    config.jwtSecret.secret,
    { expiresIn: config.jwtSecret.accessExpiry }
  );
};