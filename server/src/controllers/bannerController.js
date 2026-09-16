import Banner from '../models/Banner.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import { BANNER_POSITIONS } from '../utils/constants.js';

/**
 * Promotional banners.
 *
 * The public endpoint returns only banners that are live *right now* - active,
 * started and not yet ended. The scheduling window is evaluated in the query, so
 * a festival banner set for next week is invisible until then without anyone
 * having to remember to switch it on.
 *
 * Desktop and mobile artwork are separate fields: the client picks with a
 * `<picture>` source rather than shipping a 1920px hero to a phone.
 */

const publicBanner = (banner) => ({
  id: String(banner._id),
  title: banner.title,
  titleNp: banner.titleNp,
  subtitle: banner.subtitle,
  subtitleNp: banner.subtitleNp,
  image: {
    desktop: banner.image?.desktop?.url ?? '',
    // Falls back to the desktop file so a banner is never imageless on mobile.
    mobile: banner.image?.mobile?.url || banner.image?.desktop?.url || '',
    alt: banner.image?.alt ?? '',
  },
  link: banner.link,
  ctaLabel: banner.ctaLabel,
  position: banner.position,
  order: banner.order,
});

/** Live-window filter, rebuilt per request so `now` is never stale. */
const liveFilter = (position) => {
  const now = new Date();
  const filter = {
    isActive: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  };
  if (position) filter.position = position;
  return filter;
};

// --- Public ------------------------------------------------------------------

/**
 * Every live banner, grouped by position, so the homepage fetches its hero,
 * mid-page strip and sidebar art in one request.
 */
export const listLive = asyncHandler(async (req, res) => {
  const banners = await Banner.find(liveFilter(req.query.position))
    .sort({ position: 1, order: 1, createdAt: -1 })
    .lean();

  const grouped = Object.fromEntries(BANNER_POSITIONS.map((position) => [position, []]));
  for (const banner of banners) {
    (grouped[banner.position] ??= []).push(publicBanner(banner));
  }

  return sendSuccess(res, { data: { banners: grouped, count: banners.length } });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.position) filter.position = req.query.position;

  const banners = await Banner.find(filter).sort({ position: 1, order: 1 });
  const now = new Date();

  return sendSuccess(res, {
    data: {
      banners: banners.map((banner) => ({
        ...banner.toObject(),
        isLive: banner.isLive(now),
      })),
      positions: BANNER_POSITIONS,
    },
  });
});

export const adminGetById = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id).lean();
  if (!banner) throw ApiError.notFound('Banner not found');
  return sendSuccess(res, { data: { banner } });
});

export const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  // An empty mobile URL from the form means "use the desktop image", not "".
  if (body.image && !body.image.mobile?.url) delete body.image.mobile;

  // New banners go to the end of their position rather than fighting for order 0.
  if (body.order === undefined || body.order === 0) {
    const last = await Banner.findOne({ position: body.position })
      .select('order')
      .sort({ order: -1 })
      .lean();
    body.order = (last?.order ?? -1) + 1;
  }

  const banner = await Banner.create(body);
  return sendCreated(res, { message: `Banner "${banner.title}" created`, data: { banner } });
});

export const update = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');

  const body = { ...req.body };
  // Clearing the mobile artwork has to be explicit: omitting the field on a PATCH
  // would otherwise leave the old file in place forever.
  if (body.image && !body.image.mobile?.url) {
    body.image = { ...body.image, mobile: { url: '', publicId: '' } };
  }

  banner.set(body);
  await banner.save();

  return sendSuccess(res, { message: 'Banner saved', data: { banner } });
});

export const toggle = asyncHandler(async (req, res) => {
  const banner = await Banner.findById(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');

  banner.isActive = !banner.isActive;
  await banner.save();

  return sendSuccess(res, {
    message: banner.isActive ? 'Banner is now visible' : 'Banner hidden',
    data: { id: String(banner._id), isActive: banner.isActive, isLive: banner.isLive() },
  });
});

/**
 * Saves a drag-and-drop reorder in one round trip. Only ids already in the
 * requested position are touched, so a stale client list cannot move a banner
 * into a section the admin was not editing.
 */
export const reorder = asyncHandler(async (req, res) => {
  const { position, ids } = req.body;

  const banners = await Banner.find({ position, _id: { $in: ids } }).select('_id').lean();
  const known = new Set(banners.map((banner) => String(banner._id)));

  const operations = ids
    .filter((id) => known.has(String(id)))
    .map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    }));

  if (operations.length) await Banner.bulkWrite(operations);

  return sendSuccess(res, {
    message: 'Order saved',
    data: { updated: operations.length, ignored: ids.length - operations.length },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const banner = await Banner.findByIdAndDelete(req.params.id);
  if (!banner) throw ApiError.notFound('Banner not found');
  return sendSuccess(res, { message: `Banner "${banner.title}" deleted` });
});

export default { listLive, adminList, adminGetById, create, update, toggle, reorder, remove };
