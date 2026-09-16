import DeliveryZone from '../models/DeliveryZone.js';
import { getSettings } from './settingsService.js';
import { VALLEY_DISTRICTS, provinceOf } from '../utils/nepal.js';
import logger from '../config/logger.js';

/**
 * Resolves a delivery address to a configurable zone and computes the charge.
 *
 * Nothing here is hardcoded - the seed script creates a sensible starting set of
 * zones and the admin edits them from Delivery Settings. Matching order:
 *   1. a zone that lists the exact district
 *   2. a zone that lists the province
 *   3. the zone flagged `isDefault`
 * Ties are broken by `priority` (lower wins), so a narrow "Kathmandu Valley" zone
 * can sit above a broad "Bagmati" zone.
 */
export async function resolveZone({ district, province }) {
  const zones = await DeliveryZone.find({ isActive: true }).sort({ priority: 1, charge: 1 }).lean();
  if (!zones.length) return null;

  const districtKey = String(district ?? '').toLowerCase();
  const provinceKey = String(province ?? provinceOf(district) ?? '').toLowerCase();

  const byDistrict = zones.find((zone) =>
    (zone.districts ?? []).some((d) => d.toLowerCase() === districtKey)
  );
  if (byDistrict) return byDistrict;

  const byProvince = zones.find((zone) =>
    (zone.provinces ?? []).some((p) => p.toLowerCase() === provinceKey)
  );
  if (byProvince) return byProvince;

  return zones.find((zone) => zone.isDefault) ?? null;
}

/**
 * @returns {{charge:number, zone:object|null, isFree:boolean, freeDeliveryThreshold:number,
 *            estimatedDays:{min:number,max:number}, codAvailable:boolean, codExtraCharge:number}}
 */
export async function quoteDelivery({ district, province, subtotal = 0, paymentMethod }) {
  const settings = await getSettings();
  const globalThreshold = settings.commerce.freeDeliveryThreshold ?? 0;

  const zone = await resolveZone({ district, province });

  if (!zone) {
    // No zone configured yet: charge nothing rather than guessing a price, and
    // make the misconfiguration loud in the logs.
    logger.warn(`No delivery zone matched district="${district}" province="${province}"`);
    return {
      charge: 0,
      zone: null,
      zoneName: 'Unzoned',
      isFree: true,
      freeDeliveryThreshold: globalThreshold,
      estimatedDays: { min: 2, max: 5 },
      codAvailable: true,
      codExtraCharge: 0,
      unresolved: true,
    };
  }

  const threshold = zone.freeDeliveryThreshold > 0 ? zone.freeDeliveryThreshold : globalThreshold;
  const qualifiesForFree = threshold > 0 && subtotal >= threshold;
  const codExtra =
    paymentMethod === 'cod' && zone.codExtraCharge > 0 ? zone.codExtraCharge : 0;

  return {
    charge: (qualifiesForFree ? 0 : zone.charge) + codExtra,
    zone,
    zoneName: zone.name,
    isFree: qualifiesForFree,
    freeDeliveryThreshold: threshold,
    estimatedDays: zone.estimatedDays ?? { min: 1, max: 3 },
    codAvailable: zone.codAvailable !== false,
    codExtraCharge: codExtra,
    unresolved: false,
  };
}

/**
 * The far end of the zone's `{min, max}` window - a promise the courier can keep.
 * `min` is deliberately ignored: quoting the optimistic end of the range as *the*
 * delivery date turns a normal delivery into a late one on the customer's order page.
 */
export function estimatedDeliveryDate({ max = 3 } = {}, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + max);
  return date;
}

/** Public shipping table for the Shipping & Delivery policy page. */
export async function getDeliveryTable() {
  const [zones, settings] = await Promise.all([
    DeliveryZone.find({ isActive: true }).sort({ priority: 1 }).lean(),
    getSettings(),
  ]);
  return {
    freeDeliveryThreshold: settings.commerce.freeDeliveryThreshold,
    zones: zones.map((zone) => ({
      id: zone._id,
      name: zone.name,
      nameNp: zone.nameNp,
      description: zone.description,
      districts: zone.districts,
      provinces: zone.provinces,
      charge: zone.charge,
      freeDeliveryThreshold: zone.freeDeliveryThreshold || settings.commerce.freeDeliveryThreshold,
      estimatedDays: zone.estimatedDays,
      codAvailable: zone.codAvailable,
    })),
  };
}

export { VALLEY_DISTRICTS };
export default { quoteDelivery, resolveZone, getDeliveryTable, estimatedDeliveryDate };
