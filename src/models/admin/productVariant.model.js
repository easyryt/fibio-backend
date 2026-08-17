import mongoose from "mongoose";

const productVariantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    sku: {
      type: String,
      required: [true, "SKU is required"],
      unique: true,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
    },
    options: [
      {
        name: { type: String, required: true }, // e.g. "Size", "Color", "Format"
        value: { type: String, required: true }, // e.g. "Medium", "Red", "PDF"
      },
    ],
    price: {
      type: Number,
      required: [true, "Price is required"],
      min: 0,
    },
    salePrice: {
      type: Number,
      min: 0,
    },
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    weight: {
      value: { type: Number },
      unit: { type: String, enum: ["g", "kg", "lb", "oz"], default: "g" },
    },
    images: {
      type: [
        {
          url: { type: String, required: true },
          fileId: { type: String },
        },
      ],
      default: [],
      validate: {
        validator: (arr) => arr.length <= 4,
        message: "A variant can have at most 4 images",
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const ProductVariant = mongoose.model("ProductVariant", productVariantSchema);
export default ProductVariant;
