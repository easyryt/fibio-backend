import { betterAuth } from "better-auth/minimal";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { testUtils } from "better-auth/plugins";
import { toNodeHandler } from "better-auth/node";
import { APIError } from "better-auth/api";
import mongoose from "mongoose";

let testCustomerAuthInstance = null;
let testCustomerAuthHandler = null;

export async function createTestCustomerAuth() {
  const db = mongoose.connection.db;
  const client = mongoose.connection.getClient();

  if (!db || !client) {
    throw new Error(
      "Mongoose database connection is not established. Ensure connectTestDB() has resolved before calling createTestCustomerAuth()."
    );
  }

  try {
    await db.collection("customerUser").createIndex(
      { phoneNumber: 1 },
      { unique: true, sparse: true }
    );
  } catch (err) {
    console.error(
      "[CUSTOMER AUTH TEST INDEX ERROR] Failed to create unique sparse index on customerUser.phoneNumber:",
      err
    );
    throw err;
  }

  testCustomerAuthInstance = betterAuth({
    logger: {
      level: "debug",
      disabled: false,
    },
    basePath: "/api/v1/customers/auth",
    baseURL: process.env.BETTER_AUTH_URL || `http://localhost:${process.env.PORT || 5000}`,
    secret:
      process.env.BETTER_AUTH_SECRET ||
      process.env.JWT_SECRET ||
      "test-secret-key-min-32-chars-long!",
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
      sendVerificationEmail: ({ user, url, token }) => {
        console.log(
          `[TEST EMAIL VERIFICATION] User: ${user.email} | URL: ${url} | Token: ${token}`
        );
      },
      autoSignInAfterVerification: true,
    },
    plugins: [
      phoneNumber({
        sendOTP: ({ phoneNumber, code }) => {
          console.log(`[TEST OTP] Phone: ${phoneNumber} | Code: ${code}`);
        },
        signUpOnVerification: {
          getTempEmail: (phoneNumber) => `${phoneNumber.replace(/[^0-9]/g, "")}@customer.local`,
          getTempName: (phoneNumber) => phoneNumber,
        },
      }),
      testUtils({ captureOTP: true }),
    ],
  });

  testCustomerAuthHandler = toNodeHandler(testCustomerAuthInstance);
  return testCustomerAuthInstance;
}

export function getTestCustomerAuth() {
  if (!testCustomerAuthInstance) {
    throw new Error(
      "TestCustomerAuth has not been initialized. Ensure connectTestDB() and createTestCustomerAuth() have resolved."
    );
  }
  return testCustomerAuthInstance;
}

export function getTestCustomerAuthHandler() {
  if (!testCustomerAuthHandler) {
    throw new Error(
      "TestCustomerAuth handler has not been initialized. Ensure connectTestDB() and createTestCustomerAuth() have resolved."
    );
  }
  return testCustomerAuthHandler;
}
