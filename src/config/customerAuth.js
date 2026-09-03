import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { toNodeHandler } from "better-auth/node";
import { APIError } from "better-auth/api";
import mongoose from "mongoose";

let customerAuthInstance = null;
let customerAuthHandler = null;

export async function createCustomerAuth() {
  const db = mongoose.connection.db;
  const client = mongoose.connection.getClient();

  if (!db || !client) {
    throw new Error(
      "Mongoose database connection is not established. Ensure connectDB() has resolved before calling createCustomerAuth()."
    );
  }

  try {
    await db.collection("customerUser").createIndex(
      { phoneNumber: 1 },
      { unique: true, sparse: true }
    );
  } catch (err) {
    console.error(
      "[CUSTOMER AUTH INDEX ERROR] Failed to create unique sparse index on customerUser.phoneNumber:",
      err
    );
    throw err;
  }

  let baseURL = process.env.BETTER_AUTH_URL;

  if (process.env.NODE_ENV === "production") {
    if (!baseURL) {
      throw new Error("BETTER_AUTH_URL environment variable is required in production");
    }

    try {
      const parsedUrl = new URL(baseURL);
      const isLocalhost =
        parsedUrl.hostname === "localhost" ||
        parsedUrl.hostname === "127.0.0.1" ||
        parsedUrl.hostname === "::1" ||
        parsedUrl.hostname === "0.0.0.0";

      if (parsedUrl.protocol !== "https:" || isLocalhost) {
        throw new Error("BETTER_AUTH_URL must be a valid public HTTPS origin in production");
      }
    } catch (err) {
      if (err.message.includes("BETTER_AUTH_URL")) throw err;
      throw new Error(`Invalid BETTER_AUTH_URL in production: ${baseURL}`);
    }
  } else {
    baseURL = baseURL || `http://localhost:${process.env.PORT || 5000}`;
  }

  const allowedOrigins = process.env.TRUSTED_ORIGINS
    ? process.env.TRUSTED_ORIGINS.split(",").map((o) => o.trim())
    : [
        (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, ""),
        "http://localhost:3000",
        "http://localhost:5173",
      ];

  customerAuthInstance = betterAuth({
    logger: {
      level: process.env.NODE_ENV === "production" ? "error" : "debug",
      disabled: false,
    },
    basePath: "/api/v1/customers/auth",
    baseURL,
    secret: process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET,
    database: mongodbAdapter(db, {
      client: client,
      // TODO(better-auth): re-enable transactions once upstream fixes nested
      // transaction handling (tracked: PR #10070 fixed this for 1.6.19, unclear
      // if 1.7.x has it — recheck on next better-auth upgrade).
      // Confirmed bug on 1.7.2: sign-up/email + phoneNumber plugin nested writes
      // throw "Cannot call abortTransaction after calling commitTransaction".
      transaction: false,
    }),
    user: {
      modelName: "customerUser",
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (user.phoneNumber) {
              const db = mongoose.connection.db;
              if (db) {
                const existingUser = await db.collection("customerUser").findOne({
                  phoneNumber: user.phoneNumber,
                });
                if (existingUser) {
                  throw new APIError("BAD_REQUEST", {
                    message: "User with this phone number already exists",
                  });
                }
              }
            }
          },
        },
      },
    },
    session: {
      modelName: "customerSession",
    },
    account: {
      modelName: "customerAccount",
    },
    verification: {
      modelName: "customerVerification",
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      sendVerificationEmail: ({ user, url, token }, _request) => {
        if (process.env.NODE_ENV === "production") {
          // TODO(email-provider): Implement transactional email provider integration for production
          throw new Error("Email provider not configured for production environment yet.");
        }
        console.log(
          `[CUSTOMER AUTH EMAIL VERIFICATION] User: ${user.email} | URL: ${url} | Token: ${token}`
        );
      },
      autoSignInAfterVerification: true,
    },
    plugins: [
      phoneNumber({
        sendOTP: ({ phoneNumber, code }, _request) => {
          if (process.env.NODE_ENV === "production") {
            // TODO(MSG91): Implement MSG91 SMS gateway integration for production
            throw new Error("MSG91 SMS gateway not configured for production environment yet.");
          }
          console.log(`[CUSTOMER AUTH OTP] Phone: ${phoneNumber} | Code: ${code}`);
        },
        signUpOnVerification: {
          getTempEmail: (phoneNumber) => `${phoneNumber.replace(/[^0-9]/g, "")}@customer.local`,
          getTempName: (phoneNumber) => phoneNumber,
        },
      }),
    ],
    trustedOrigins: allowedOrigins,
  });

  customerAuthHandler = toNodeHandler(customerAuthInstance);
  return customerAuthInstance;
}

export function getCustomerAuth() {
  if (!customerAuthInstance) {
    throw new Error(
      "CustomerAuth has not been initialized. Ensure connectDB() and createCustomerAuth() have resolved before making customer auth requests."
    );
  }
  return customerAuthInstance;
}

export function getCustomerAuthHandler() {
  if (!customerAuthHandler) {
    throw new Error(
      "CustomerAuth handler has not been initialized. Ensure connectDB() and createCustomerAuth() have resolved before handling customer auth routes."
    );
  }
  return customerAuthHandler;
}
