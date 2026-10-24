import { Schema, model, models, type Model, type Types } from "mongoose";
import type { Specs } from "@/lib/fields";

export const QUOTATION_STATUSES = ["Draft", "Approved", "Sent"] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

/**
 * A frozen snapshot. Once approved, later edits to the card never change it,
 * so a PDF that was sent can always be rebuilt exactly. All money is integer paise.
 */
export interface QuotationDoc {
  _id: Types.ObjectId;
  /** Sequential number, e.g. BB/2026-27/0001. Assigned on approval. */
  number?: string;
  requestId: Types.ObjectId;
  customerId: Types.ObjectId;
  customerSnapshot: {
    company: string;
    contactPerson?: string;
    phone?: string;
    gstin?: string;
    address?: string;
  };
  specsSnapshot: Specs;
  quantity: number;
  ratePaise: number;
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
  status: QuotationStatus;
  /** Random token for the public PDF link used by the WhatsApp text fallback. */
  shareToken: string;
  approvedAt?: Date;
  sentAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QuotationSchema = new Schema<QuotationDoc>(
  {
    number: { type: String, unique: true, sparse: true },
    requestId: { type: Schema.Types.ObjectId, ref: "Request", required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true, index: true },
    customerSnapshot: {
      company: { type: String, required: true },
      contactPerson: String,
      phone: String,
      gstin: String,
      address: String,
    },
    specsSnapshot: { type: Schema.Types.Mixed, default: {} },
    quantity: { type: Number, required: true },
    ratePaise: { type: Number, required: true },
    subtotalPaise: { type: Number, required: true },
    gstPercent: { type: Number, required: true },
    gstMode: { type: String, enum: ["intra", "inter"], required: true },
    cgstPaise: { type: Number, required: true },
    sgstPaise: { type: Number, required: true },
    igstPaise: { type: Number, required: true },
    roundOffPaise: { type: Number, required: true },
    totalPaise: { type: Number, required: true },
    terms: {
      deliveryTime: { type: String, required: true },
      paymentTerms: { type: String, required: true },
      validity: { type: String, required: true },
    },
    status: { type: String, enum: QUOTATION_STATUSES, default: "Draft", index: true },
    shareToken: { type: String, required: true, unique: true },
    approvedAt: Date,
    sentAt: Date,
  },
  { timestamps: true, minimize: false },
);

export const Quotation: Model<QuotationDoc> =
  (models.Quotation as Model<QuotationDoc> | undefined) ?? model<QuotationDoc>("Quotation", QuotationSchema);
