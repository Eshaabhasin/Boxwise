import { Schema, model, models, type Model, type Types } from "mongoose";
import { STAGES, type FieldKey, type SpecValue, type Specs, type Stage } from "@/lib/fields";

export interface FieldChange {
  field: FieldKey;
  before: SpecValue;
  after: SpecValue;
}

/** One applied plan. Undo reverses the latest entry that is not already undone. */
export interface HistoryEntry {
  planId: Types.ObjectId;
  summary: string;
  changes: FieldChange[];
  stageBefore?: Stage;
  stageAfter?: Stage;
  undone: boolean;
  at: Date;
}

export interface RequestDoc {
  _id: Types.ObjectId;
  /** Sequential request number shown as REQ-016. */
  number?: number;
  customerId: Types.ObjectId;
  /** Copied from the customer for board search and display. */
  customerName: string;
  customerKey: string;
  stage: Stage;
  /** Card fields (not the customer fields), stored as described in lib/fields.ts. */
  specs: Specs;
  missing: FieldKey[];
  /** Every dictated text that created or changed this card, oldest first. */
  rawTexts: { text: string; at: Date }[];
  history: HistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}

const RequestSchema = new Schema<RequestDoc>(
  {
    number: { type: Number, unique: true, sparse: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    customerKey: { type: String, required: true, index: true },
    stage: { type: String, enum: STAGES, default: "New", index: true },
    specs: { type: Schema.Types.Mixed, default: {} },
    missing: { type: [String], default: [] },
    rawTexts: { type: [{ text: String, at: Date, _id: false }], default: [] },
    history: {
      type: [
        {
          planId: Schema.Types.ObjectId,
          summary: String,
          changes: [{ field: String, before: Schema.Types.Mixed, after: Schema.Types.Mixed, _id: false }],
          stageBefore: String,
          stageAfter: String,
          undone: { type: Boolean, default: false },
          at: Date,
          _id: false,
        },
      ],
      default: [],
    },
  },
  { timestamps: true, minimize: false },
);

export const Request: Model<RequestDoc> =
  (models.Request as Model<RequestDoc> | undefined) ?? model<RequestDoc>("Request", RequestSchema);
