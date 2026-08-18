import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Category name is required"],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    image: {
      url: { type: String, default: "" },
      fileId: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

categorySchema.index({ isActive: 1, name: 1 });
categorySchema.index({ parent: 1 });

const Category = mongoose.model("Category", categorySchema);
export default Category;
