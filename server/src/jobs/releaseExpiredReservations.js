import Order from '../models/Order.js';
import { releaseStock, linesFromOrder } from '../services/inventoryService.js';
import { releaseCoupon } from '../services/couponService.js';
import withTransaction from '../utils/transaction.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { ORDER_STATUS, PAYMENT_STATUS, ONLINE_PAYMENT_METHODS } from '../utils/constants.js';

/**
 * Releases stock held by checkouts that were never paid for.
 *
 * Placing an order reserves its stock so two customers cannot buy the last jar of
 * mango achar at once. If the customer then closes the Khalti tab, that reservation
 * would otherwise be held forever: the shelf count stays right, but `availableStock`
 * never recovers and the product silently stops being sellable. On a small catalogue
 * a handful of abandoned checkouts is enough to show "out of stock" on a shop that
 * is fully stocked - the single most damaging failure mode this job prevents.
 *
 * `RESERVATION_TTL_MINUTES` (default 45) is the grace period. It is generous on
 * purpose: a customer walking to a shop with better signal to complete an eSewa
 * payment is a real scenario in Nepal, and reclaiming their stock while they are
 * mid-payment would fail the payment at the last step.
 */
const BATCH = 100;

/**
 * An order is eligible when it was to be paid online, is still awaiting that
 * payment, has stock reserved, and its reservation window has passed.
 *
 * `paymentMethod` is the load-bearing condition. A cash-on-delivery order is created
 * with exactly the same `pending` / `reserved` shape as an abandoned online
 * checkout - it simply never gets a gateway callback, because there is no gateway.
 * Without this clause the sweep would cancel every COD order 45 minutes after it was
 * placed, which is the single worst thing this file could do.
 *
 * `paymentStatus` is checked as well as `status` for the opposite reason: a paid
 * order whose status write is lagging must never have its stock reclaimed.
 */
const expiredFilter = (now) => ({
  paymentMethod: { $in: ONLINE_PAYMENT_METHODS },
  status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_PENDING] },
  paymentStatus: { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED] },
  stockState: 'reserved',
  reservationExpiresAt: { $lt: now },
});

export async function releaseExpiredReservations({ now = new Date() } = {}) {
  const candidates = await Order.find(expiredFilter(now)).limit(BATCH);
  if (!candidates.length) return { released: 0, skipped: 0 };

  let released = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    try {
      await withTransaction(async (session) => {
        /**
         * Re-read inside the transaction and re-check the condition. Between the
         * query above and this write, the gateway callback may have landed and paid
         * for the order - releasing its stock then would oversell a real sale. The
         * re-check makes that race a no-op instead.
         */
        const order = await Order.findOne({
          _id: candidate._id,
          ...expiredFilter(now),
        }).session(session ?? null);

        if (!order) {
          skipped += 1;
          return;
        }

        await releaseStock(linesFromOrder(order), session);
        order.stockState = 'released';
        order.reservationExpiresAt = undefined;
        order.status = ORDER_STATUS.CANCELLED;
        order.cancelledAt = new Date();
        order.cancelReason = 'Payment was not completed in time';
        order.pushTimeline(
          ORDER_STATUS.CANCELLED,
          `Reservation expired after ${env.reservationTtlMinutes} minutes`
        );

        // The coupon goes back to the pool too, or a single-use code is burned by a
        // checkout that never became a sale.
        if (order.coupon?.couponId) {
          await releaseCoupon({ couponId: order.coupon.couponId, orderId: order._id }, session);
        }

        await order.save({ session });
        released += 1;
      });
    } catch (error) {
      // One bad order must not stop the sweep - the rest of the batch is still
      // holding stock that needs releasing.
      logger.error(`Could not release reservation for ${candidate.orderNumber}:`, error.message);
      skipped += 1;
    }
  }

  if (released) logger.info(`Released ${released} expired stock reservation(s)`);
  return { released, skipped };
}

/**
 * Runs the sweep on an interval.
 *
 * An in-process timer rather than a cron entry or a queue: it needs no extra
 * infrastructure on a small VPS, and the work is idempotent, so a second instance
 * running it concurrently is harmless - both re-check inside the transaction and the
 * loser simply finds nothing to do.
 *
 * `unref()` keeps the timer from holding the process alive during a graceful
 * shutdown, and the interval is capped so a long TTL still sweeps often enough to
 * matter.
 */
export function startReservationSweeper({ intervalMs } = {}) {
  const period = intervalMs ?? Math.min(env.reservationTtlMinutes, 5) * 60_000;

  const tick = () =>
    releaseExpiredReservations().catch((error) =>
      logger.error('Reservation sweep failed:', error.message)
    );

  const timer = setInterval(tick, period);
  timer.unref();

  logger.info(
    `Reservation sweeper started: every ${Math.round(period / 60_000)}m, TTL ${env.reservationTtlMinutes}m`
  );
  return () => clearInterval(timer);
}

export default releaseExpiredReservations;
