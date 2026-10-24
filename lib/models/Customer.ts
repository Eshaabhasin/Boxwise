import { Schema, model, models, type Model, type Types } from "mongoose";

export interface CustomerDoc {
  _id: Types.ObjectId;
  company: string;
  /** Lower-case, punctuation-free company name used for matching and search. */
  companyKey: string;
  contactPerson?: string;
  phone?: string;
  gstin?: string;
  address?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<CustomerDoc>(
  {
    company: { type: String, required: true, trim: true },
    companyKey: { type: String, required: true, unique: true },
    contactPerson: String,
    phone: String,
    gstin: String,
    address: String,
  },
  { timestamps: true },
);

export const Customer: Model<CustomerDoc> =
  (models.Customer as Model<CustomerDoc> | undefined) ?? model<CustomerDoc>("Customer", CustomerSchema);
