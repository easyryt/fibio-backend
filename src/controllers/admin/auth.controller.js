import User from "../../models/admin/user.model.js";
import RefreshToken from "../../models/admin/refreshToken.model.js";
import { generateAccessToken, generateRefreshToken, getRefreshTokenExpiryDate } from "../../utils/token.js";
import ApiError from "../../utils/apiError.js";
import { config } from "../../config/config.js";

const ADMIN_COOKIE_NAME = "refreshToken";

const adminCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};


// ---------------- REGISTER (Super Admin only) ----------------
export const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ApiError(409, "Email already in use");
    }

    const user = await User.create({ name, email, password, role });

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- LOGIN ----------------
export const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user) throw new ApiError(401, "Invalid email or password");
    if (!user.isActive) throw new ApiError(403, "This account has been deactivated");

    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new ApiError(401, "Invalid email or password");

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();

    // Revoke all previous active tokens for this user before issuing a new one.
    // This prevents stale cookies from other sessions from breaking future refreshes.
    await RefreshToken.updateMany({ user: user._id, revoked: false }, { revoked: true });

    await RefreshToken.create({
      user: user._id,
      token: refreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });

    user.lastLogin = new Date();
    await user.save();

    res.cookie(ADMIN_COOKIE_NAME, refreshToken, adminCookieOptions);

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken,
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
      },
    });
  } catch (err) {
    next(err);
  }
};

// ---------------- LOGOUT ----------------
export const logout = async (req, res, next) => {
  try {
    const rawToken = req.cookies[ADMIN_COOKIE_NAME];

    if (rawToken) {
      await RefreshToken.findOneAndUpdate({ token: rawToken }, { revoked: true });
    }

    res.clearCookie(ADMIN_COOKIE_NAME);
    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

// ---------------- REFRESH ----------------
export const refresh = async (req, res, next) => {
  try {
    const rawToken = req.cookies[ADMIN_COOKIE_NAME];
    if (!rawToken) throw new ApiError(401, "No refresh token provided");

    const storedToken = await RefreshToken.findOne({ token: rawToken });
    if (!storedToken || storedToken.revoked) {
      throw new ApiError(401, "Invalid or revoked refresh token");
    }
    if (storedToken.expiresAt < new Date()) {
      throw new ApiError(401, "Refresh token expired, please log in again");
    }

    const user = await User.findById(storedToken.user);
    if (!user || !user.isActive) {
      throw new ApiError(401, "User not found or inactive");
    }

    // Rotate the refresh token: revoke the old one and issue a brand new one.
    // Without rotation, a revoked or leaked token permanently breaks the session.
    storedToken.revoked = true;
    await storedToken.save();

    const newRefreshToken = generateRefreshToken();
    await RefreshToken.create({
      user: user._id,
      token: newRefreshToken,
      expiresAt: getRefreshTokenExpiryDate(),
    });

    res.cookie(ADMIN_COOKIE_NAME, newRefreshToken, adminCookieOptions);

    const newAccessToken = generateAccessToken(user);

    res.status(200).json({
      success: true,
      data: { accessToken: newAccessToken },
    });
  } catch (err) {
    next(err);
  }
};
