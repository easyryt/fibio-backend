import dotenv from 'dotenv';
dotenv.config();
import { connectDB } from '../config/db.js';
import { createCustomerAuth, getCustomerAuth, getCustomerAuthHandler } from '../config/customerAuth.js';
import mongoose from 'mongoose';

async function testBoot() {
  try {
    console.log("Connecting DB...");
    await connectDB();
    console.log("Creating customer auth...");
    const auth = await createCustomerAuth();
    console.log("Customer auth created successfully!");
    const retrievedAuth = getCustomerAuth();
    const handler = getCustomerAuthHandler();
    console.log("Retrieved customer auth successfully. API exists:", typeof retrievedAuth.api);
    console.log("Handler exists:", typeof handler);
    await mongoose.connection.close();
    console.log("DB closed clean.");
    process.exit(0);
  } catch (err) {
    console.error("Boot test failed:", err);
    process.exit(1);
  }
}

testBoot();
