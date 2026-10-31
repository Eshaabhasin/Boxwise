import { Schema, model, models, type Model, type Types } from "mongoose";
import { STAGES, type FieldKey, type Specs, type Stage } from "@/lib/fields";

/** One box in an enquiry. An enquiry (card) can ask for many boxes. */
export interface BoxItem {
  /** Short stable id, so a quotation line and undo can find the same box. */
  id: string;
  /** Per-box fields (size, ply, quantity, rate...), stored as described in lib/fields.ts. */
  specs: Specs;
  /** Per-box fields not said yet. */
  missing: FieldKey[];
}

/** Everything a change can touch, saved before the change so "undo" can put it back exactly. */
export interface CardSnapshot {
  items: BoxItem[];
  terms: Specs;
  /** Customer fields as they were (they live on the customer record). */
  customer: Specs;
}

/** One applied plan. Undo reverses the latest entry that is not already undone. */
export interface HistoryEntry {
  planId: Types.ObjectId;
  /** create = card made, edit = boxes/terms/customer changed, stage = moved, quote = quotation approved, undo = an undo. */
  action?: "create" | "edit" | "stage" | "quote" | "undo";
  /** For "quote" and "sent": the quotation concerned. */
  quotationId?: Types.ObjectId;
  /** One line per change, e.g. "Box 2 height: 8 inch → 9 inch". */
  summary: string;
  /** The dictated texts this change added to rawTexts; undo takes them off again. */
  texts?: string[];
  /** The card before this change (edits only). */
  before?: CardSnapshot;
  stageBefore?: Stage;
  stageAfter?: Stage;
  undone: boolean;
  at: Date;
}

export interface RequestDoc {
  _id: Types.ObjectId;
  /** Sequential enquiry number shown as REQ-016. */
  number?: number;
  customerId: Types.ObjectId;
  /** Copied from the customer for board search and display. */
  customerName: string;
  customerKey: string;
  stage: Stage;
  /** The boxes asked for, in the order they were said. */
  items: BoxItem[];
  /** Quotation-level fields: GST % and terms. */
  terms: Specs;
  /** Card-level gaps (customer fields, and a field if any box is missing it), for the board. */
  missing: FieldKey[];
  /** Every dictated text that created or changed this card, oldest first. */
  rawTexts: { text: string; at: Date }[];
  history: HistoryEntry[];
  /** Set when "undo" removes a card that was just made. Removed cards are hidden, not erased. */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ItemSchema = new Schema<BoxItem>(
  {
    id: { type: String, required: true },
    specs: { type: Schema.Types.Mixed, default: {} },
    missing: { type: [String], default: [] },
  },
  { _id: false, minimize: false },
);

const RequestSchema = new Schema<RequestDoc>(
  {
    number: { type: Number, unique: true, sparse: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerName: { type: String, required: true },
    customerKey: { type: String, required: true, index: true },
    stage: { type: String, enum: STAGES, default: "New", index: true },
    items: { type: [ItemSchema], default: [] },
    terms: { type: Schema.Types.Mixed, default: {} },
    missing: { type: [String], default: [] },
    rawTexts: { type: [{ text: String, at: Date, _id: false }], default: [] },
    history: {
      type: [
        {
          planId: Schema.Types.ObjectId,
          // No default: entries from before phase 3 have none, and entryAction() works them out.
          action: { type: String, enum: ["create", "edit", "stage", "quote", "undo"] },
          quotationId: Schema.Types.ObjectId,
          summary: String,
          texts: { type: [String], default: undefined },
          before: { type: Schema.Types.Mixed },
          stageBefore: String,
          stageAfter: String,
          undone: { type: Boolean, default: false },
          at: Date,
          _id: false,
        },
      ],
      default: [],
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

export const Request: Model<RequestDoc> =
  (models.Request as Model<RequestDoc> | undefined) ?? model<RequestDoc>("Request", RequestSchema);
