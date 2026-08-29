# Fibio E-Commerce Backend API Documentation

A high-performance, enterprise-grade Node.js & Express REST API built with MongoDB (Mongoose) powering the Fibio wholesale e-commerce storefront and admin dashboard.

---

## 📋 Table of Contents

- [Key Architecture Highlights](#-key-architecture-highlights)
- [Directory Structure](#-directory-structure)
- [Deep Core Technical Workflows](#-deep-core-technical-workflows)
  - [1. ACID Product & Variant Creation](#1-acid-product--variant-creation)
  - [2. Inventory Movement Ledger Engine](#2-inventory-movement-ledger-engine)
  - [3. Bulk CSV Import Engine Architecture](#3-bulk-csv-import-engine-architecture)
  - [4. Dynamic Storefront Banner Engine](#4-dynamic-storefront-banner-engine)
  - [5. Dual JWT Authentication & RBAC Stack](#5-dual-jwt-authentication--rbac-stack)
- [Detailed Folder & Component Guide](#-detailed-folder--component-guide)
  - [Config (`src/config/`)](#config-srcconfig)
  - [Middleware (`src/middleware/`)](#middleware-srcmiddleware)
  - [Database Models (`src/models/`)](#database-models-srcmodels)
  - [Controllers (`src/controllers/`)](#controllers-srccontrollers)
  - [Validations (`src/validations/`)](#validations-srcvalidations)
  - [Utilities (`src/utils/`)](#utilities-srcutils)
  - [Scripts (`src/scripts/`)](#scripts-srcscripts)
  - [Tests (`src/tests/`)](#tests-srctests)
- [Complete API Route Specifications](#-complete-api-route-specifications)
  - [Admin API Routes (`/api/...`)](#admin-api-routes-api)
  - [Customer & Public API Routes (`/api/public/...` & `/api/customers/...`)](#customer--public-api-routes-apipublic--apicustomers)
- [Standardized JSON Response Schemas](#-standardized-json-response-schemas)
- [Environment Setup & Quick Start](#-environment-setup--quick-start)

---

## 🌟 Key Architecture Highlights

- **Unified JWT Stack**: A single `JWT_SECRET` signs tokens for both Admin Staff and Storefront Customers. Tokens are distinguished by a `type: "customer"` claim embedded in the payload — customer tokens are rejected outright by `authenticate.middleware.js` and vice versa.
- **Dual-User Auth Stack**: Completely separated authentication layers for **Admin Staff** (`super_admin`, `admin`, `staff`) and **Storefront Customers** with short-lived JWT access tokens (15 min) and HTTP-Only opaque refresh tokens stored in MongoDB.
- **Strict Role-Based Access Control (RBAC)**: Declarative permission checking (`authorize("super_admin", "admin")`) guaranteeing read-only access for `staff` users on administrative mutation endpoints.
- **ACID Transactional Inventory Ledger**: Stock changes occur exclusively via `adjustStock()` within Mongoose sessions, appending immutable `InventoryMovement` records (`initial`, `adjustment`, `sale`, `return`, `cancel`) to prevent race conditions.
- **High-Throughput Bulk CSV Import Engine**: Async CSV stream processing with automated header mapping (`csvMapper.js`), category tree matching, variant generation, batching, error logs, and `importJob.model.js` tracking.
- **Dynamic Storefront Banner System**: Configurable banner engine (`banner.model.js`) supporting ImageKit media, direct URLs, custom gradient color overlays, and placement controls with zero-downtime default fallbacks.
- **Zod Request Validation Layer**: All mutating endpoints are guarded by a dedicated `src/validations/` layer with Zod schemas, keeping validation logic decoupled from controller business logic.
- **Media CDN Uploads**: Direct ImageKit API integration for image optimization, thumbnailing, and cloud delivery.
- **Comprehensive Test Suite**: 14 Jest test files covering auth, products, variants, categories, brands, inventory, cart, wishlist, CSV import, and dashboard, run against an in-memory MongoDB server (`mongodb-memory-server`).

---

## 📁 Directory Structure

```
server/
├── src/
│   ├── config/
│   │   ├── config.js                    # Centralized environment configuration & validation
│   │   └── db.js                        # MongoDB Mongoose connection lifecycle
│   ├── controllers/
│   │   ├── admin/
│   │   │   ├── auth.controller.js       # Admin login, refresh token, logout, getMe
│   │   │   ├── banner.controller.js     # Banner management & default fallbacks
│   │   │   ├── brand.controller.js      # Brand CRUD & slug generation
│   │   │   ├── category.controller.js   # Hierarchical category tree management
│   │   │   ├── csvImport.controller.js  # Streamed CSV parsing & product batching
│   │   │   ├── dashboard.controller.js  # Analytics counters & stock alerts
│   │   │   ├── image.controller.js      # ImageKit cloud file uploader
│   │   │   ├── inventory.controller.js  # Manual stock adjustment ledger triggers
│   │   │   ├── product.controller.js    # Product & variant CRUD (ACID)
│   │   │   ├── productVariant.controller.js # Individual variant CRUD
│   │   │   └── user.controller.js       # Staff & admin account management
│   │   └── customer/
│   │       ├── cart.controller.js       # Customer cart operations
│   │       ├── customerAuth.controller.js # Customer registration & JWT auth
│   │       ├── public.controller.js     # Public storefront product & banner catalog
│   │       └── wishlist.controller.js   # Saved items / wishlist operations
│   ├── middleware/
│   │   ├── authenticate.middleware.js   # Admin JWT bearer validator (rejects customer tokens)
│   │   ├── authenticateCustomer.middleware.js # Customer JWT bearer validator
│   │   ├── authorize.middleware.js      # RBAC permission enforcer
│   │   ├── csvUpload.middleware.js      # Multer handler for CSV files
│   │   ├── error.middleware.js          # Global Mongoose & API error handler
│   │   ├── upload.middleware.js         # Multer handler for image files (5 MB, PNG/JPG/WEBP)
│   │   └── validate.middleware.js       # Zod schema validation wrapper
│   ├── models/
│   │   ├── admin/
│   │   │   ├── activityLog.model.js     # Admin audit action trail
│   │   │   ├── banner.model.js          # Storefront promo banner schema
│   │   │   ├── brand.model.js           # Brand entity schema
│   │   │   ├── category.model.js        # Hierarchical category schema
│   │   │   ├── importJob.model.js       # CSV import job tracking schema
│   │   │   ├── inventoryMovement.model.js # Immutable stock ledger schema
│   │   │   ├── product.model.js         # Parent product document schema
│   │   │   ├── productVariant.model.js  # SKU variant schema
│   │   │   ├── refreshToken.model.js    # Admin refresh token store (opaque, DB-backed)
│   │   │   └── user.model.js            # Admin user schema (bcrypt hashed password)
│   │   └── customer/
│   │       ├── cart.model.js            # Customer cart schema
│   │       ├── customer.model.js        # Customer account schema
│   │       ├── customerRefreshToken.model.js # Customer refresh token store
│   │       └── wishlist.model.js        # Customer wishlist schema
│   ├── routes/
│   │   ├── admin/                       # Express router declarations for admin
│   │   │   ├── auth.routes.js
│   │   │   ├── banner.routes.js
│   │   │   ├── brand.routes.js
│   │   │   ├── category.routes.js
│   │   │   ├── dashboard.routes.js
│   │   │   ├── image.routes.js
│   │   │   ├── inventory.routes.js
│   │   │   ├── product.routes.js        # Includes variant sub-routes & bulk ops
│   │   │   └── user.routes.js
│   │   └── customer/                    # Express router declarations for customer/public
│   │       ├── cart.routes.js
│   │       ├── customerAuth.routes.js
│   │       ├── public.routes.js
│   │       └── wishlist.routes.js
│   ├── scripts/
│   │   └── seedAdmin.js                 # One-shot super admin seeder script
│   ├── tests/
│   │   ├── setup.js                     # Jest global setup (in-memory MongoDB)
│   │   ├── auth.test.js                 # Admin auth flow tests
│   │   ├── brand.test.js
│   │   ├── cart.test.js
│   │   ├── category.test.js
│   │   ├── csvImport.test.js
│   │   ├── customerAuth.test.js
│   │   ├── dashboard.test.js
│   │   ├── image.test.js
│   │   ├── inventory.test.js
│   │   ├── product.test.js
│   │   ├── productVariant.test.js
│   │   ├── user.test.js
│   │   └── wishlist.test.js
│   ├── utils/
│   │   ├── activityLogger.js            # Admin activity trail helper
│   │   ├── apiError.js                  # Custom HTTP Error class
│   │   ├── csvMapper.js                 # Raw CSV row parser & validator
│   │   ├── csvParser.js                 # File stream parser wrapper
│   │   ├── escapeRegex.js               # Escapes special chars for safe MongoDB regex queries
│   │   ├── imagekit.js                  # ImageKit SDK client instance
│   │   ├── inventory.js                 # Atomic stock adjustment helper
│   │   ├── slugify.js                   # URL-safe unique slug generator
│   │   └── token.js                     # JWT signing helpers (access + opaque refresh)
│   ├── validations/
│   │   ├── admin/
│   │   │   ├── auth.validation.js       # Admin login schema
│   │   │   ├── inventory.validation.js  # Stock adjustment schema
│   │   │   ├── product.validation.js    # Product & variant create/update schemas
│   │   │   └── user.validation.js       # User create/update schema
│   │   ├── customer/
│   │   │   ├── cart.validation.js       # Cart add/update schema
│   │   │   ├── customerAuth.validation.js # Customer register/login/profile schemas
│   │   │   └── wishlist.validation.js   # Wishlist toggle schema
│   │   └── shared.js                    # Shared reusable Zod primitives
│   ├── app.js                           # Express application configuration & route mounting
│   └── server.js                        # HTTP server bootstrap entry point
├── .env.example                         # Environment variables template
└── package.json                         # Dependencies & scripts
```

---

## ⚡ Deep Core Technical Workflows

### 1. ACID Product & Variant Creation
Product creation (`createProduct` in `product.controller.js`) guarantees database consistency by executing inside a Mongoose Multi-Document Transaction Session:

```
[Client POST /api/products]
         │
         ▼
 ┌────────────────────────┐
 │ Category & Brand Check │
 └───────────┬────────────┘
             │ (Valid)
             ▼
 ┌────────────────────────┐
 │  Start Mongoose Session │
 └───────────┬────────────┘
             │
             ├──► 1. Generate unique product slug (slugify.js)
             ├──► 2. Create parent Product document in session
             ├──► 3. Insert ProductVariant documents (initial stock set to 0)
             └──► 4. For each variant: Call adjustStock({ type: "initial" })
                         │
                         ├──► Increment variant.stock atomically
                         └──► Create immutable InventoryMovement record
             │
             ▼
 ┌────────────────────────┐
 │   Commit Transaction   │
 └───────────┬────────────┘
             │
             ▼
 ┌────────────────────────┐
 │ Log Activity Audit Record│
 └────────────────────────┘
```

---

### 2. Inventory Movement Ledger Engine
Direct mutation of `variant.stock` is strictly forbidden. Stock updates execute via `adjustStock()` in `src/utils/inventory.js`:

- **Audit Record Creation**: Every movement logs `variant`, `user`, `type` (`initial`, `adjustment`, `sale`, `return`, `cancel`), `quantityDelta`, `previousStock`, `newStock`, and `reason`.
- **Concurrency Protection**: Uses `$inc` or session-level updates to eliminate race conditions under concurrent orders.
- **Low Stock Threshold**: Configurable via `LOW_STOCK_THRESHOLD` env var (default: `10`) for dashboard stock alerts.

---

### 3. Bulk CSV Import Engine Architecture
The CSV import pipeline (`csvImport.controller.js` & `csvMapper.js`) converts bulk CSV uploads into structured database entities:

1. **Upload & Job Creation**: Uploads CSV file via `csvUpload.middleware.js` and creates an `ImportJob` record (`status: "processing"`).
2. **Streaming Parse**: Reads file asynchronously line-by-line via `csvParser.js`.
3. **Category Auto-Matching**: Normalizes category path strings (e.g. `"Electronics > Accessories"`) and automatically matches or creates Category entities.
4. **Grouped Variant Building**: Groups rows by master product code/name, creates master `Product` records, and attaches corresponding `ProductVariant` records.
5. **Error Isolation**: Bad rows are logged in `job.errors` with line numbers and messages without aborting valid rows.
6. **Job Completion**: Updates `ImportJob` (`status: "completed"`, `processedRows`, `failedRows`).

---

### 4. Dynamic Storefront Banner Engine
Banners (`hero`, `secondary-left`, `secondary-right`, `bottom`) are managed via `/api/banners`:

- **Database Store**: `Banner` model stores `title`, `subtitle`, `image` (`url`, `fileId`), `href`, `ctaText`, `showGradient`, `overlayColor`, and `placement` (`left` vs `right`).
- **Default Fallback Merging**: When `GET /api/public/banners` is called, `public.controller.js` fetches active banners from MongoDB and merges missing keys with `DEFAULT_BANNERS` (pointing to `/hero-banner.png`, `/secondary-left.png`, `/secondary-ryt.png`, `/bottom-banner.png` in `/public`).
- **Storefront Rendering**:
  - `HeroBanner.jsx`: Renders background image, dynamic CTA, title, and overlay using `overlayColor`.
  - `CategoryBanners.jsx`: Dynamically positions content on **Left** or **Right** based on `placement` and applies custom gradient overlays.
  - `BottomBanner.jsx`: Displays promo banner without gradient overlays.

---

### 5. Dual JWT Authentication & RBAC Stack
The server maintains strict security isolation between admin staff and storefront customers using a **single shared `JWT_SECRET`** with token-type discrimination:

```
                      ┌────────────────────────────────────────┐
                      │            Incoming Request            │
                      └───────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     [Admin / Staff Endpoints]                      [Customer Endpoints]
                  │                                               │
                  ▼                                               ▼
  authenticate.middleware.js                    authenticateCustomer.middleware.js
 (Validates JWT; rejects type:"customer")      (Validates JWT; requires type:"customer")
                  │                                               │
                  ▼                                               ▼
   authorize.middleware.js                       Attaches req.customer
 (Checks role: super_admin, admin, staff)                          │
                  │                                               ▼
                  ▼                                       Executes Route
           Executes Route
```

**Refresh Token Flow** (opaque tokens, stored in MongoDB):
1. Client calls `POST /api/auth/refresh` — server reads the `refreshToken` cookie.
2. Server looks up the token in `RefreshToken` collection and validates expiry.
3. Issues a new short-lived JWT access token (15 min) and rotates the opaque refresh token (7 days).
4. Stale refresh token is deleted from the database to prevent reuse.

---

## 🔍 Detailed Folder & Component Guide

### Config (`src/config/`)
- **`config.js`**: Parses and validates required environment variables at startup (`PORT`, `MONGO_URI`, `JWT_SECRET`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`, `FRONTEND_URL`). Throws a descriptive error for any missing variable before the server boots. Also reads optional `LOW_STOCK_THRESHOLD`.
- **`db.js`**: Connects to MongoDB via Mongoose with connection pooling and lifecycle logging.

---

### Middleware (`src/middleware/`)
- **`authenticate.middleware.js`**: Decodes Admin JWT from `Authorization: Bearer <token>`, verifies validity, checks that `decoded.type !== "customer"`, then confirms the user still exists and `isActive` in DB before attaching `req.user`.
- **`authenticateCustomer.middleware.js`**: Decodes Customer JWT from `Authorization: Bearer <token>`, verifies validity, and sets `req.customer`.
- **`authorize.middleware.js`**: Accepts allowed role arrays (`authorize("super_admin", "admin")`). Rejects unauthorized requests with `403 Forbidden`.
- **`error.middleware.js`**: Central error handler formatting:
  - Mongoose `CastError` (e.g. invalid ObjectId format) into HTTP 400 (`"Invalid format for field..."`).
  - Mongoose `E11000` (duplicate key constraint) into HTTP 400 (`"Duplicate value for field..."`).
  - Custom `ApiError` instances into their respective status codes (`400`, `401`, `403`, `404`, `500`).
- **`upload.middleware.js`**: Multer memory storage engine for image uploads (5MB limit, PNG/JPG/WEBP filters).
- **`csvUpload.middleware.js`**: Multer handler restricted to `.csv` files.
- **`validate.middleware.js`**: Zod schema validation wrapper — parses `req.body` against the given schema and returns a structured `400` response on failure.

---

### Database Models (`src/models/`)

#### Admin & Core Schemas (`src/models/admin/`)
- **`product.model.js`**:
  - `name` (String, required)
  - `slug` (String, unique, indexed)
  - `description` (String)
  - `category` (ObjectId ref `Category`, required)
  - `brand` (ObjectId ref `Brand`, required)
  - `images` (`[{ url, fileId }]`)
  - `status` (Enum: `["draft", "active", "archived"]`, default: `"draft"`)
  - `featured` (Boolean, default: `false`)
- **`productVariant.model.js`**:
  - `product` (ObjectId ref `Product`, required)
  - `sku` (String, required, unique)
  - `price` (Number, required)
  - `salePrice` (Number)
  - `stock` (Number, default: `0`)
  - `images` (`[{ url, fileId }]`)
  - `options` (`Map` of String key/value pairs, e.g. `{ Color: "Red", Size: "XL" }`)
- **`category.model.js`**: `name`, `slug`, `description`, `image`, `parent` (Self-referencing ObjectId for tree hierarchy), `isActive`.
- **`brand.model.js`**: `name`, `slug`, `logo`, `isActive`.
- **`banner.model.js`**: `key` (Enum: `["hero", "secondary-left", "secondary-right", "bottom"]`), `title`, `subtitle`, `image`, `href`, `ctaText`, `showGradient`, `overlayColor`, `placement` (`"left"` | `"right"`).
- **`inventoryMovement.model.js`**: `variant` (ref `ProductVariant`), `user` (ref `User`), `type` (`"initial"`, `"adjustment"`, `"sale"`, `"return"`, `"cancel"`), `quantityDelta`, `previousStock`, `newStock`, `reason`.
- **`user.model.js`**: `name`, `email` (unique), `password` (bcrypt hashed), `role` (`"super_admin"`, `"admin"`, `"staff"`), `isActive`.
- **`refreshToken.model.js`**: `user` (ref `User`), `token` (opaque hex string), `expiresAt`.
- **`activityLog.model.js`**: `userId` (ref `User`), `action`, `resource`, `resourceId`, `description`, `timestamp`.
- **`importJob.model.js`**: `filename`, `status` (`"pending"`, `"processing"`, `"completed"`, `"failed"`), `totalRows`, `processedRows`, `failedRows`, `errors`.

#### Customer Schemas (`src/models/customer/`)
- **`customer.model.js`**: `name`, `email` (unique), `password` (bcrypt hashed), `phone`, `addresses`.
- **`cart.model.js`**: `customer` (ref `Customer`), `items: [{ variant: ref ProductVariant, quantity: Number }]`.
- **`wishlist.model.js`**: `customer` (ref `Customer`), `products: [ref Product]`.
- **`customerRefreshToken.model.js`**: `customer` (ref `Customer`), `token` (opaque hex string), `expiresAt`.

---

### Controllers (`src/controllers/`)

#### Admin Controllers (`src/controllers/admin/`)
- **`product.controller.js`**:
  - `createProduct`: Session-based creation of product + variants + initial stock ledger entries.
  - `getProducts`: Filtered product retrieval (category, brand, status, featured, search) with pagination and safe `ObjectId.isValid()` checks. Search uses `escapeRegex.js` for safe MongoDB regex queries.
  - `getProductById`: Single product view with populated category, brand, and variants.
  - `updateProduct`: Product level updates.
  - `deleteProduct`: Transactional deletion of product and associated variants.
  - `bulkUpdateProducts`: Status and featured bulk updates.
  - `bulkDeleteProducts`: Transactional bulk deletion.
- **`productVariant.controller.js`**: `createVariant`, `updateVariant`, `deleteVariant` with inventory sync.
- **`category.controller.js`**: Category tree CRUD operations and hierarchy resolution.
- **`brand.controller.js`**: Brand CRUD operations.
- **`banner.controller.js`**: `getAllBanners` and `updateBannerByKey` with defaults merging.
- **`csvImport.controller.js`**: `uploadAndProcessCSV`, `getImportJobs`, `getImportJobById`.
- **`inventory.controller.js`**: Manual stock adjustment handler calling `adjustStock()`.
- **`dashboard.controller.js`**: Summary metrics for admin dashboard cards.
- **`auth.controller.js`**: `login`, `refresh`, `logout`, `getMe`.
- **`user.controller.js`**: `getUsers`, `createUser`, `updateUser`, `deleteUser` (Super Admin restricted).
- **`image.controller.js`**: Uploads buffer to ImageKit CDN via SDK.

#### Customer Controllers (`src/controllers/customer/`)
- **`public.controller.js`**:
  - `getPublicProducts`: Public active product listing with category tree resolution and price filtering.
  - `getPublicProductBySlug`: Public single product detail lookup.
  - `getPublicCategories`: Flat list of active categories.
  - `getPublicBanners`: Public active banner configs.
  - `getPublicSearchSuggestions`: Fast regex autocomplete for products and categories (uses `escapeRegex.js`).
- **`cart.controller.js`**: `getCart`, `addToCart`, `updateCartItem`, `removeFromCart`, `clearCart`.
- **`wishlist.controller.js`**: `getWishlist`, `toggleWishlist`.
- **`customerAuth.controller.js`**: `register`, `login`, `refresh`, `logout`, `getProfile`.

---

### Validations (`src/validations/`)
All mutating endpoints use Zod schemas to validate request payloads before they reach the controller. Schemas are split by domain:

- **`admin/auth.validation.js`**: Admin login schema (`email`, `password`).
- **`admin/product.validation.js`**: Product create/update and variant schemas with nested option maps.
- **`admin/inventory.validation.js`**: Stock adjustment schema (`variantId`, `quantityDelta`, `type`, `reason`).
- **`admin/user.validation.js`**: Create/update user schemas with role enum validation.
- **`customer/customerAuth.validation.js`**: Register (`name`, `email`, `password`, phone, addresses), login, and profile update schemas.
- **`customer/cart.validation.js`**: Add-to-cart and quantity update schemas.
- **`customer/wishlist.validation.js`**: Wishlist toggle schema.
- **`shared.js`**: Shared reusable Zod primitives (e.g. ObjectId string validator).

---

### Utilities (`src/utils/`)
- **`inventory.js`**: Core `adjustStock()` function managing atomic stock increment/decrement and ledger entries.
- **`csvMapper.js`**: Header normalization, row validation, category parsing, and variant building logic.
- **`csvParser.js`**: Node.js stream wrapper converting CSV buffer/file to JS objects.
- **`escapeRegex.js`**: Escapes special regex characters in user-supplied strings before constructing MongoDB `$regex` queries, preventing injection attacks.
- **`imagekit.js`**: Instantiates ImageKit client using environment credentials.
- **`slugify.js`**: Converts titles to URL-safe unique slugs (appending random hex on collisions).
- **`token.js`**: JWT signing helpers — `generateAccessToken()` (for admins), `generateCustomerAccessToken()` (embeds `type: "customer"`), `generateRefreshToken()` (opaque `crypto.randomBytes(40)` hex), and `getRefreshTokenExpiryDate()`.
- **`activityLogger.js`**: Non-blocking log entry recorder for `activityLog.model.js`.
- **`apiError.js`**: Custom `ApiError` class extending native `Error` with `statusCode`.

---

### Scripts (`src/scripts/`)
- **`seedAdmin.js`**: One-shot script to seed the initial `super_admin` account into the database. Safe to run multiple times — exits early if the admin email already exists.
  ```bash
  node src/scripts/seedAdmin.js
  ```

---

### Tests (`src/tests/`)
The test suite uses **Jest** + **Supertest** + **mongodb-memory-server** for fast, isolated integration tests with no external database dependency:

- **`setup.js`**: Global Jest setup — spins up an in-memory MongoDB instance before all tests and tears it down after.
- **14 test files** covering: `auth`, `brand`, `cart`, `category`, `csvImport`, `customerAuth`, `dashboard`, `image`, `inventory`, `product`, `productVariant`, `user`, `wishlist`.

Run tests:
```bash
npm test
```

---

## 🚦 Complete API Route Specifications

### Admin API Routes (`/api/...`)

#### Auth Routes (`/api/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Admin/Staff login (Returns access token & sets refresh cookie) |
| `POST` | `/api/auth/refresh` | Public | Rotates refresh token & returns new access token |
| `POST` | `/api/auth/logout` | Authenticated | Revokes refresh token & clears cookie |
| `GET` | `/api/auth/me` | Authenticated | Gets current logged-in user profile |

#### Product Routes (`/api/products`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/products` | `super_admin`, `admin`, `staff` | Get paginated products with category/brand/search filters |
| `POST` | `/api/products` | `super_admin`, `admin` | Create new product with variants and initial stock |
| `GET` | `/api/products/:id` | `super_admin`, `admin`, `staff` | Get single product detail with variants |
| `PUT` | `/api/products/:id` | `super_admin`, `admin` | Update product details |
| `DELETE` | `/api/products/:id` | `super_admin`, `admin` | Delete product and all its variants |
| `PATCH` | `/api/products/bulk-update` | `super_admin`, `admin` | Bulk update product statuses or featured flag |
| `POST` | `/api/products/bulk-delete` | `super_admin`, `admin` | Bulk delete products and variants |
| `POST` | `/api/products/:id/variants` | `super_admin`, `admin` | Add new variant to existing product |
| `PUT` | `/api/products/variants/:variantId` | `super_admin`, `admin` | Update variant details/price |
| `DELETE` | `/api/products/variants/:variantId` | `super_admin`, `admin` | Delete individual variant |

#### Category Routes (`/api/categories`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/categories` | `super_admin`, `admin`, `staff` | List all categories |
| `POST` | `/api/categories` | `super_admin`, `admin` | Create new category |
| `GET` | `/api/categories/:id` | `super_admin`, `admin`, `staff` | Get category detail |
| `PUT` | `/api/categories/:id` | `super_admin`, `admin` | Update category |
| `DELETE` | `/api/categories/:id` | `super_admin`, `admin` | Delete category |

#### Brand Routes (`/api/brands`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/brands` | `super_admin`, `admin`, `staff` | List all brands |
| `POST` | `/api/brands` | `super_admin`, `admin` | Create brand |
| `PUT` | `/api/brands/:id` | `super_admin`, `admin` | Update brand |
| `DELETE` | `/api/brands/:id` | `super_admin`, `admin` | Delete brand |

#### Storefront Banner Routes (`/api/banners`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/banners` | `super_admin`, `admin`, `staff` | Get all banner configurations (merged with defaults) |
| `PUT` | `/api/banners/:key` | `super_admin`, `admin` | Update banner settings by key (`hero`, `secondary-left`, etc.) |

#### Inventory Routes (`/api/inventory`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/inventory/adjust` | `super_admin`, `admin` | Manually adjust stock & log movement |
| `GET` | `/api/inventory/movements` | `super_admin`, `admin`, `staff` | Get inventory movement ledger trail |

#### Image Routes (`/api/images`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/images/upload` | `super_admin`, `admin` | Upload image buffer to ImageKit CDN |

#### User Routes (`/api/users`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/users` | `super_admin` | List all admin/staff users |
| `POST` | `/api/users` | `super_admin` | Create new admin/staff user |
| `PUT` | `/api/users/:id` | `super_admin` | Update user details |
| `DELETE` | `/api/users/:id` | `super_admin` | Delete user |

#### Dashboard Routes (`/api/dashboard`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/dashboard` | `super_admin`, `admin`, `staff` | Get summary metrics & low stock alerts |

---

### Customer & Public API Routes (`/api/public/...` & `/api/customers/...`)

#### Public Storefront Routes (`/api/public`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/public/products` | Public | Paginated product listing with filters |
| `GET` | `/api/public/products/:slug` | Public | Single product detail by slug |
| `GET` | `/api/public/categories` | Public | Active categories list |
| `GET` | `/api/public/banners` | Public | Active banner configurations |
| `GET` | `/api/public/search/suggestions` | Public | Search autocomplete suggestions |

#### Customer Auth Routes (`/api/customers/auth`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/customers/auth/register` | Public | Customer account registration |
| `POST` | `/api/customers/auth/login` | Public | Customer login |
| `POST` | `/api/customers/auth/refresh` | Public | Refresh customer access token |
| `POST` | `/api/customers/auth/logout` | Customer Auth | Customer logout |
| `GET` | `/api/customers/auth/me` | Customer Auth | Get current customer profile |

#### Customer Cart Routes (`/api/customers/cart`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/customers/cart` | Customer Auth | Fetch active cart |
| `POST` | `/api/customers/cart` | Customer Auth | Add item/variant to cart |
| `PUT` | `/api/customers/cart/items/:variantId` | Customer Auth | Update item quantity |
| `DELETE` | `/api/customers/cart/items/:variantId` | Customer Auth | Remove item from cart |
| `DELETE` | `/api/customers/cart` | Customer Auth | Clear entire cart |

#### Customer Wishlist Routes (`/api/customers/wishlist`)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/customers/wishlist` | Customer Auth | Fetch customer wishlist |
| `POST` | `/api/customers/wishlist` | Customer Auth | Toggle product in/out of wishlist |

---

## 📊 Standardized JSON Response Schemas

### Success Response Format
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... },
  "pagination": {
    "total": 100,
    "page": 1,
    "pages": 5
  }
}
```

### Error Response Format
```json
{
  "success": false,
  "message": "Detailed error message",
  "stack": "Error stack trace (only in development environment)"
}
```

---

## 🚀 Environment Setup & Quick Start

### 1. Requirements
- **Node.js**: `v18.0.0` or higher
- **MongoDB**: `v6.0+` (Local instance or MongoDB Atlas)

### 2. Installation
```bash
# Clone repository
git clone https://github.com/your-repo/fibio-backend.git
cd fibio-backend/server

# Install dependencies
npm install
```

### 3. Environment File Configuration
Create a `.env` file in the `server/` root directory:
```env
PORT=5000
NODE_ENV=development
MONGO_URI=mongodb://localhost:27017/fibio-ecom
FRONTEND_URL=http://localhost:3000

# JWT Configuration (single secret for both admin & customer tokens)
JWT_SECRET=your_jwt_secret_min_32_chars_long

# Optional
LOW_STOCK_THRESHOLD=10

# ImageKit Configuration
IMAGEKIT_PUBLIC_KEY=your_imagekit_public_key
IMAGEKIT_PRIVATE_KEY=your_imagekit_private_key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
```

> **Note**: Unlike earlier versions, this API uses a **single `JWT_SECRET`** for both admin and customer tokens. Customer tokens are distinguished via a `type: "customer"` claim in the payload. You do **not** need separate `CUSTOMER_JWT_SECRET` or `JWT_REFRESH_SECRET` variables.

### 4. Seed the Super Admin
Before logging in for the first time, run the seeder to create the initial super admin account:
```bash
node src/scripts/seedAdmin.js
```
Default credentials: `admin@example.com` / `123456!` — **change these immediately after first login**.

### 5. Development & Production Execution
```bash
# Run in development mode with nodemon
npm run dev

# Run in production mode
npm start
```
The REST API will be live at `http://localhost:5000`. Health check endpoint: `http://localhost:5000/health`.

### 6. Running Tests
```bash
npm test
```
Tests run against an isolated in-memory MongoDB instance — no external database required.

### 7. Code Quality
```bash
# Format all files with Prettier
npm run format

# Check formatting without writing
npm run format:check
```
Husky + lint-staged run ESLint and Prettier automatically on every `git commit`.