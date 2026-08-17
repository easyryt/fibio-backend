import mongoose from 'mongoose';
import { config } from './config.js';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongodbUri);

    console.log("MongoDB Connected");
  } catch (error) {
    console.error('MongoDB Connection Failed');
    console.error(error.message);

    process.exit(1);
  }
};