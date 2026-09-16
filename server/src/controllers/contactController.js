import ContactMessage from '../models/ContactMessage.js';
import Subscriber from '../models/Subscriber.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { stripTags } from '../utils/sanitize.js';
import { sendCsv, datedFilename } from '../utils/csv.js';
import { notifyContactReceived } from '../services/notificationService.js';
import { track } from '../services/analyticsService.js';
import { getSettings } from '../services/settingsService.js';
import logger from '../config/logger.js';

/**
 * Contact form and newsletter.
 *
 * Both are unauthenticated writes, so both are rate limited at the route and
 * stripped of markup here - a contact message is displayed in an admin table and
 * forwarded in an email, and neither should ever render submitted HTML.
 *
 * The email notification is fire-and-forget: a customer's message is saved to the
 * database first and the mail server is a best-effort second step, so an SMTP
 * outage loses a notification rather than the enquiry itself.
 */

const CONTACT_STATUS = ['new', 'read', 'replied', 'archived'];

// --- Public ------------------------------------------------------------------

export const submit = asyncHandler(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;

  const record = await ContactMessage.create({
    name: stripTags(name),
    email,
    phone: phone || undefined,
    subject: stripTags(subject),
    message: stripTags(message),
    source: 'contact-form',
  });

  // Saved first, mailed second - the enquiry is never lost to a mail failure.
  notifyContactReceived(record).catch((error) =>
    logger.error('Contact notification failed:', error.message)
  );

  return sendCreated(res, {
    message: 'Thank you for writing to us. We usually reply within one business day.',
    data: { id: String(record._id) },
  });
});

/**
 * Newsletter signup.
 *
 * An existing address is answered with the same success message as a new one.
 * Telling an anonymous caller "that email is already subscribed" would turn the
 * form into a way to test whether a given address is on the list.
 */
export const subscribe = asyncHandler(async (req, res) => {
  const email = String(req.body.email).toLowerCase().trim();
  const name = req.body.name ? stripTags(req.body.name) : undefined;

  const existing = await Subscriber.findOne({ email });

  if (existing) {
    // Re-subscribing after an unsubscribe is a normal thing to want to do.
    if (!existing.isActive) {
      existing.isActive = true;
      existing.unsubscribedAt = undefined;
      if (name) existing.name = name;
      await existing.save();
    }
  } else {
    await Subscriber.create({ email, name, source: req.body.source || 'footer' });
    track({ type: 'newsletter_signup', sessionId: req.body.sessionId, user: req.user });
  }

  return sendSuccess(res, {
    message: 'You are on the list. Look out for new pickles and offers.',
    data: { subscribed: true },
  });
});

/**
 * One-click unsubscribe from an email footer link. Deactivates rather than
 * deletes, so the address is not re-added by a stale import and the opt-out is
 * auditable.
 */
export const unsubscribe = asyncHandler(async (req, res) => {
  // `req.body` is undefined on the GET form of this route (an email footer link
  // carries the address in the query string and sends no body at all).
  const email = String(req.body?.email ?? req.query.email ?? '').toLowerCase().trim();
  if (!email) throw ApiError.badRequest('Which email address should be removed?');

  await Subscriber.updateOne(
    { email },
    { $set: { isActive: false, unsubscribedAt: new Date() } }
  );

  // Unconditional success, for the same reason as `subscribe`.
  return sendSuccess(res, {
    message: 'You have been unsubscribed. Sorry to see you go.',
    data: { unsubscribed: true },
  });
});

/** Company contact details for the Contact page - a projection of site settings. */
export const details = asyncHandler(async (_req, res) => {
  const settings = await getSettings();
  const { company } = settings;

  return sendSuccess(res, {
    data: {
      name: company.name,
      nameNp: company.nameNp,
      email: company.email,
      supportEmail: company.supportEmail,
      phone: company.phone,
      whatsapp: company.whatsapp,
      landline: company.landline,
      address: company.address,
      geo: company.geo,
      mapUrl: company.mapUrl,
      openingHours: company.openingHours,
      social: company.social,
    },
  });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { subject: pattern }, { message: pattern }];
  }

  const [messages, total, counts] = await Promise.all([
    ContactMessage.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    ContactMessage.countDocuments(filter),
    ContactMessage.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return sendSuccess(res, {
    data: {
      messages,
      // Seeded with every status so the tab bar does not shift as counts change.
      counts: counts.reduce(
        (acc, row) => ({ ...acc, [row._id]: row.count }),
        Object.fromEntries(CONTACT_STATUS.map((status) => [status, 0]))
      ),
    },
    meta: paginationMeta({ page, limit, total }),
  });
});

/** Opening a message marks it read, so the "new" badge reflects real attention. */
export const adminGetById = asyncHandler(async (req, res) => {
  const message = await ContactMessage.findById(req.params.id);
  if (!message) throw ApiError.notFound('Message not found');

  if (message.status === 'new') {
    message.status = 'read';
    await message.save();
  }

  return sendSuccess(res, { data: { message } });
});

export const adminUpdate = asyncHandler(async (req, res) => {
  const message = await ContactMessage.findById(req.params.id);
  if (!message) throw ApiError.notFound('Message not found');

  if (req.body.status) message.status = req.body.status;
  if (req.body.adminNote !== undefined) message.adminNote = stripTags(req.body.adminNote);
  await message.save();

  return sendSuccess(res, { message: 'Message updated', data: { message } });
});

export const adminRemove = asyncHandler(async (req, res) => {
  const message = await ContactMessage.findByIdAndDelete(req.params.id);
  if (!message) throw ApiError.notFound('Message not found');
  return sendSuccess(res, { message: 'Message deleted' });
});

// --- Admin: subscribers -------------------------------------------------------

export const adminSubscribers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50 });
  const filter = {};

  if (req.query.active !== undefined) filter.isActive = req.query.active === 'true';
  if (req.query.q) filter.email = new RegExp(escapeRegex(req.query.q), 'i');

  const [subscribers, total, active] = await Promise.all([
    Subscriber.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Subscriber.countDocuments(filter),
    Subscriber.countDocuments({ isActive: true }),
  ]);

  return sendSuccess(res, {
    data: { subscribers, activeTotal: active },
    meta: paginationMeta({ page, limit, total }),
  });
});

/**
 * CSV of active subscribers for whichever mailing tool the company uses. Only
 * active rows are exported, so an unsubscribe cannot be undone by re-importing
 * yesterday's file.
 */
export const adminExportSubscribers = asyncHandler(async (_req, res) => {
  const subscribers = await Subscriber.find({ isActive: true })
    .select('email name createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const rows = [
    ['Email', 'Name', 'Subscribed On'],
    ...subscribers.map((subscriber) => [
      subscriber.email,
      subscriber.name ?? '',
      new Date(subscriber.createdAt).toISOString().slice(0, 10),
    ]),
  ];

  return sendCsv(res, { filename: datedFilename('subscribers'), rows });
});

export default {
  submit,
  subscribe,
  unsubscribe,
  details,
  adminList,
  adminGetById,
  adminUpdate,
  adminRemove,
  adminSubscribers,
  adminExportSubscribers,
};
