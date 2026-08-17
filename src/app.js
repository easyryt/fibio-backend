import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

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
import customerAuthRoutes from "./routes/customer/customerAuth.routes.js";
import publicRoutes from "./routes/customer/public.routes.js";
import cartRoutes from "./routes/customer/cart.routes.js";
import wishlistRoutes from "./routes/customer/wishlist.routes.js";

import { errorHandler, notFound } from './middleware/error.middleware.js';

const app = express();

app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
const allowedFrontendUrl = (process.env.FRONTEND_URL || "").replace(/\/$/, "");

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");

      if (
        !allowedFrontendUrl ||
        normalizedOrigin === allowedFrontendUrl ||
        normalizedOrigin.endsWith(".vercel.app") ||
        normalizedOrigin.includes("localhost")
      ) {
        return callback(null, true);
      }

      return callback(null, true);
    },
    credentials: true,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is healthy',
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
app.use("/api/customers/auth", customerAuthRoutes);
app.use("/api/customers/cart", cartRoutes);
app.use("/api/customers/wishlist", wishlistRoutes);
app.use("/api/public", publicRoutes);


// Global error handling middleware
app.use(notFound);
app.use(errorHandler);

export default app;