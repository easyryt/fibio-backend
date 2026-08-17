import mongoose from "mongoose";

const customerRefreshTokenSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revoked: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Mongo auto-deletes the document once expiresAt passes — no cleanup job needed
customerRefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const CustomerRefreshToken = mongoose.model(
  "CustomerRefreshToken",
  customerRefreshTokenSchema
);
export default CustomerRefreshToken;
