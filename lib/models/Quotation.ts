import { Schema, model, models, type Model, type Types } from "mongoose";
import type { CompanyProfile } from "@/lib/company";
import type { Specs } from "@/lib/fields";

export const QUOTATION_STATUSES = ["Draft", "Approved", "Sent"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/** One box on the quotation. Money is integer paise; amount = quantity × rate, worked out by code. */
export interface QuoteLine {
  /** The card's box id, so edits on the quotation find the same box. */
  itemId: string;
  title: string;
  detail: string;
  quantity: number;
  ratePaise: number;
  amountPaise: number;
  /** The box's fields as quoted, for the spec table. */
  specs: Specs;
}

export interface CustomerSnapshot {
  company: string;
  contactPerson?: string;
  phone?: string;
  gstin?: string;
  address?: string;
}

/**
 * A quotation for one enquiry, with a line per box. While it is a draft or
 * approved it can be edited (on the screen or by voice); once sent it is frozen,
 * and a change makes a new revision, so what the customer got never changes.
 */
export interface QuotationDoc {
  _id: Types.ObjectId;
  /** Sequential number, e.g. BB/2026-27/0001. Assigned on approval; a revision adds -R1, -R2. */
  number?: string;
  revision: number;
  /** The sent quotation this one revises. */
  revises?: Types.ObjectId;
  requestId: Types.ObjectId;
  customerId: Types.ObjectId;
  customerSnapshot: CustomerSnapshot;
  lines: QuoteLine[];
  subtotalPaise: number;
  gstPercent: number;
  /** "intra" = CGST + SGST (same state), "inter" = IGST. */
  gstMode: "intra" | "inter";
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  terms: {
    deliveryTime: string;
    paymentTerms: string;
    validity: string;
  };
  /** Free text printed under the terms. */
  notes: string;
  /** Wording he typed over on the quotation (line title/detail), kept when the draft is rebuilt from the card. */
  lineText: Record<string, { title?: string; detail?: string }>;
  status: QuotationStatus;
  /** Your letterhead as it was when this quotation was sent, so its PDF never changes afterwards. */
  seller?: CompanyProfile;
  /** Random token for the public PDF link used by the WhatsApp text fallback. */
  shareToken: string;
  approvedAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LineSchema = new Schema<QuoteLine>(
  {
    itemId: { type: String, required: true },
    title: { type: String, required: true },
    detail: { type: String, default: "" },
    quantity: { type: Number, required: true },
    ratePaise: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    specs: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false, minimize: false },
);

const QuotationSchema = new Schema<QuotationDoc>(
  {
    number: { type: String, unique: true, sparse: true },
    revision: { type: Number, default: 0 },
    revises: { type: Schema.Types.ObjectId, ref: "Quotation" },
    requestId: { type: Schema.Types.ObjectId, ref: "Request", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: {
      company: { type: String, required: true },
      contactPerson: String,
      phone: String,
      gstin: String,
      address: String,
    },
    lines: { type: [LineSchema], default: [] },
    subtotalPaise: { type: Number, required: true },
    gstPercent: { type: Number, required: true },
    gstMode: { type: String, enum: ["intra", "inter"], required: true },
    cgstPaise: { type: Number, required: true },
    sgstPaise: { type: Number, required: true },
    igstPaise: { type: Number, required: true },
    roundOffPaise: { type: Number, required: true },
    totalPaise: { type: Number, required: true },
    terms: {
      deliveryTime: { type: String, default: "—" },
      paymentTerms: { type: String, default: "—" },
      validity: { type: String, default: "—" },
    },
    notes: { type: String, default: "" },
    lineText: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: QUOTATION_STATUSES, default: "Draft", index: true },
    seller: { type: Schema.Types.Mixed },
    shareToken: { type: String, required: true, unique: true },
    approvedAt: Date,
    sentAt: Date,
  },
  { timestamps: true, minimize: false },
);

export const Quotation: Model<QuotationDoc> =
  (models.Quotation as Model<QuotationDoc> | undefined) ?? model<QuotationDoc>("Quotation", QuotationSchema);
