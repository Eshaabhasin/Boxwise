import "server-only";
import mongoose from "mongoose";
import { env } from "@/lib/env";

// Reuse one connection across hot reloads in dev and warm serverless invocations on Vercel.
const globalForMongoose = globalThis as unknown as {
  boxbolMongoose?: Promise<typeof mongoose>;
};

export async function connectDb(): Promise<typeof mongoose> {
  if (!globalForMongoose.boxbolMongoose) {
    globalForMongoose.boxbolMongoose = mongoose
      .connect(env().MONGODB_URI, { serverSelectionTimeoutMS: 8000 })
      .catch((err: unknown) => {
        globalForMongoose.boxbolMongoose = undefined;
        throw err;
      });
  }
  return globalForMongoose.boxbolMongoose;
}
