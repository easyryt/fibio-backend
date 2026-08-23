import Customer from "../../models/customer/customer.model.js";
import CustomerRefreshToken from "../../models/customer/customerRefreshToken.model.js";
import {
  generateCustomerAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiryDate,
} from "../../utils/token.js";
import ApiError from "../../utils/apiError.js";

const COOKIE_NAME = "customerRefreshToken";

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ---------------- REGISTER ----------------
export const registerCustomer = async (req, res, next) => {
  try {
    const { name, email, password, phone } = req.body;

    const existing = await Customer.findOne({ email });
    if (existing) {
      throw new ApiError(409, "Email already in use");
    }

    // password hashing is handled by the pre-save hook on the Customer model
    const customer = await Customer.create({ name, email, password, phone });

    // Immediately log the new customer in (unlike seller register)
    const accessToken = generateCustomerAccessToken(customer);
    const refreshToken = generateRefreshToken();

    await CustomerRefreshToken.create({
      customer: customer._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });

    customer.lastLogin = new Date();
    await customer.save();

    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);

    res.status(201).json({
      success: true,
      message: "Registration successful",
      data: {
        accessToken,
        user: { id: customer._id, name: customer.name, email: customer.email },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- LOGIN ----------------
export const loginCustomer = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const customer = await Customer.findOne({ email }).select("+password");
    if (!customer) throw new ApiError(401, "Invalid email or password");
    if (!customer.isActive)
      throw new ApiError(403, "This account has been deactivated");

    const isMatch = await customer.comparePassword(password);
    if (!isMatch) throw new ApiError(401, "Invalid email or password");

    const accessToken = generateCustomerAccessToken(customer);
    const refreshToken = generateRefreshToken();

    await CustomerRefreshToken.create({
      customer: customer._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });

    customer.lastLogin = new Date();
    await customer.save();

    res.cookie(COOKIE_NAME, refreshToken, cookieOptions);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user: { id: customer._id, name: customer.name, email: customer.email },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- REFRESH ----------------
export const refreshCustomer = async (req, res, next) => {
  try {
    const rawToken = req.cookies[COOKIE_NAME];
    if (!rawToken) throw new ApiError(401, "No refresh token provided");

    const storedToken = await CustomerRefreshToken.findOne({
      token: rawToken,
    });
    if (!storedToken || storedToken.revoked) {
      throw new ApiError(401, "Invalid or revoked refresh token");
    }
    if (storedToken.expiresAt < new Date()) {
      throw new ApiError(401, "Refresh token expired, please log in again");
    }

    const customer = await Customer.findById(storedToken.customer);
    if (!customer || !customer.isActive) {
      throw new ApiError(401, "Customer not found or inactive");
    }

    const newAccessToken = generateCustomerAccessToken(customer);

    res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
        user: { id: customer._id, name: customer.name, email: customer.email },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- LOGOUT ----------------
export const logoutCustomer = async (req, res, next) => {
  try {
    const rawToken = req.cookies[COOKIE_NAME];

    if (rawToken) {
      await CustomerRefreshToken.findOneAndUpdate(
        { token: rawToken },
        { revoked: true }
      );
    }

    res.clearCookie(COOKIE_NAME);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

// ---------------- GET ME (protected) ----------------
export const getMeCustomer = async (req, res, next) => {
  try {
    // req.customer.id is set by authenticateCustomer middleware
    const customer = await Customer.findById(req.customer.id);
    if (!customer) throw new ApiError(404, "Customer not found");

    res.status(200).json({
      success: true,
      data: { customer },
    });
  } catch (err) {
    next(err);
  }
};
