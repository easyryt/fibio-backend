import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/user.model.js";
import { config } from "../config/config.js";

dotenv.config();

const seedSuperAdmin = async () => {
  try {
    await mongoose.connect(config.mongodbUri); // adjust to match your actual config key

    const existing = await User.findOne({ email: "admin@example.com" });
    if (existing) {
      console.log("Super Admin already exists. Aborting.");
      process.exit(0);
    }

    const admin = await User.create({
      name: "Super Admin",
      email: "admin@example.com",
      password: "123456!", // pre-save hook will hash this automatically
      role: "super_admin",
    });

    console.log("✅ Super Admin created:", admin.email);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    process.exit(1);
  }
};

seedSuperAdmin();