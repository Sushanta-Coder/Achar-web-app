import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import { getSettings } from './settingsService.js';
import { formatNpr } from '../utils/money.js';
import {
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS,
} from '../utils/constants.js';

/**
 * Invoices, rendered as self-contained printable HTML.
 *
 * A PDF library would add megabytes to the server for something every browser
 * already does well: this document has a print stylesheet, so "Print / Save as PDF"
 * produces a clean A4 invoice. It also means the invoice can be opened, read and
 * emailed as a link without a download step.
 *
 * Every figure is read from the order snapshot, never recalculated - an invoice must
 * still show what the customer actually paid even after prices change.
 */

export async function getInvoiceData({ orderNumber, user, allowStaff = false }) {
  const order = await Order.findOne({ orderNumber: String(orderNumber).trim().toUpperCase() });
  if (!order) throw ApiError.notFound('Order not found');

  // Guests reach their invoice through the tracking flow, which has already proven
  // ownership; signed-in customers may only ever see their own.
  if (!allowStaff && order.user && String(order.user) !== String(user?._id)) {
    throw ApiError.forbidden('This invoice belongs to another account');
  }

  const settings = await getSettings();
  return { order, settings };
}

export async function renderInvoiceHtml({ orderNumber, user, allowStaff = false }) {
  const { order, settings } = await getInvoiceData({ orderNumber, user, allowStaff });
  return invoiceTemplate(order, settings);
}

const money = (value) => formatNpr(value ?? 0);

const npDate = (date) =>
  date
    ? new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';

function escape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function invoiceTemplate(order, settings) {
  const { company } = settings;
  const paid = order.paymentStatus === PAYMENT_STATUS.PAID;

  const rows = order.items
    .map(
      (item, index) => `<tr>
      <td class="num">${index + 1}</td>
      <td>
        <strong>${escape(item.name)}</strong>
        <div class="muted">${escape(item.size)} &middot; SKU ${escape(item.sku)}</div>
      </td>
      <td class="num">${money(item.unitPrice)}</td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.lineTotal)}</td>
    </tr>`
    )
    .join('');

  const totalLine = (label, value, options = {}) => `<tr class="${options.strong ? 'strong' : ''}">
      <td colspan="4">${escape(label)}</td><td class="num">${value}</td>
    </tr>`;

  const address = order.shippingAddress;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Invoice ${escape(order.orderNumber)} - ${escape(company.name)}</title>
<style>
  :root { --ink:#2b2724; --muted:#6b625a; --line:#e6ded2; --brand:#8f1d14; --cream:#faf7f2; }
  * { box-sizing:border-box; }
  body { margin:0; padding:32px 20px; background:var(--cream); color:var(--ink);
         font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  .sheet { max-width:820px; margin:0 auto; background:#fff; border:1px solid var(--line);
           border-radius:12px; padding:36px; }
  header { display:flex; justify-content:space-between; gap:24px; flex-wrap:wrap;
           border-bottom:2px solid var(--brand); padding-bottom:20px; }
  .brand { font-size:24px; font-weight:800; color:var(--brand); letter-spacing:.2px; }
  .muted { color:var(--muted); font-size:13px; }
  h1 { font-size:20px; margin:0 0 4px; letter-spacing:.4px; text-transform:uppercase; }
  .meta { text-align:right; }
  .badge { display:inline-block; padding:4px 12px; border-radius:999px; font-size:12px;
           font-weight:700; letter-spacing:.4px; text-transform:uppercase; }
  .badge.paid { background:#e8f5ea; color:#1f7a37; }
  .badge.due  { background:#fdf0e6; color:#a45410; }
  .cols { display:flex; gap:32px; flex-wrap:wrap; margin:26px 0; }
  .cols section { flex:1 1 240px; }
  .label { font-size:11px; font-weight:700; letter-spacing:1px; text-transform:uppercase;
           color:var(--muted); margin-bottom:6px; }
  table { width:100%; border-collapse:collapse; margin-top:8px; font-size:14px; }
  th { text-align:left; font-size:11px; letter-spacing:.8px; text-transform:uppercase;
       color:var(--muted); border-bottom:1px solid var(--line); padding:8px 10px; }
  td { padding:10px; border-bottom:1px solid #f2ece3; vertical-align:top; }
  .num { text-align:right; white-space:nowrap; }
  th.num { text-align:right; }
  tfoot td { border:none; padding:6px 10px; }
  tfoot .strong td { font-size:17px; font-weight:800; border-top:2px solid var(--brand);
                     padding-top:12px; }
  footer { margin-top:30px; padding-top:18px; border-top:1px solid var(--line);
           font-size:12px; color:var(--muted); line-height:1.7; }
  .actions { max-width:820px; margin:0 auto 16px; text-align:right; }
  button { font:inherit; padding:9px 18px; border:none; border-radius:9px; cursor:pointer;
           background:var(--brand); color:#fff; font-weight:600; }
  @media print {
    body { background:#fff; padding:0; }
    .sheet { border:none; border-radius:0; padding:0; max-width:none; }
    .actions { display:none; }
    @page { size:A4; margin:16mm; }
  }
</style>
</head>
<body>
<div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button></div>

<div class="sheet">
  <header>
    <div>
      <div class="brand">${escape(company.name)}</div>
      <div class="muted">
        ${escape(company.legalName)}<br>
        ${escape(company.address.street)}, ${escape(company.address.municipality)}<br>
        ${escape(company.address.district)}, ${escape(company.address.province)}, Nepal<br>
        ${escape(company.phone)} &middot; ${escape(company.email)}
        ${company.panNumber ? `<br>PAN: ${escape(company.panNumber)}` : ''}
      </div>
    </div>
    <div class="meta">
      <h1>Invoice</h1>
      <div class="muted">
        <strong>${escape(order.orderNumber)}</strong><br>
        Issued ${npDate(order.createdAt)}<br>
        ${order.paidAt ? `Paid ${npDate(order.paidAt)}<br>` : ''}
      </div>
      <div style="margin-top:10px;">
        <span class="badge ${paid ? 'paid' : 'due'}">${paid ? 'Paid' : 'Payment due'}</span>
      </div>
    </div>
  </header>

  <div class="cols">
    <section>
      <div class="label">Billed to</div>
      <strong>${escape(order.customer.name)}</strong><br>
      <span class="muted">${escape(order.customer.email)}<br>${escape(order.customer.phone)}</span>
    </section>
    <section>
      <div class="label">Delivery address</div>
      <strong>${escape(address.fullName)}</strong><br>
      <span class="muted">${escape(address.formatted ?? '')}${address.landmark ? `<br>Near ${escape(address.landmark)}` : ''}</span>
    </section>
    <section>
      <div class="label">Payment &amp; delivery</div>
      <span class="muted">
        ${escape(PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod)}
        &middot; ${escape(ORDER_STATUS_LABELS[order.status] ?? order.status)}<br>
        ${order.delivery?.zoneName ? `${escape(order.delivery.zoneName)}<br>` : ''}
        ${order.delivery?.trackingNumber ? `Tracking: ${escape(order.delivery.trackingNumber)}` : ''}
      </span>
    </section>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:34px;">#</th><th>Item</th>
        <th class="num">Unit price</th><th class="num">Qty</th><th class="num">Amount</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      ${totalLine('Subtotal', money(order.pricing.subtotal))}
      ${order.pricing.itemDiscount ? totalLine('Product discount', `- ${money(order.pricing.itemDiscount)}`) : ''}
      ${order.pricing.couponDiscount ? totalLine(`Coupon ${order.coupon?.code ?? ''}`, `- ${money(order.pricing.couponDiscount)}`) : ''}
      ${totalLine('Delivery charge', order.pricing.deliveryCharge ? money(order.pricing.deliveryCharge) : 'Free')}
      ${order.pricing.taxAmount ? totalLine(`${settings.commerce.taxLabel} (${order.pricing.taxRate}%)`, money(order.pricing.taxAmount)) : ''}
      ${totalLine('Total', money(order.pricing.total), { strong: true })}
    </tfoot>
  </table>

  <footer>
    ${settings.commerce.pricesIncludeTax ? 'All prices are inclusive of applicable taxes.' : ''}
    ${order.customerNote ? `<br><strong>Order note:</strong> ${escape(order.customerNote)}` : ''}
    <br>Thank you for supporting a Nepali kitchen. Questions about this invoice? Write to
    ${escape(company.supportEmail || company.email)} quoting ${escape(order.orderNumber)}.
    <br>This is a computer-generated invoice and does not require a signature.
  </footer>
</div>
</body>
</html>`;
}

export default { getInvoiceData, renderInvoiceHtml };
