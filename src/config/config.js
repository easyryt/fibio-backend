import dotenv from "dotenv";

dotenv.config();

const requiredEnv = [
  "PORT",
  "MONGO_URI",
  "JWT_SECRET",
  "IMAGEKIT_PUBLIC_KEY",
  "IMAGEKIT_PRIVATE_KEY",
  "IMAGEKIT_URL_ENDPOINT",
  "FRONTEND_URL",
];

for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const config = {
  port: Number(process.env.PORT),
  mongodbUri: process.env.MONGO_URI,
  lowStockThreshold: Number(process.env.LOW_STOCK_THRESHOLD) || 10,
  FRONTEND_URL: process.env.FRONTEND_URL,

  imagekit: {
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  },
  jwtSecret: {
    secret: process.env.JWT_SECRET,
    accessExpiry: "15m",
    refreshExpiry: "7d",
  },
  nodeEnv: process.env.NODE_ENV || "development",
};
