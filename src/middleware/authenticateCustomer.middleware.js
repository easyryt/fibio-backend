import { fromNodeHeaders } from "better-auth/node";
import { getCustomerAuth } from "../config/customerAuth.js";
import CustomerProfile from "../models/customer/customer.model.js";
import ApiError from "../utils/apiError.js";

export const authenticateCustomer = async (req, res, next) => {
  try {
    const customerAuth = getCustomerAuth();
    const session = await customerAuth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      throw new ApiError(401, "Unauthorized: Invalid or expired customer session");
    }

    const customerProfile = await CustomerProfile.findOneAndUpdate(
      { authUserId: session.user.id },
      { $setOnInsert: { authUserId: session.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    req.customer = session.user;
    req.customerProfile = customerProfile;
    req.session = session.session;
    next();
  } catch (err) {
    next(err);
  }
};
