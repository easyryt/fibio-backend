import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: [true, "Banner key is required"],
      unique: true,
      trim: true,
      enum: ["hero", "secondary-left", "secondary-right", "bottom"],
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
    showGradient: {
      type: Boolean,
      default: true,
    },
    overlayColor: {
      type: String,
      default: "#033936",
    },
    placement: {
      type: String,
      enum: ["left", "right"],
      default: "left",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export const Banner = mongoose.model("Banner", bannerSchema);
