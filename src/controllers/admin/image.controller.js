import imagekit from "../../utils/imagekit.js";
import ApiError from "../../utils/apiError.js";

export const uploadImage = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, "No image files provided");
    }

    const results = await Promise.all(
      req.files.map((file) =>
        imagekit.upload({
          file: file.buffer.toString("base64"),
          fileName: file.originalname,
          folder: "/ecommerce-admin/products",
        })
      )
    );

    res.status(201).json({
      success: true,
      data: results.map((result) => ({
        url: result.url,
        fileId: result.fileId,
        name: result.name,
      })),
    });
  } catch (err) {
    next(err);
  }
};
