import mongoose from "mongoose";

const importJobSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["completed", "failed", "rolled_back"],
      default: "completed",
    },
    totalRows: Number,
    totalProducts: Number,
    successCount: Number,
    skippedCount: Number,
    createdProductIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    createdVariantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant" }],
    createdCategoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
    createdBrandIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Brand" }],
    importErrors: [String],
  },
  { timestamps: true }
);

const ImportJob = mongoose.model("ImportJob", importJobSchema);
export default ImportJob;
