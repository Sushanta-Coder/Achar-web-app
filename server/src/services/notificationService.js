import env from '../config/env.js';
import logger from '../config/logger.js';
import { sendMail } from './emailService.js';
import { getSettings } from './settingsService.js';
import { formatNpr } from '../utils/money.js';
import { ORDER_STATUS_LABELS, PAYMENT_METHOD_LABELS } from '../utils/constants.js';

/**
 * All customer-facing notifications live here, deliberately decoupled from the
 * order and auth services: those call `notify*` and never await the result, so a
 * slow or misconfigured SMTP server can never delay a checkout or fail a payment.
 *
 * Adding SMS (Sparrow SMS is the common Nepali provider) or push means adding a
 * channel inside these functions - no caller changes.
 */

const shell = (settings, title, bodyHtml) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title></head>
<body style="margin:0;padding:24px;background:#faf7f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#2b2724;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #ece5da;">
    <tr><td style="padding:20px 28px;background:#8f1d14;color:#fff;">
      <div style="font-size:20px;font-weight:700;letter-spacing:.2px;">${escape(settings.company.name)}</div>
      <div style="font-size:12px;opacity:.85;">${escape(settings.company.tagline)}</div>
    </td></tr>
    <tr><td style="padding:28px;">${bodyHtml}</td></tr>
    <tr><td style="padding:18px 28px;background:#faf7f2;font-size:12px;color:#6b625a;line-height:1.6;">
      ${escape(settings.company.legalName)}<br>
      ${escape(settings.company.address.street)}, ${escape(settings.company.address.municipality)}, ${escape(settings.company.address.district)}, Nepal<br>
      ${escape(settings.company.phone)} &middot; ${escape(settings.company.email)}
    </td></tr>
  </table>
</body></html>`;

const button = (href, label) =>
  `<a href="${href}" style="display:inline-block;padding:12px 22px;background:#8f1d14;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;">${escape(label)}</a>`;

function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function itemsTable(order) {
  const rows = order.items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe3;">
          ${escape(item.name)}<div style="font-size:12px;color:#6b625a;">${escape(item.size)} &times; ${item.quantity}</div>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ebe3;text-align:right;white-space:nowrap;">${formatNpr(item.lineTotal)}</td>
      </tr>`
    )
    .join('');

  const line = (label, value, bold = false) =>
    `<tr><td style="padding:6px 0;${bold ? 'font-weight:700;' : ''}">${escape(label)}</td>
     <td style="padding:6px 0;text-align:right;${bold ? 'font-weight:700;' : ''}">${value}</td></tr>`;

  return `<table role="presentation" width="100%" style="font-size:14px;border-collapse:collapse;margin:14px 0;">
    ${rows}
    ${line('Subtotal', formatNpr(order.pricing.subtotal))}
    ${order.pricing.couponDiscount ? line(`Coupon (${escape(order.coupon?.code ?? '')})`, `- ${formatNpr(order.pricing.couponDiscount)}`) : ''}
    ${line('Delivery', order.pricing.deliveryCharge ? formatNpr(order.pricing.deliveryCharge) : 'Free')}
    ${order.pricing.taxAmount ? line('VAT', formatNpr(order.pricing.taxAmount)) : ''}
    ${line('Total', formatNpr(order.pricing.total), true)}
  </table>`;
}

const orderUrl = (order) =>
  order.user
    ? `${env.clientUrl}/account/orders/${order.orderNumber}`
    : `${env.clientUrl}/track-order?order=${order.orderNumber}`;

// --- Public API --------------------------------------------------------------

export async function notifyWelcome(user) {
  const settings = await getSettings();
  return dispatch({
    to: user.email,
    subject: `Welcome to ${settings.company.name}`,
    html: shell(
      settings,
      'Welcome',
      `<h1 style="font-size:20px;margin:0 0 12px;">Namaste ${escape(user.name.split(' ')[0])} 🙏</h1>
       <p style="line-height:1.7;color:#4a423b;">Your account is ready. You can now track orders, save delivery addresses and check out faster.</p>
       <p style="margin:22px 0;">${button(`${env.clientUrl}/shop`, 'Browse our pickles')}</p>
       <p style="font-size:13px;color:#6b625a;">If you did not create this account, please reply to this email and we will remove it.</p>`
    ),
  });
}

export async function notifyOrderPlaced(order) {
  const settings = await getSettings();
  const paymentLine =
    order.paymentMethod === 'cod'
      ? 'Please keep the exact amount ready for our delivery partner.'
      : `We will confirm your order as soon as your ${PAYMENT_METHOD_LABELS[order.paymentMethod]} payment is verified.`;

  return dispatch({
    to: order.customer.email,
    subject: `Order ${order.orderNumber} received - ${settings.company.name}`,
    html: shell(
      settings,
      'Order received',
      `<h1 style="font-size:20px;margin:0 0 4px;">Thank you, ${escape(order.customer.name.split(' ')[0])}!</h1>
       <p style="color:#6b625a;margin:0 0 14px;">Order <strong>${escape(order.orderNumber)}</strong> &middot; ${escape(PAYMENT_METHOD_LABELS[order.paymentMethod])}</p>
       <p style="line-height:1.7;color:#4a423b;">${paymentLine}</p>
       ${itemsTable(order)}
       <p style="font-size:14px;color:#4a423b;line-height:1.7;"><strong>Delivering to</strong><br>${escape(order.shippingAddress.fullName)}, ${escape(order.customer.phone)}<br>${escape(order.shippingAddress.formatted ?? '')}</p>
       <p style="margin:22px 0;">${button(orderUrl(order), 'Track this order')}</p>`
    ),
  });
}

export async function notifyPaymentConfirmed(order, payment) {
  const settings = await getSettings();
  return dispatch({
    to: order.customer.email,
    subject: `Payment received for ${order.orderNumber}`,
    html: shell(
      settings,
      'Payment received',
      `<h1 style="font-size:20px;margin:0 0 12px;">Payment confirmed ✅</h1>
       <p style="line-height:1.7;color:#4a423b;">We have received ${formatNpr(payment.amount)} for order <strong>${escape(order.orderNumber)}</strong> via ${escape(PAYMENT_METHOD_LABELS[payment.gateway])}.</p>
       <p style="font-size:13px;color:#6b625a;">Transaction reference: ${escape(payment.transactionId ?? payment.gatewayRef)}</p>
       ${itemsTable(order)}
       <p style="margin:22px 0;">${button(orderUrl(order), 'View order')}</p>`
    ),
  });
}

export async function notifyOrderStatus(order, status) {
  const settings = await getSettings();
  const copy = {
    processing: 'We are preparing your pickles for packing.',
    packed: 'Your order is packed and waiting for pickup.',
    shipped: 'Your order has left our kitchen and is on its way.',
    out_for_delivery: 'Your order is out for delivery today. Our partner will call you shortly.',
    delivered: 'Your order has been delivered. We would love to hear what you think.',
    cancelled: `Your order has been cancelled.${order.cancelReason ? ` Reason: ${order.cancelReason}` : ''}`,
    refunded: 'Your refund has been processed. It may take a few working days to appear.',
  };
  if (!copy[status]) return { sent: false, skipped: true };

  return dispatch({
    to: order.customer.email,
    subject: `Order ${order.orderNumber} - ${ORDER_STATUS_LABELS[status]}`,
    html: shell(
      settings,
      ORDER_STATUS_LABELS[status],
      `<h1 style="font-size:20px;margin:0 0 12px;">${escape(ORDER_STATUS_LABELS[status])}</h1>
       <p style="line-height:1.7;color:#4a423b;">${escape(copy[status])}</p>
       ${order.delivery?.trackingNumber ? `<p style="font-size:14px;">Tracking: <strong>${escape(order.delivery.trackingNumber)}</strong>${order.delivery.courier ? ` (${escape(order.delivery.courier)})` : ''}</p>` : ''}
       <p style="margin:22px 0;">${button(orderUrl(order), 'Track this order')}</p>`
    ),
  });
}

export async function notifyPasswordReset(user, resetToken) {
  const settings = await getSettings();
  const link = `${env.clientUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
  return dispatch({
    to: user.email,
    subject: 'Reset your password',
    html: shell(
      settings,
      'Reset your password',
      `<h1 style="font-size:20px;margin:0 0 12px;">Reset your password</h1>
       <p style="line-height:1.7;color:#4a423b;">Use the button below to choose a new password. The link expires in 30 minutes and can only be used once.</p>
       <p style="margin:22px 0;">${button(link, 'Choose a new password')}</p>
       <p style="font-size:13px;color:#6b625a;">If you did not ask for this, you can safely ignore this email - your password will not change.</p>`
    ),
  });
}

export async function notifyContactReceived(message) {
  const settings = await getSettings();
  return dispatch({
    to: settings.company.supportEmail || settings.company.email,
    replyTo: message.email,
    subject: `[Contact] ${message.subject}`,
    html: shell(
      settings,
      'New contact message',
      `<h1 style="font-size:18px;margin:0 0 12px;">New message from the website</h1>
       <p style="font-size:14px;color:#4a423b;"><strong>${escape(message.name)}</strong><br>${escape(message.email)}${message.phone ? ` &middot; ${escape(message.phone)}` : ''}</p>
       <p style="white-space:pre-wrap;line-height:1.7;color:#4a423b;border-left:3px solid #e6c34a;padding-left:14px;">${escape(message.message)}</p>`
    ),
  });
}

/**
 * Fire-and-forget wrapper. Callers do not await notifications, so this must never
 * reject - a broken mail server should show up in the logs, not in a 500.
 */
function dispatch(payload) {
  return sendMail(payload).catch((error) => {
    logger.error('Notification dispatch failed:', error.message);
    return { sent: false, error: error.message };
  });
}

export default {
  notifyWelcome,
  notifyOrderPlaced,
  notifyPaymentConfirmed,
  notifyOrderStatus,
  notifyPasswordReset,
  notifyContactReceived,
};
