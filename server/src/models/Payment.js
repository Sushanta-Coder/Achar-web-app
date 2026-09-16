import mongoose from 'mongoose';
import { CURRENCY, PAYMENT_METHOD_VALUES, PAYMENT_STATUS, PAYMENT_STATUS_VALUES } from '../utils/constants.js';

/**
 * Audit trail for every payment attempt.
 *
 * One document per attempt, so a customer who abandons Khalti and then pays with
 * eSewa leaves a complete, inspectable history. `gatewayRef` is *our* reference for
 * the attempt (`ACH-2026-000123-1`), sent to the gateway as Khalti's
 * `purchase_order_id` / eSewa's `transaction_uuid`, and the unique compound index on
 * (gateway, gatewayRef) is what makes a replayed callback impossible to process
 * twice.
 */
const paymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    gateway: { type: String, enum: PAYMENT_METHOD_VALUES, required: true, index: true },
    /** Amount in whole rupees, always taken from the server-calculated order total. */
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: CURRENCY },

    status: {
      type: String,
      enum: PAYMENT_STATUS_VALUES,
      default: PAYMENT_STATUS.PENDING,
      index: true,
    },

    /** Our reference sent to the gateway (Khalti purchase_order_id / eSewa transaction_uuid). */
    gatewayRef: { type: String, required: true },
    /** The gateway's own transaction id, known only after a successful verification. */
    transactionId: { type: String, default: null },

    attempt: { type: Number, default: 1 },
    /** Non-sensitive echo of what we sent, for support and reconciliation. */
    requestSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Whitelisted subset of the gateway response - never raw card/PII payloads. */
    responseSnapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    failureReason: { type: String, maxlength: 400 },
    verifiedAt: Date,
    refundedAt: Date,
    refundAmount: { type: Number, default: 0 },
    refundReference: String,
  },
  { timestamps: true }
);

// Guarantees a single gateway transaction can only ever back one payment record.
paymentSchema.index({ gateway: 1, gatewayRef: 1 }, { unique: true });
paymentSchema.index({ transactionId: 1 }, { sparse: true });
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, gateway: 1, createdAt: -1 });

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
