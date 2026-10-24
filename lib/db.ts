import "server-only";
import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "@/lib/env";

// Reuse one connection across hot reloads in dev and warm serverless invocations on Vercel.
const globalForMongoose = globalThis as unknown as {
  boxbolMongoose?: Promise<typeof mongoose>;
};

const PUBLIC_DNS = ["1.1.1.1", "8.8.8.8"];

/**
 * Atlas "mongodb+srv://" strings need a DNS SRV lookup. Some Windows setups
 * point Node at a DNS server that refuses it (querySrv ECONNREFUSED) even
 * though the browser works. If the lookup fails, switch Node to public DNS.
 */
async function ensureSrvResolves(uri: string): Promise<void> {
  const host = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?]+)/.exec(uri)?.[1];
  if (!host) return;
  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${host}`);
  } catch {
    dns.setServers(PUBLIC_DNS);
  }
}

async function connect(): Promise<typeof mongoose> {
  const uri = env().MONGODB_URI;
  await ensureSrvResolves(uri);
  // dbName keeps data in "boxbol" even when the Atlas string has no database name in it.
  return mongoose.connect(uri, { dbName: "boxbol", serverSelectionTimeoutMS: 8000 });
}

export async function connectDb(): Promise<typeof mongoose> {
  if (!globalForMongoose.boxbolMongoose) {
    globalForMongoose.boxbolMongoose = connect().catch((err: unknown) => {
      globalForMongoose.boxbolMongoose = undefined;
      throw err;
    });
  }
  return globalForMongoose.boxbolMongoose;
}
