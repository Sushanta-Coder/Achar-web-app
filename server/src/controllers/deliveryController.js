import DeliveryZone from '../models/DeliveryZone.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import { quoteDelivery, resolveZone, getDeliveryTable } from '../services/deliveryService.js';
import { PROVINCE_NAMES, districtsOf, provinceOf } from '../utils/nepal.js';

/**
 * Delivery zones and quotes.
 *
 * A quote is a read: it resolves an address to a configured zone and reports the
 * charge. It is never the number an order is billed for - `pricingService`
 * recomputes delivery from the same zones at checkout, so a stale or tampered
 * quote cannot change what a customer pays.
 */

// --- Public ------------------------------------------------------------------

/**
 * Live delivery quote for the cart and checkout pages.
 *
 * `subtotal` is only used to decide whether the free-delivery threshold is met -
 * a lie about it changes the displayed charge and nothing else, because checkout
 * recalculates from the real cart.
 */
export const quote = asyncHandler(async (req, res) => {
  const { district, province, subtotal, paymentMethod } = req.query;

  const result = await quoteDelivery({
    district,
    province: province || provinceOf(district),
    subtotal,
    paymentMethod,
  });

  return sendSuccess(res, {
    data: {
      charge: result.charge,
      isFree: result.isFree,
      zoneName: result.zoneName,
      freeDeliveryThreshold: result.freeDeliveryThreshold,
      amountToFreeDelivery:
        result.freeDeliveryThreshold > 0 && !result.isFree
          ? Math.max(0, result.freeDeliveryThreshold - Number(subtotal ?? 0))
          : 0,
      estimatedDays: result.estimatedDays,
      codAvailable: result.codAvailable,
      codExtraCharge: result.codExtraCharge,
      unresolved: result.unresolved,
    },
  });
});

/** The shipping table rendered on the Shipping & Delivery policy page. */
export const table = asyncHandler(async (_req, res) =>
  sendSuccess(res, { data: await getDeliveryTable() })
);

/** "Do you deliver to my district?" - the postcode-checker widget. */
export const checkDistrict = asyncHandler(async (req, res) => {
  const district = String(req.query.district ?? '').trim();
  if (!district) throw ApiError.badRequest('Enter a district');

  const province = provinceOf(district);
  if (!province) {
    return sendSuccess(res, {
      data: { district, recognised: false, deliverable: false, province: null, zone: null },
    });
  }

  const zone = await resolveZone({ district, province });

  return sendSuccess(res, {
    data: {
      district,
      province,
      recognised: true,
      // Every Nepali district is served through the fallback zone; this reports
      // *how*, so the widget can quote a real charge and lead time.
      deliverable: Boolean(zone),
      zone: zone
        ? {
            name: zone.name,
            charge: zone.charge,
            estimatedDays: zone.estimatedDays,
            codAvailable: zone.codAvailable,
          }
        : null,
    },
  });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (_req, res) => {
  const zones = await DeliveryZone.find().sort({ priority: 1, name: 1 }).lean();

  return sendSuccess(res, {
    data: {
      zones,
      provinces: PROVINCE_NAMES,
      // Districts not named by any active zone fall through to the default zone.
      // Surfacing them makes an accidental coverage gap visible.
      uncovered: uncoveredDistricts(zones),
      hasDefault: zones.some((zone) => zone.isDefault && zone.isActive),
    },
  });
});

/** Districts no active zone lists explicitly, by province. */
function uncoveredDistricts(zones) {
  const active = zones.filter((zone) => zone.isActive);
  const named = new Set(
    active.flatMap((zone) => (zone.districts ?? []).map((district) => district.toLowerCase()))
  );
  const provinces = new Set(
    active.flatMap((zone) => (zone.provinces ?? []).map((province) => province.toLowerCase()))
  );

  const gaps = {};
  for (const province of PROVINCE_NAMES) {
    if (provinces.has(province.toLowerCase())) continue;
    const missing = districtsOf(province).filter(
      (district) => !named.has(district.toLowerCase())
    );
    if (missing.length) gaps[province] = missing;
  }
  return gaps;
}

export const adminGetById = asyncHandler(async (req, res) => {
  const zone = await DeliveryZone.findById(req.params.id).lean();
  if (!zone) throw ApiError.notFound('Delivery zone not found');

  const orders = await Order.countDocuments({ 'delivery.zoneId': zone._id });
  return sendSuccess(res, { data: { zone, orders } });
});

export const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  body.districts = normaliseDistricts(body.districts, body.provinces);

  // Exactly one fallback zone, enforced here rather than trusted from the form.
  if (body.isDefault) await DeliveryZone.updateMany({}, { $set: { isDefault: false } });

  const zone = await DeliveryZone.create(body);
  return sendCreated(res, { message: `Zone "${zone.name}" created`, data: { zone } });
});

export const update = asyncHandler(async (req, res) => {
  const zone = await DeliveryZone.findById(req.params.id);
  if (!zone) throw ApiError.notFound('Delivery zone not found');

  const body = { ...req.body };
  if (body.districts) {
    body.districts = normaliseDistricts(body.districts, body.provinces ?? zone.provinces);
  }

  if (body.isDefault === true) {
    await DeliveryZone.updateMany({ _id: { $ne: zone._id } }, { $set: { isDefault: false } });
  }
  if (body.isDefault === false && zone.isDefault && !(await anotherDefaultExists(zone._id))) {
    throw ApiError.badRequest(
      'This is the only fallback zone. Mark another zone as the fallback before clearing this one.'
    );
  }

  zone.set(body);
  await zone.save();

  return sendSuccess(res, { message: 'Zone saved', data: { zone } });
});

const anotherDefaultExists = async (excludeId) =>
  Boolean(await DeliveryZone.exists({ _id: { $ne: excludeId }, isDefault: true }));

/**
 * Rejects districts that are not real, and drops any whose province the zone
 * already covers wholesale - listing "Kathmandu" under a zone that covers all of
 * Bagmati is redundant and makes the zone table harder to read.
 */
function normaliseDistricts(districts = [], provinces = []) {
  const covered = new Set(provinces.map((province) => String(province).toLowerCase()));

  const cleaned = [];
  const unknown = [];

  for (const raw of districts) {
    const district = String(raw).trim();
    if (!district) continue;

    const province = provinceOf(district);
    if (!province) {
      unknown.push(district);
      continue;
    }
    if (covered.has(province.toLowerCase())) continue;
    if (!cleaned.some((name) => name.toLowerCase() === district.toLowerCase())) {
      // Store the canonical spelling so district matching stays reliable.
      cleaned.push(canonicalDistrict(district, province));
    }
  }

  if (unknown.length) {
    throw ApiError.badRequest(`Not a Nepali district: ${unknown.join(', ')}`, {
      details: { districts: `Unknown district(s): ${unknown.join(', ')}` },
    });
  }

  return cleaned;
}

const canonicalDistrict = (district, province) =>
  districtsOf(province).find((name) => name.toLowerCase() === district.toLowerCase()) ?? district;

/**
 * A zone that orders reference is deactivated rather than deleted, so a historical
 * order can still say which zone set its delivery charge.
 */
export const remove = asyncHandler(async (req, res) => {
  const zone = await DeliveryZone.findById(req.params.id);
  if (!zone) throw ApiError.notFound('Delivery zone not found');

  if (zone.isDefault) {
    throw ApiError.badRequest(
      'The fallback zone cannot be deleted. Mark another zone as the fallback first.'
    );
  }

  if (await Order.exists({ 'delivery.zoneId': zone._id })) {
    zone.isActive = false;
    await zone.save();
    return sendSuccess(res, {
      message: 'This zone has orders against it, so it was deactivated instead of deleted',
      data: { deactivated: true },
    });
  }

  await zone.deleteOne();
  return sendSuccess(res, { message: `Zone "${zone.name}" deleted`, data: { deactivated: false } });
});

export default {
  quote,
  table,
  checkDistrict,
  adminList,
  adminGetById,
  create,
  update,
  remove,
};
