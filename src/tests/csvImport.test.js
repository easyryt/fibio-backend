
 import request from "supertest";
import { jest } from "@jest/globals";
import app from "../app.js";
import User from "../models/admin/user.model.js";
import Category from "../models/admin/category.model.js";
import Brand from "../models/admin/brand.model.js";
import Product from "../models/admin/product.model.js";
import ProductVariant from "../models/admin/productVariant.model.js";
import ImportJob from "../models/admin/importJob.model.js";
import imagekit from "../utils/imagekit.js";
import { connectTestDB, closeTestDB, clearTestDB } from "./setup.js";

let adminToken;

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await closeTestDB();
});

beforeEach(async () => {
  await User.create({ name: "Admin", email: "admin@test.com", password: "Test1234!", role: "admin" });

  const loginRes = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@test.com", password: "Test1234!" });

  adminToken = loginRes.body.data.accessToken;
});

const validCsv = `Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description
Red Cap,red-cap,A nice cap,Nike,Apparel > Headwear,CAP-RED-001,111,Color,Red,499,,20,150,Red Cap - Nike,Buy a red cap
`;

const missingColumnsCsv = `Name,Handle,Cost
Something,something,10
`;

const invalidRowCsv = `Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description
Bad Product,bad-product,No price here,Nike,Apparel > Headwear,,111,Color,Red,,,,150,,
`;

describe("POST /api/products/import/preview", () => {
  it("groups rows and returns a valid product", async () => {
    const res = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    expect(res.status).toBe(200);
    expect(res.body.data.totalProducts).toBe(1);
    expect(res.body.data.validCount).toBe(1);
    expect(res.body.data.products[0].variants).toHaveLength(1);
    expect(res.body.data.products[0].valid).toBe(true);
  });

  it("rejects a CSV missing required columns", async () => {
    const res = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(missingColumnsCsv), "test.csv");

    expect(res.status).toBe(400);
  });

  it("flags a row with missing SKU/Price as invalid, not the whole request", async () => {
    const res = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(invalidRowCsv), "test.csv");

    expect(res.status).toBe(200);
    expect(res.body.data.products[0].valid).toBe(false);
    expect(res.body.data.invalidCount).toBe(1);
  });

  it("rejects with no file attached", async () => {
    const res = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe("POST /api/products/import/confirm", () => {
  it("imports valid products, creating category/brand that didn't exist", async () => {
    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(1);

    const products = await Product.find();
    expect(products).toHaveLength(1);
    expect(products[0].status).toBe("draft");

    const brand = await Brand.findOne({ name: "Nike" });
    expect(brand).not.toBeNull();
  });

  it("skips rows marked invalid instead of importing them", async () => {
    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(invalidRowCsv), "test.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    expect(confirmRes.body.data.successCount).toBe(0);
    expect(confirmRes.body.data.skippedCount).toBe(1);

    const products = await Product.find();
    expect(products).toHaveLength(0);
  });

  it("reuses an existing brand/category instead of duplicating", async () => {
    await Category.create({ name: "Apparel", slug: "apparel" });
    const apparel = await Category.findOne({ slug: "apparel" });
    await Category.create({ name: "Headwear", slug: "headwear", parent: apparel._id });
    await Brand.create({ name: "Nike", slug: "nike" });

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    expect(previewRes.body.data.products[0].product.brandResolved).toBe(true);
    expect(previewRes.body.data.products[0].product.categoryResolved).toBe(true);

    await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    const brands = await Brand.find({ name: "Nike" });
    expect(brands).toHaveLength(1); // not duplicated
  });

  it("reuses an existing category when CSV casing differs from DB (case-insensitive match)", async () => {
    // DB has "APPAREL" and "HEADWEAR" (all-caps) — CSV has "Apparel > Headwear" (title-case)
    await Category.create({ name: "APPAREL", slug: "apparel" });
    const apparel = await Category.findOne({ slug: "apparel" });
    await Category.create({ name: "HEADWEAR", slug: "headwear", parent: apparel._id });
    await Brand.create({ name: "Nike", slug: "nike" });

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    // Preview should resolve the category despite case mismatch
    expect(previewRes.body.data.products[0].product.categoryResolved).toBe(true);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(1);

    // No extra categories should have been created — still exactly 2
    const categories = await Category.find();
    expect(categories).toHaveLength(2);
  });

  it("reuses an existing brand when CSV casing differs from DB (case-insensitive match)", async () => {
    // DB has "NIKE" (all-caps) — CSV has "Nike" (title-case)
    await Category.create({ name: "Apparel", slug: "apparel" });
    const apparel = await Category.findOne({ slug: "apparel" });
    await Category.create({ name: "Headwear", slug: "headwear", parent: apparel._id });
    await Brand.create({ name: "NIKE", slug: "nike" });

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    // Preview should mark brand as resolved despite case mismatch
    expect(previewRes.body.data.products[0].product.brandResolved).toBe(true);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(1);

    // No duplicate brand created — still exactly 1
    const brands = await Brand.find();
    expect(brands).toHaveLength(1);
  });

  it("resolves every level of a multi-level category path case-insensitively", async () => {
    // Simulate: first import created "APPAREL" and "HEADWEAR" with those exact names.
    // Second import CSV sends "apparel > headwear" (all lowercase).
    // Both root AND child levels must be matched CI — not just the leaf.
    await Category.create({ name: "APPAREL", slug: "apparel" });
    const apparel = await Category.findOne({ slug: "apparel" });
    await Category.create({ name: "HEADWEAR", slug: "headwear", parent: apparel._id });
    await Brand.create({ name: "Nike", slug: "nike" });

    // CSV uses all-lowercase at both levels
    const lowercaseCategoryCsv = [
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description",
      "Blue Cap,blue-cap,Another cap,Nike,apparel > headwear,CAP-BLUE-001,222,Color,Blue,399,,10,100,Blue Cap,A blue cap",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(lowercaseCategoryCsv), "lowercase.csv");

    expect(previewRes.status).toBe(200);
    // Both levels must be resolved even though casing differs at both root and child
    expect(previewRes.body.data.products[0].product.categoryResolved).toBe(true);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "lowercase.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(1);

    // Still only 2 categories in total — no duplicates at either level
    const categories = await Category.find();
    expect(categories).toHaveLength(2);
  });

  it("handles two products in the same CSV sharing a category under different casing (intra-CSV)", async () => {
    // No pre-existing DB data — the category is created by the first product,
    // and must be found (not re-created) by the second product's row.
    // First product uses "Apparel > Headwear", second uses "APPAREL > HEADWEAR".
    // The CI find inside the transaction must read the first product's
    // newly-created category before attempting a second create.
    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description";
    const intraCsv = [
      header,
      "Red Cap,red-cap,A cap,Nike,Apparel > Headwear,CAP-RED-001,111,Color,Red,499,,10,100,,",
      "Blue Cap,blue-cap,Another cap,Nike,APPAREL > HEADWEAR,CAP-BLUE-001,222,Color,Blue,399,,10,100,,",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(intraCsv), "intra.csv");

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.totalProducts).toBe(2);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "intra.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(2);

    // Only 2 categories total — "Apparel" and "Headwear", not 4
    const categories = await Category.find();
    expect(categories).toHaveLength(2);
  });

  it("handles two products in the same CSV sharing a brand under different casing (intra-CSV)", async () => {
    // First product vendor is "Nike", second is "NIKE".
    // The CI find inside the transaction must read the first product's
    // newly-created brand before attempting a second create.
    await Category.create({ name: "Apparel", slug: "apparel" });
    const apparel = await Category.findOne({ slug: "apparel" });
    await Category.create({ name: "Headwear", slug: "headwear", parent: apparel._id });

    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description";
    const intraCsv = [
      header,
      "Red Cap,red-cap,A cap,Nike,Apparel > Headwear,CAP-RED-001,111,Color,Red,499,,10,100,,",
      "Blue Cap,blue-cap,Another cap,NIKE,Apparel > Headwear,CAP-BLUE-001,222,Color,Blue,399,,10,100,,",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(intraCsv), "intra-brand.csv");

    expect(previewRes.status).toBe(200);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "intra-brand.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(2);

    // Only 1 brand — "Nike", not 2
    const brands = await Brand.find();
    expect(brands).toHaveLength(1);
  });

  it("creates a child category with a disambiguated slug when a same-named category exists elsewhere in the tree", async () => {
    // Root "Clothing" already exists (slug: "clothing").
    // CSV imports "Apparel > Clothing" — a legitimate different category
    // (different parent) that happens to share the name "Clothing".
    // generateUniqueSlug must produce "clothing-2" for the nested one
    // instead of colliding on the unique slug index with E11000.
    await Category.create({ name: "Clothing", slug: "clothing" });
    await Brand.create({ name: "Nike", slug: "nike" });

    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description";
    const csv = [
      header,
      "Blue Shirt,blue-shirt,A shirt,Nike,Apparel > Clothing,SHIRT-BLUE-001,333,Color,Blue,299,,5,200,,",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "tree.csv");

    expect(previewRes.status).toBe(200);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "tree.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.successCount).toBe(1);

    // 3 categories total: pre-existing "Clothing" (slug: "clothing"),
    // newly-created "Apparel" (slug: "apparel"), and nested "Clothing"
    // with a disambiguated slug ("clothing-2").
    const categories = await Category.find().sort({ slug: 1 });
    expect(categories).toHaveLength(3);
    const slugs = categories.map((c) => c.slug).sort();
    expect(slugs).toContain("clothing");
    expect(slugs).toContain("clothing-2");
    expect(slugs).toContain("apparel");
  });

  it("uploads product-level image URL to ImageKit and stores source: imagekit and fileId", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => Buffer.from("fake-image-bytes"),
    });

    const uploadSpy = jest.spyOn(imagekit, "upload").mockResolvedValue({
      url: "https://ik.imagekit.io/test/uploaded-img.jpg",
      fileId: "file_ik_999",
    });

    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description,Image Src,Image position,Image alt text";
    const csv = [
      header,
      "Red Cap,red-cap,A cap,Nike,Apparel > Headwear,CAP-RED-001,111,Color,Red,499,,20,150,,,https://cdn.example.com/red-cap.jpg,1,Red cap image",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "img.csv");

    expect(previewRes.status).toBe(200);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "img.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);

    const product = await Product.findOne({ slug: "red-cap" });
    expect(product.images).toHaveLength(1);
    expect(product.images[0].url).toBe("https://ik.imagekit.io/test/uploaded-img.jpg");
    expect(product.images[0].fileId).toBe("file_ik_999");
    expect(product.images[0].source).toBe("imagekit");

    fetchSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  it("falls back to storing external image URL when ImageKit upload fails", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
      headers: new Headers(),
    });

    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description,Image Src,Image position,Image alt text";
    const csv = [
      header,
      "Blue Cap,blue-cap,A cap,Nike,Apparel > Headwear,CAP-BLUE-001,111,Color,Blue,499,,20,150,,,https://cdn.example.com/dead-image.jpg,1,Dead cap image",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "dead.csv");

    expect(previewRes.status).toBe(200);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "dead.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.errors).toContain(
      "Image at https://cdn.example.com/dead-image.jpg could not be re-uploaded to ImageKit, stored as an external link instead"
    );

    const product = await Product.findOne({ slug: "blue-cap" });
    expect(product.images).toHaveLength(1);
    expect(product.images[0].url).toBe("https://cdn.example.com/dead-image.jpg");
    expect(product.images[0].fileId).toBeNull();
    expect(product.images[0].source).toBe("external");

    fetchSpy.mockRestore();
  });

  it("handles variant-level Variant Image column", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => Buffer.from("fake-image-bytes"),
    });

    const uploadSpy = jest.spyOn(imagekit, "upload").mockResolvedValue({
      url: "https://ik.imagekit.io/test/uploaded-var-img.jpg",
      fileId: "var_ik_777",
    });

    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description,Image Src,Image position,Image alt text,Variant Image";
    const csv = [
      header,
      "Green Cap,green-cap,A cap,Nike,Apparel > Headwear,CAP-GRN-001,111,Color,Green,499,,20,150,,,,,,https://cdn.example.com/variant-green.jpg",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "var-img.csv");

    expect(previewRes.status).toBe(200);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "var-img.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);

    const variant = await ProductVariant.findOne({ sku: "CAP-GRN-001" });
    expect(variant.images).toHaveLength(1);
    fetchSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  it("extracts category image URL from CSV, uploads to ImageKit, and attaches it to the created category", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => Buffer.from("fake-image-bytes"),
    });

    const uploadSpy = jest.spyOn(imagekit, "upload").mockResolvedValue({
      url: "https://ik.imagekit.io/test/uploaded-cat-img.jpg",
      fileId: "cat_ik_888",
    });

    const header =
      "Title,URL handle,Description,Vendor,Product category,Category image URL,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description";
    const csv = [
      header,
      "Yellow Cap,yellow-cap,A cap,Nike,Apparel > Headwear,https://cdn.example.com/headwear-banner.jpg,CAP-YEL-001,111,Color,Yellow,499,,20,150,,",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "cat-img.csv");

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.products[0].product.categoryImage).toBe(
      "https://cdn.example.com/headwear-banner.jpg"
    );

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "cat-img.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);

    const category = await Category.findOne({ name: "Apparel" });
    expect(category).not.toBeNull();
    expect(category.image.url).toBe("https://ik.imagekit.io/test/uploaded-cat-img.jpg");
    expect(category.image.fileId).toBe("cat_ik_888");

    fetchSpy.mockRestore();
    uploadSpy.mockRestore();
  });

  it("correctly assigns higher price as regular price and lower price as sale price (prevents swapping)", async () => {
    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams)";
    const csv = [
      header,
      "Swapped Price Shoe,swapped-shoe,Desc,Nike,Apparel > Shoes,SKU-SWAP-001,111,Color,Black,4499,5499,10,500",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "swap.csv");

    expect(previewRes.status).toBe(200);
    const variantPreview = previewRes.body.data.products[0].variants[0];
    expect(variantPreview.price).toBe(5499);
    expect(variantPreview.salePrice).toBe(4499);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "swap.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);

    const variant = await ProductVariant.findOne({ sku: "SKU-SWAP-001" });
    expect(variant.price).toBe(5499);
    expect(variant.salePrice).toBe(4499);
  });

  it("parses Cost per item and stores it as costPrice on variant", async () => {
    const header =
      "Title,URL handle,Description,Vendor,Product category,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Cost per item,Inventory quantity";
    const csv = [
      header,
      "Cost Item Jacket,cost-jacket,Desc,Nike,Apparel > Jackets,SKU-COST-001,111,Color,Black,4499,5499,2800,10",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "cost.csv");

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.products[0].variants[0].costPrice).toBe(2800);

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "cost.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    const variant = await ProductVariant.findOne({ sku: "SKU-COST-001" });
    expect(variant.costPrice).toBe(2800);
  });

  it("skips overwriting top-level category image if it already has an image set", async () => {
    // Pre-create parent category with an image
    await Category.create({
      name: "Apparel",
      slug: "apparel",
      image: { url: "https://ik.imagekit.io/existing-parent-img.jpg", fileId: "existing_01" },
    });

    const header =
      "Title,URL handle,Description,Vendor,Product category,Category image URL,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity";
    const csv = [
      header,
      "New Apparel Item,new-apparel-item,Desc,Nike,Apparel > Shirts,https://cdn.example.com/new-apparel-banner.jpg,SKU-CAT-EXIST-01,111,Color,Red,1999,,10",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "exist-cat.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "exist-cat.csv", products: previewRes.body.data.products });

    expect(confirmRes.status).toBe(201);
    expect(confirmRes.body.data.errors).toContain(
      'Top-level category "Apparel" already has an image set; new CSV image link was skipped.'
    );

    const parentCat = await Category.findOne({ name: "Apparel" });
    expect(parentCat.image.url).toBe("https://ik.imagekit.io/existing-parent-img.jpg");
  });
});

describe("POST /api/products/import/:id/rollback", () => {
  it("removes everything a completed import created", async () => {
    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    const importJobId = confirmRes.body.data.importJobId;

    const rollbackRes = await request(app)
      .post(`/api/products/import/${importJobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(rollbackRes.status).toBe(200);

    const products = await Product.find();
    expect(products).toHaveLength(0);

    const job = await ImportJob.findById(importJobId);
    expect(job.status).toBe("rolled_back");
  });

  it("rejects rolling back an already-rolled-back import", async () => {
    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(validCsv), "test.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "test.csv", products: previewRes.body.data.products });

    const importJobId = confirmRes.body.data.importJobId;

    await request(app)
      .post(`/api/products/import/${importJobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`);

    const secondAttempt = await request(app)
      .post(`/api/products/import/${importJobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(secondAttempt.status).toBe(400);
  });

  it("deletes uploaded category and product images from ImageKit during rollback", async () => {
    const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "image/jpeg" }),
      arrayBuffer: async () => Buffer.from("fake-image-bytes"),
    });

    const uploadSpy = jest.spyOn(imagekit, "upload").mockResolvedValue({
      url: "https://ik.imagekit.io/test/uploaded-rollback.jpg",
      fileId: "file_ik_to_delete_001",
    });

    const deleteSpy = jest.spyOn(imagekit, "deleteFile").mockResolvedValue(true);

    const header =
      "Title,URL handle,Description,Vendor,Product category,Category image URL,SKU,Barcode,Option1 name,Option1 value,Price,Compare-at price,Inventory quantity,Weight value (grams),SEO title,SEO description";
    const csv = [
      header,
      "Rollback Product,rollback-prod,Desc,Nike,Apparel > Hats,https://cdn.example.com/hats.jpg,SKU-RB-001,111,Color,Red,100,,10,50,,",
    ].join("\n") + "\n";

    const previewRes = await request(app)
      .post("/api/products/import/preview")
      .set("Authorization", `Bearer ${adminToken}`)
      .attach("file", Buffer.from(csv), "rb.csv");

    const confirmRes = await request(app)
      .post("/api/products/import/confirm")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ fileName: "rb.csv", products: previewRes.body.data.products });

    const importJobId = confirmRes.body.data.importJobId;

    const rollbackRes = await request(app)
      .post(`/api/products/import/${importJobId}/rollback`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(rollbackRes.status).toBe(200);
    expect(deleteSpy).toHaveBeenCalledWith("file_ik_to_delete_001");

    fetchSpy.mockRestore();
    uploadSpy.mockRestore();
    deleteSpy.mockRestore();
  });
});