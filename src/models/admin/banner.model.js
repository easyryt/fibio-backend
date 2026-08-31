import mongoose from "mongoose";

const heroSlideSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: "",
    },
    image: {
      url: { type: String, default: "" },
      fileId: { type: String, default: "" },
    },
    href: {
      type: String,
      default: "",
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { _id: true }
);

const bannerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Banner key is required"],
      unique: true,
      trim: true,
      enum: ["hero", "bottom", "budget"],
    },
    slides: {
      type: [heroSlideSchema],
      default: undefined,
    },
    title: {
      type: String,
      default: "",
    },
    subtitle: {
      type: String,
      default: "",
    },
    image: {
      url: { type: String, default: "" },
      fileId: { type: String, default: "" },
    },
    href: {
      type: String,
      default: "",
    },
    ctaText: {
      type: String,
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const Banner = mongoose.model("Banner", bannerSchema);
