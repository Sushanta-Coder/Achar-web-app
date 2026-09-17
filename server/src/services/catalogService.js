import Product, { PRODUCT_CARD_FIELDS } from '../models/Product.js';
import Category from '../models/Category.js';
import ApiError from '../utils/ApiError.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { SORT_OPTIONS, SPICE_LEVELS } from '../utils/constants.js';

/**
 * Catalogue queries: listing, filtering, sorting, searching and faceting.
 *
 * Kept out of the controller because the storefront, the search page, the category
 * page and the admin product list all need the same filter semantics, and a subtle
 * difference between them (an inactive product showing in one place but not another)
 * is exactly the kind of bug that is hard to notice and embarrassing to ship.
 *
 * Search uses the compound text index on the product collection, which covers both
 * English and Devanagari names. When the query looks like a partial word - the normal
 * case while someone is typing - it falls back to a prefix regex, because a text
 * index matches whole terms only.
 */

/** Turns query-string filters into a Mongo match stage. */
export function buildProductFilter(query = {}, { includeInactive = false } = {}) {
  const filter = {};
  if (!includeInactive) filter.isActive = true;

  // `?status=` is admin-only: `all` shows everything, `inactive` shows only the
  // hidden ones (which no `includeInactive` boolean can express on its own).
  if (includeInactive) {
    if (query.status === 'inactive') filter.isActive = false;
    else if (query.status === 'active') filter.isActive = true;
  }

  if (query.category) filter.category = query.category;
  if (query.subcategory) filter.subcategory = query.subcategory;
  if (query.spiceLevel) {
    const levels = String(query.spiceLevel)
      .split(',')
      .filter((level) => SPICE_LEVELS.includes(level));
    if (levels.length) filter.spiceLevel = { $in: levels };
  }

  if (query.vegetarian === 'true') filter.isVegetarian = true;
  if (query.featured === 'true') filter.isFeatured = true;
  if (query.bestSeller === 'true') filter.isBestSeller = true;
  if (query.newArrival === 'true') filter.isNewArrival = true;
  if (query.onSale === 'true') filter.maxDiscountPercentage = { $gt: 0 };
  if (query.inStock === 'true') filter.totalStock = { $gt: 0 };

  // Price filters run against the denormalised minPrice so they can use an index.
  const min = Number.parseInt(query.minPrice, 10);
  const max = Number.parseInt(query.maxPrice, 10);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    filter.minPrice = {};
    if (Number.isFinite(min)) filter.minPrice.$gte = min;
    if (Number.isFinite(max)) filter.minPrice.$lte = max;
  }

  if (query.rating) {
    const rating = Number.parseFloat(query.rating);
    if (Number.isFinite(rating)) filter.ratingAverage = { $gte: rating };
  }

  return filter;
}

/**
 * Resolves `?category=slug` (what the URL carries) into the ObjectId the filter
 * needs, including any child categories so a parent page shows everything beneath it.
 */
export async function resolveCategoryFilter(slug) {
  if (!slug) return { category: null, ids: null };

  const category = await Category.findOne({ slug: String(slug).trim(), isActive: true });
  if (!category) throw ApiError.notFound('Category not found');

  const children = await Category.find({ parent: category._id, isActive: true }).select('_id');
  return { category, ids: [category._id, ...children.map((child) => child._id)] };
}

/** Builds the search clause, choosing text search or prefix matching as appropriate. */
function applySearch(filter, term) {
  const trimmed = String(term ?? '').trim();
  if (!trimmed) return { filter, textScore: false };

  // Short or single-token input is usually mid-typing, where a prefix match is far
  // more useful than a whole-word text match.
  const useRegex = trimmed.length < 3 || !trimmed.includes(' ');
  if (useRegex) {
    const pattern = new RegExp(escapeRegex(trimmed), 'i');
    return {
      filter: {
        ...filter,
        $or: [{ name: pattern }, { nameNp: pattern }, { keywords: pattern }, { sku: pattern }],
      },
      textScore: false,
    };
  }

  return { filter: { ...filter, $text: { $search: trimmed } }, textScore: true };
}

/**
 * The one product listing function.
 *
 * @returns {Promise<{products: Array, total: number, page: number, limit: number}>}
 */
export async function listProducts(query = {}, { includeInactive = false, fields } = {}) {
  const { page, limit, skip } = parsePagination(query);
  let filter = buildProductFilter(query, { includeInactive });

  // A slug in `?category=` wins over a raw id, since that is what the URLs use.
  if (query.category && !/^[0-9a-fA-F]{24}$/.test(String(query.category))) {
    const { ids } = await resolveCategoryFilter(query.category);
    filter.category = { $in: ids };
  }

  const { filter: searched, textScore } = applySearch(filter, query.q ?? query.search);
  filter = searched;

  const sortKey = query.sort && SORT_OPTIONS[query.sort] ? query.sort : null;
  const sort = textScore && !sortKey ? { score: { $meta: 'textScore' } } : SORT_OPTIONS[sortKey ?? 'popularity'];

  const projection = fields ?? PRODUCT_CARD_FIELDS;
  const selection = textScore ? { score: { $meta: 'textScore' } } : {};

  const [products, total] = await Promise.all([
    Product.find(filter, selection)
      .select(projection)
      .populate('category', 'name nameNp slug')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { products: products.map(decorateCard), total, page, limit };
}

/**
 * What a variant actually sells at.
 *
 * Mirrors the `effectivePrice` virtual on ProductVariant, and has to keep mirroring it:
 * these cards are built from `.lean()` documents, so the virtual is not there to call.
 * The guard is `&&` rather than `??` on purpose. `??` only falls back on null, so a
 * `discountPrice` of `0` reads as a real discount and puts the jar on the shop for
 * nothing - which is exactly what happened until the validator stopped writing zeroes.
 * Rows created before that fix still hold them. A discount at or above the list price
 * is ignored for the same reason the model ignores it: it is a typo, not an offer.
 */
function sellingPrice(variant) {
  return variant.discountPrice && variant.discountPrice < variant.price
    ? variant.discountPrice
    : variant.price;
}

/**
 * Adds the derived fields a product card needs. Computed here rather than stored so
 * a price change never leaves a stale badge behind.
 */
function decorateCard(product) {
  const variants = (product.variants ?? []).filter((variant) => variant.isActive);
  const cheapest = variants.reduce(
    (best, variant) => {
      const price = sellingPrice(variant);
      return !best || price < best.price ? { price, variant } : best;
    },
    null
  );

  return {
    ...product,
    variants: variants.map((variant) => ({
      ...variant,
      effectivePrice: sellingPrice(variant),
      inStock: (variant.availableStock ?? 0) > 0,
    })),
    defaultVariant: cheapest?.variant ?? null,
    price: cheapest?.price ?? product.minPrice,
    listPrice: cheapest?.variant?.price ?? product.maxPrice,
    inStock: (product.totalStock ?? 0) > 0,
  };
}

/** Product detail by slug, with everything the PDP renders. */
export async function getProductBySlug(slug, { includeInactive = false } = {}) {
  const filter = { slug: String(slug).trim() };
  if (!includeInactive) filter.isActive = true;

  const product = await Product.findOne(filter)
    .populate('category', 'name nameNp slug')
    .lean();

  if (!product) throw ApiError.notFound('Product not found');
  return decorateCard(product);
}

/**
 * Related products: same category first, topped up with best sellers so the section
 * is never half-empty on a thin category.
 */
export async function getRelatedProducts({ productId, categoryId, limit = 4 }) {
  const exclude = { _id: { $ne: productId }, isActive: true };

  const sameCategory = await Product.find({ ...exclude, category: categoryId })
    .select(PRODUCT_CARD_FIELDS)
    .sort({ soldCount: -1, ratingAverage: -1 })
    .limit(limit)
    .lean();

  if (sameCategory.length >= limit) return sameCategory.map(decorateCard);

  const seen = new Set(sameCategory.map((product) => String(product._id)));
  const filler = await Product.find({ ...exclude, _id: { $nin: [productId, ...seen] } })
    .select(PRODUCT_CARD_FIELDS)
    .sort({ soldCount: -1 })
    .limit(limit - sameCategory.length)
    .lean();

  return [...sameCategory, ...filler].map(decorateCard);
}

/**
 * Facet counts for the shop sidebar, computed against the *unfaceted* filter so the
 * counts show what each option would yield rather than always matching the current
 * selection.
 */
export async function getProductFacets(query = {}) {
  const base = buildProductFilter(
    { ...query, minPrice: undefined, maxPrice: undefined, spiceLevel: undefined },
    {}
  );

  const [rows] = await Product.aggregate([
    { $match: base },
    {
      $facet: {
        categories: [
          { $group: { _id: '$category', count: { $sum: 1 } } },
          {
            $lookup: {
              from: 'categories',
              localField: '_id',
              foreignField: '_id',
              as: 'category',
              pipeline: [{ $project: { name: 1, nameNp: 1, slug: 1 } }],
            },
          },
          { $unwind: '$category' },
          {
            $project: {
              _id: '$category._id',
              name: '$category.name',
              nameNp: '$category.nameNp',
              slug: '$category.slug',
              count: 1,
            },
          },
          { $sort: { count: -1 } },
        ],
        spiceLevels: [{ $group: { _id: '$spiceLevel', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
        priceRange: [
          { $group: { _id: null, min: { $min: '$minPrice' }, max: { $max: '$maxPrice' } } },
        ],
        flags: [
          {
            $group: {
              _id: null,
              onSale: { $sum: { $cond: [{ $gt: ['$maxDiscountPercentage', 0] }, 1, 0] } },
              inStock: { $sum: { $cond: [{ $gt: ['$totalStock', 0] }, 1, 0] } },
              vegetarian: { $sum: { $cond: ['$isVegetarian', 1, 0] } },
              bestSellers: { $sum: { $cond: ['$isBestSeller', 1, 0] } },
              newArrivals: { $sum: { $cond: ['$isNewArrival', 1, 0] } },
            },
          },
        ],
      },
    },
  ]);

  return {
    categories: rows?.categories ?? [],
    spiceLevels: (rows?.spiceLevels ?? []).map((row) => ({ level: row._id, count: row.count })),
    priceRange: { min: rows?.priceRange?.[0]?.min ?? 0, max: rows?.priceRange?.[0]?.max ?? 0 },
    flags: rows?.flags?.[0] ? omitId(rows.flags[0]) : {},
    sortOptions: Object.keys(SORT_OPTIONS),
  };
}

const omitId = ({ _id, ...rest }) => rest;

/** Type-ahead suggestions for the header search box. */
export async function suggest(term, { limit = 6 } = {}) {
  const trimmed = String(term ?? '').trim();
  if (trimmed.length < 2) return { products: [], categories: [] };

  const pattern = new RegExp(escapeRegex(trimmed), 'i');
  const [products, categories] = await Promise.all([
    Product.find({ isActive: true, $or: [{ name: pattern }, { nameNp: pattern }, { keywords: pattern }] })
      .select('name nameNp slug thumbnail minPrice')
      .sort({ soldCount: -1 })
      .limit(limit)
      .lean(),
    Category.find({ isActive: true, $or: [{ name: pattern }, { nameNp: pattern }] })
      .select('name nameNp slug')
      .limit(4)
      .lean(),
  ]);

  return { products, categories };
}

/** Fire-and-forget view counter - never allowed to slow down or fail a page load. */
export function incrementViewCount(productId) {
  Product.updateOne({ _id: productId }, { $inc: { viewCount: 1 } }).catch(() => {});
}

export default {
  buildProductFilter,
  resolveCategoryFilter,
  listProducts,
  getProductBySlug,
  getRelatedProducts,
  getProductFacets,
  suggest,
  incrementViewCount,
};
