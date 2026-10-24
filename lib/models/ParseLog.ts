import { Schema, model, models, type Model, type Types } from "mongoose";

export const PARSE_OUTCOMES = ["pending", "approved", "corrected", "cancelled", "error"] as const;
export type ParseOutcome = (typeof PARSE_OUTCOMES)[number];

/**
 * Every dictated command, what the LLM returned and what the owner did with it.
 * Corrections here are the raw material for new harness cases.
 */
export interface ParseLogDoc {
  _id: Types.ObjectId;
  text: string;
  normalized: string;
  screen: string;
  requestId?: Types.ObjectId;
  provider: string;
  model: string;
  /** Raw LLM response text, exactly as received. */
  llmRaw: string;
  /** The validated JSON after zod (null when validation failed). */
  llmParsed: unknown;
  /** Values the guard dropped because they were not in the dictated text. */
  dropped: string[];
  planLines: string[];
  outcome: ParseOutcome;
  /** Spoken corrections that followed, in order. */
  corrections: string[];
  error?: string;
  latencyMs: number;
  createdAt: Date;
  updatedAt: Date;
}

const ParseLogSchema = new Schema<ParseLogDoc>(
  {
    text: { type: String, required: true },
    normalized: { type: String, required: true },
    screen: { type: String, required: true },
    requestId: { type: Schema.Types.ObjectId, ref: "Request" },
    provider: { type: String, required: true },
    model: { type: String, required: true },
    llmRaw: { type: String, default: "" },
    llmParsed: { type: Schema.Types.Mixed, default: null },
    dropped: { type: [String], default: [] },
    planLines: { type: [String], default: [] },
    outcome: { type: String, enum: PARSE_OUTCOMES, default: "pending", index: true },
    corrections: { type: [String], default: [] },
    error: String,
    latencyMs: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

export const ParseLog: Model<ParseLogDoc> =
  (models.ParseLog as Model<ParseLogDoc> | undefined) ?? model<ParseLogDoc>("ParseLog", ParseLogSchema);
