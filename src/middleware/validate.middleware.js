import ApiError from "../utils/apiError.js";

export const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const message = result.error.issues
        .map((issue) => issue.message)
        .join(", ");
      return next(new ApiError(400, message));
    }

    req.body = result.data; // replace with parsed/cleaned data
    next();
  };
};