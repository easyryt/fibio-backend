import { Banner } from "../../models/admin/banner.model.js";

export const DEFAULT_BANNERS = {
  hero: {
    key: "hero",
    slides: [
      {
        image: { url: "/banner-1.webp", fileId: "" },
        href: "/category/all",
        order: 1,
        isActive: true,
      },
      {
        image: { url: "/banner-2.webp", fileId: "" },
        href: "/category/all",
        order: 2,
        isActive: true,
      },
      {
        image: { url: "/banner-3.webp", fileId: "" },
        href: "/category/all",
        order: 3,
        isActive: true,
      },
    ],
  },
  bottom: {
    key: "bottom",
    title: "Buying in Bulk?",
    subtitle: "Get special tier discounts, customized tax invoices, and personalized quotations for large wholesale orders.",
    image: { url: "/bottom-banner.webp", fileId: "" },
    href: "/contact-us",
    ctaText: "Request a Quote",
    isActive: true,
  },
};

/**
 * Merges DB banners with DEFAULT_BANNERS.
 * Shared by both admin getAllBanners (filter = {}) and public getPublicBanners (filter = { isActive: true }).
 * @param {Object} filter — Mongoose query filter passed to Banner.find()
 * @returns {Object} banner map keyed by slot name (hero, bottom)
 */
export const mergeBannersWithDefaults = async (filter = {}) => {
  const dbBanners = await Banner.find(filter).lean();
  const bannerMap = {};

  dbBanners.forEach((b) => {
    bannerMap[b.key] = b;
  });

  const keys = ["hero", "bottom"];
  const result = {};

  keys.forEach((key) => {
    if (bannerMap[key]) {
      if (key === "hero") {
        let slides = (bannerMap[key].slides && bannerMap[key].slides.length > 0)
          ? bannerMap[key].slides
          : DEFAULT_BANNERS.hero.slides;

        slides = slides.map((s) => {
          const u = s.image?.url || "";
          if (typeof u === "string" && u.endsWith(".png") && u.startsWith("/")) {
            return { ...s, image: { ...s.image, url: u.replace(/\.png$/, ".webp") } };
          }
          return s;
        });

        // If filtering for public view (filter.isActive), restrict to active slides
        if (filter.isActive) {
          slides = slides.filter((s) => s.isActive !== false);
        }

        result.hero = {
          key: "hero",
          slides: [...slides].sort((a, b) => (a.order || 0) - (b.order || 0)),
        };
      } else {
        let bottomImg = bannerMap[key]?.image?.url ? bannerMap[key].image : DEFAULT_BANNERS[key].image;
        if (typeof bottomImg?.url === "string" && bottomImg.url.endsWith(".png") && bottomImg.url.startsWith("/")) {
          bottomImg = { ...bottomImg, url: bottomImg.url.replace(/\.png$/, ".webp") };
        }

        result[key] = {
          ...DEFAULT_BANNERS[key],
          ...bannerMap[key],
          image: bottomImg,
        };
      }

    } else {
      result[key] = DEFAULT_BANNERS[key];
    }
  });

  return result;
};

/**
 * @desc Get all storefront banners (merged with defaults)
 * @route GET /api/banners
 * @access Private (super_admin, admin, staff)
 */
export const getAllBanners = async (req, res) => {
  try {
    const result = await mergeBannersWithDefaults();

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
 * @desc Update single banner by key (hero or bottom)
 * @route PUT /api/banners/:key
 * @access Private (super_admin, admin only)
 */
export const updateBannerByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const allowedKeys = ["hero", "bottom"];

    if (!allowedKeys.includes(key)) {
      return res.status(400).json({
        success: false,
        message: `Invalid banner key: ${key}`,
      });
    }

    let banner;
    if (key === "hero") {
      const { slides } = req.body;
      if (!Array.isArray(slides)) {
        return res.status(400).json({
          success: false,
          message: "Hero banner requires a slides array",
        });
      }
      if (slides.length > 5) {
        return res.status(400).json({
          success: false,
          message: "Top banner can hold a maximum of 5 banners",
        });
      }

      const formattedSlides = slides.map((s, idx) => ({
        _id: s._id,
        image: {
          url: s.image?.url || "",
          fileId: s.image?.fileId || "",
        },
        href: s.href || "",
        order: Number(s.order) || idx + 1,
        isActive: s.isActive ?? true,
      }));

      banner = await Banner.findOneAndUpdate(
        { key: "hero" },
        { $set: { key: "hero", slides: formattedSlides } },
        { new: true, upsert: true, runValidators: true }
      );
    } else {
      const { title, subtitle, image, href, ctaText, isActive } = req.body;

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (subtitle !== undefined) updateData.subtitle = subtitle;
      if (image !== undefined) updateData.image = image;
      if (href !== undefined) updateData.href = href;
      if (ctaText !== undefined) updateData.ctaText = ctaText;
      if (isActive !== undefined) updateData.isActive = isActive;

      banner = await Banner.findOneAndUpdate(
        { key: "bottom" },
        { $set: updateData },
        { new: true, upsert: true, runValidators: true }
      );
    }

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
