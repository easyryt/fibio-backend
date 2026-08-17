import { Banner } from "../../models/admin/banner.model.js";

export const DEFAULT_BANNERS = {
  hero: {
    key: "hero",
    title: "TRUSTED BY MILLIONS",
    subtitle: "Discover trending products, limited-time offers, and everyday essentials at unbeatable wholesale prices.",
    image: { url: "/hero-banner.png", fileId: "" },
    href: "/catalog/all",
    ctaText: "Shop Now",
    showGradient: true,
    overlayColor: "#033936",
    placement: "left",
    isActive: true,
  },
  "secondary-left": {
    key: "secondary-left",
    title: "Jewellery",
    subtitle: "Premium collection for every occasion",
    image: { url: "/secondary-left.png", fileId: "" },
    href: "/catalog/jewellery",
    ctaText: "Explore Now",
    showGradient: true,
    overlayColor: "background",
    placement: "left",
    isActive: true,
  },
  "secondary-right": {
    key: "secondary-right",
    title: "Mobile Accessories",
    subtitle: "Trendy accessories for smart devices",
    image: { url: "/secondary-ryt.png", fileId: "" },
    href: "/catalog/mobile-accessories",
    ctaText: "Explore Now",
    showGradient: true,
    overlayColor: "background",
    placement: "left",
    isActive: true,
  },
  bottom: {
    key: "bottom",
    title: "Buying in Bulk?",
    subtitle: "Get special tier discounts, customized tax invoices, and personalized quotations for large wholesale orders.",
    image: { url: "/bottom-banner.png", fileId: "" },
    href: "/contact-us",
    ctaText: "Request a Quote",
    showGradient: false,
    overlayColor: "#033936",
    placement: "left",
    isActive: true,
  },
};

/**
 * @desc Get all storefront banners (merged with defaults)
 * @route GET /api/banners
 * @access Private (super_admin, admin, staff)
 */
export const getAllBanners = async (req, res) => {
  try {
    const dbBanners = await Banner.find({}).lean();
    const bannerMap = {};

    dbBanners.forEach((b) => {
      bannerMap[b.key] = b;
    });

    const keys = ["hero", "secondary-left", "secondary-right", "bottom"];
    const result = {};

    keys.forEach((key) => {
      if (bannerMap[key]) {
        result[key] = {
          ...DEFAULT_BANNERS[key],
          ...bannerMap[key],
          image: bannerMap[key].image?.url ? bannerMap[key].image : DEFAULT_BANNERS[key].image,
        };
      } else {
        result[key] = DEFAULT_BANNERS[key];
      }
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch banners",
    });
  }
};

/**
 * @desc Update single banner by key
 * @route PUT /api/banners/:key
 * @access Private (super_admin, admin only)
 */
export const updateBannerByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const allowedKeys = ["hero", "secondary-left", "secondary-right", "bottom"];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        message: `Invalid banner key: ${key}`,
      });
    }

    const { title, subtitle, image, href, ctaText, showGradient, overlayColor, placement, isActive } = req.body;

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (subtitle !== undefined) updateData.subtitle = subtitle;
    if (image !== undefined) updateData.image = image;
    if (href !== undefined) updateData.href = href;
    if (ctaText !== undefined) updateData.ctaText = ctaText;
    if (showGradient !== undefined) updateData.showGradient = showGradient;
    if (overlayColor !== undefined) updateData.overlayColor = overlayColor;
    if (placement !== undefined) updateData.placement = placement;
    if (isActive !== undefined) updateData.isActive = isActive;

    const banner = await Banner.findOneAndUpdate(
      { key },
      { $set: updateData },
      { new: true, upsert: true, runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Banner updated successfully",
      data: banner,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update banner",
    });
  }
};
