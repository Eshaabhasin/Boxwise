import { Schema, model, models, type Model, type Types } from "mongoose";

export const PLAN_STATUSES = ["pending", "applied", "cancelled", "superseded"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/**
 * A plan shown to the owner ("I will set height to 9 inch, quantity 500").
 * Nothing changes until he says "approve". A spoken correction replaces it with a new plan.
 * Pending plans expire after a day so a stale one is never applied by accident.
 */
export interface PendingPlanDoc {
  _id: Types.ObjectId;
  /** What the plan does, e.g. "create_request", "edit_request", "set_rate", "undo". */
  action: string;
  requestId?: Types.ObjectId;
  quotationId?: Types.ObjectId;
  /** Human-readable lines shown to the owner. */
  lines: string[];
  /** Machine operations, validated with zod before they are applied. */
  ops: unknown;
  sourceText: string;
  parseLogId?: Types.ObjectId;
  status: PlanStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PendingPlanSchema = new Schema<PendingPlanDoc>(
  {
    action: { type: String, required: true },
    requestId: { type: Schema.Types.ObjectId, ref: "Request" },
    quotationId: { type: Schema.Types.ObjectId, ref: "Quotation" },
    lines: { type: [String], default: [] },
    ops: { type: Schema.Types.Mixed, default: null },
    sourceText: { type: String, required: true },
    parseLogId: { type: Schema.Types.ObjectId, ref: "ParseLog" },
    status: { type: String, enum: PLAN_STATUSES, default: "pending", index: true },
    expiresAt: { type: Date, required: true, expires: 0 },
  },
  { timestamps: true, minimize: false },
);

export const PendingPlan: Model<PendingPlanDoc> =
  (models.PendingPlan as Model<PendingPlanDoc> | undefined) ??
  model<PendingPlanDoc>("PendingPlan", PendingPlanSchema);
