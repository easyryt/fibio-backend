import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { getCustomerAuthHandler } from "./config/customerAuth.js";

// Admin routes
import authRoutes from "./routes/admin/auth.routes.js";
import brandRoutes from "./routes/admin/brand.routes.js";
import categoryRoutes from "./routes/admin/category.routes.js";
import productRoutes from "./routes/admin/product.routes.js";
import dashboardRoutes from "./routes/admin/dashboard.routes.js";
import imageRoutes from "./routes/admin/image.routes.js";
import inventoryRoutes from "./routes/admin/inventory.routes.js";
import userRoutes from "./routes/admin/user.routes.js";
import bannerRoutes from "./routes/admin/banner.routes.js";

// Customer routes
import publicRoutes from "./routes/customer/public.routes.js";
import cartRoutes from "./routes/customer/cart.routes.js";
import wishlistRoutes from "./routes/customer/wishlist.routes.js";

import { errorHandler, notFound } from "./middleware/error.middleware.js";

const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedFrontendUrls = (process.env.FRONTEND_URL || "")
        .split(",")
        .map((url) => url.trim().replace(/\/$/, ""))
        .filter(Boolean);

      const normalizedOrigin = origin.replace(/\/$/, "");

      const isAllowed = allowedFrontendUrls.includes(normalizedOrigin);

      if (isAllowed) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

// Rate limiter for customer auth endpoints — 10 attempts per 15-minute window
const customerAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { success: false, message: "Too many authentication attempts, please try again later" },
});

// Apply rate limiting to critical customer auth entrypoints
app.use("/api/v1/customers/auth/phone-number/send-otp", customerAuthLimiter);
app.use("/api/v1/customers/auth/phone-number/verify", customerAuthLimiter);
app.use("/api/v1/customers/auth/sign-up/email", customerAuthLimiter);
app.use("/api/v1/customers/auth/sign-in/email", customerAuthLimiter);
app.use("/api/v1/customers/auth/sign-in/phone-number", customerAuthLimiter);

// Mount Better Auth customer auth handler lazily per-request (BEFORE express.json for raw request stream processing)
app.all("/api/v1/customers/auth/*splat", (req, res, next) => {
  return getCustomerAuthHandler()(req, res, next);
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// ---- Admin routes ----
app.use("/api/auth", authRoutes);
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/users", userRoutes);
app.use("/api/banners", bannerRoutes);

// ---- Customer routes ----
app.use("/api/customers/cart", cartRoutes);
app.use("/api/customers/wishlist", wishlistRoutes);
app.use("/api/public", publicRoutes);

// Global error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;
