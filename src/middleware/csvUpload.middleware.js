import multer from "multer";
import ApiError from "../utils/apiError.js";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["text/csv", "application/vnd.ms-excel"];
  if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith(".csv")) {
    cb(null, true);
  } else {
    cb(new ApiError(400, "Only CSV files are allowed"), false);
  }
};

export const csvUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});