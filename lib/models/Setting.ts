import { Schema, model, models, type Model } from "mongoose";

/** App-wide settings. One document per key: "company" holds the letterhead, "pricing" your price list. */
export interface SettingDoc {
  _id: string;
  /** "company": CompanyProfile; "pricing": PricingRates. Checked with zod when read. */
  value: unknown;
  updatedAt: Date;
  createdAt: Date;
}

const SettingSchema = new Schema<SettingDoc>(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true, minimize: false },
);

export const Setting: Model<SettingDoc> = (models.Setting as Model<SettingDoc> | undefined) ?? model<SettingDoc>("Setting", SettingSchema);
