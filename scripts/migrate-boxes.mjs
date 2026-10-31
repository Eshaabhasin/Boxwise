// One-off: cards made before multi-box quotations kept their box in `specs`.
// This moves it to items[0] (and GST/terms to `terms`). Safe to run twice.
//   node scripts/migrate-boxes.mjs
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import dns from "node:dns";
import mongoose from "mongoose";

dns.setServers(["1.1.1.1", "8.8.8.8"]);
const uri = readFileSync(".env.local", "utf8").match(/^MONGODB_URI=(.*)$/m)[1].trim();
await mongoose.connect(uri, { dbName: "boxbol", serverSelectionTimeoutMS: 15000 });
const db = mongoose.connection.db;

const QUOTE_KEYS = new Set(["gstPercent", "deliveryTime", "paymentTerms", "validity"]);
const REQUIRED_BOX = ["length", "breadth", "height", "dimUnit", "style", "ply", "flute", "loadKg", "printColours", "joint", "quantity"];
const id = () => Array.from(randomBytes(6), (b) => "abcdefghjkmnpqrstuvwxyz23456789"[b % 31]).join("");

const old = await db.collection("requests").find({ specs: { $exists: true } }).toArray();
for (const r of old) {
  const box = {};
  const terms = {};
  for (const [k, v] of Object.entries(r.specs ?? {})) (QUOTE_KEYS.has(k) ? terms : box)[k] = v;
  const items = Object.keys(box).length ? [{ id: id(), specs: box, missing: REQUIRED_BOX.filter((k) => box[k] === undefined || box[k] === null || box[k] === "") }] : [];
  await db.collection("requests").updateOne({ _id: r._id }, { $set: { items, terms: { ...(r.terms ?? {}), ...terms } }, $unset: { specs: "" } });
  console.log(`REQ-${r.number}: ${items.length} box, terms ${JSON.stringify(terms)}`);
}
const plans = old.length ? await db.collection("pendingplans").updateMany({ status: "pending" }, { $set: { status: "superseded" } }) : { modifiedCount: 0 };

// Quotations from before: one line built from their single box; number, rate and totals unchanged.
const oldQuotes = await db.collection("quotations").find({ lines: { $exists: false } }).toArray();
for (const q of oldQuotes) {
  const req = await db.collection("requests").findOne({ _id: q.requestId });
  const line = {
    itemId: req?.items?.[0]?.id ?? id(),
    title: q.itemTitle ?? "Corrugated box",
    detail: q.itemDetail ?? "",
    quantity: q.quantity,
    ratePaise: q.ratePaise,
    amountPaise: q.subtotalPaise,
    specs: q.specsSnapshot ?? {},
  };
  await db.collection("quotations").updateOne(
    { _id: q._id },
    { $set: { lines: [line], revision: 0, notes: "", lineText: {} }, $unset: { itemTitle: "", itemDetail: "", quantity: "", ratePaise: "", specsSnapshot: "" } },
  );
  console.log(`quotation ${q.number ?? "(draft)"} ${q.status}: 1 line, total ${q.totalPaise / 100}`);
}
console.log(`migrated ${old.length} cards and ${oldQuotes.length} quotations, retired ${plans.modifiedCount} waiting plans`);
await mongoose.disconnect();
