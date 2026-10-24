import { Schema, model, models, type Model } from "mongoose";

export interface CounterDoc {
  /** Counter name, e.g. "quotation:2026-27". */
  _id: string;
  seq: number;
}

const CounterSchema = new Schema<CounterDoc>({
  _id: { type: String, required: true },
  seq: { type: Number, required: true, default: 0 },
});

export const Counter: Model<CounterDoc> =
  (models.Counter as Model<CounterDoc> | undefined) ?? model<CounterDoc>("Counter", CounterSchema);

/** Atomically returns the next number for a counter (1, 2, 3...). Safe under concurrent requests. */
export async function nextSeq(name: string): Promise<number> {
  const doc = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  if (!doc) throw new Error(`Counter ${name} could not be incremented`);
  return doc.seq;
}
