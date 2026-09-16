import Product from '../models/Product.js';
import Category from '../models/Category.js';
import Review from '../models/Review.js';
import Order from '../models/Order.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import {
  listProducts,
  getProductBySlug,
  getRelatedProducts,
  getProductFacets,
  suggest,
  incrementViewCount,
  resolveCategoryFilter,
} from '../services/catalogService.js';
import { setVariantStock } from '../services/inventoryService.js';
import { track } from '../services/analyticsService.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { REVIEW_STATUS } from '../utils/constants.js';

/**
 * Products.
 *
 * The public handlers are thin: `catalogService` owns filtering and sorting so the
 * shop page, the category page, search and the admin list cannot drift apart. The
 * admin handlers own slug generation and the derived-field bookkeeping that has to
 * happen through `save()` (the pre-save hook recomputes minPrice/totalStock).
 */

const isStaff = (req) => Boolean(req.user?.isStaff?.());

export const list = asyncHandler(async (req, res) => {
  const { products, total, page, limit } = await listProducts(req.query);
  return sendSuccess(res, {
    data: { products },
    meta: paginationMeta({ page, limit, total }),
  });
});

/** Product detail page: the product, its approved reviews and related items. */
export const getBySlug = asyncHandler(async (req, res) => {
  const product = await getProductBySlug(req.params.slug, { includeInactive: isStaff(req) });

  const [reviews, related] = await Promise.all([
    Review.find({ product: product._id, status: REVIEW_STATUS.APPROVED })
      .select('rating title comment images helpfulCount isVerifiedPurchase createdAt adminResponse user')
      .populate('user', 'name')
      .sort({ helpfulCount: -1, createdAt: -1 })
      .limit(10)
      .lean(),
    getRelatedProducts({
      productId: product._id,
      categoryId: product.category?._id ?? product.category,
      limit: 4,
    }),
  ]);

  // Neither of these may delay the response.
  incrementViewCount(product._id);
  track({
    type: 'product_view',
    sessionId: req.query.sessionId,
    user: req.user,
    product: product._id,
  });

  return sendSuccess(res, {
    data: {
      product,
      reviews: reviews.map((review) => ({
        ...review,
        // Only the first name is published, never the email.
        author: review.user?.name?.split(' ')[0] ?? 'Customer',
        user: undefined,
      })),
      ratingBreakdown: await ratingBreakdown(product._id),
      related,
    },
  });
});

/** Star distribution for the reviews widget. */
async function ratingBreakdown(productId) {
  const rows = await Review.aggregate([
    { $match: { product: productId, status: REVIEW_STATUS.APPROVED } },
    { $group: { _id: '$rating', count: { $sum: 1 } } },
  ]);
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  rows.forEach((row) => { counts[row._id] = row.count; });
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { counts, total };
}

export const facets = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: await getProductFacets(req.query) })
);

export const suggestions = asyncHandler(async (req, res) => {
  const data = await suggest(req.query.q);
  if (req.query.q?.length >= 2) {
    track({ type: 'search', sessionId: req.query.sessionId, meta: { term: req.query.q } });
  }
  return sendSuccess(res, { data });
});

/** Full search results page - identical semantics to the shop, plus event tracking. */
export const search = asyncHandler(async (req, res) => {
  const { products, total, page, limit } = await listProducts(req.query);
  if (req.query.q) {
    track({
      type: 'search',
      sessionId: req.query.sessionId,
      meta: { term: req.query.q, resultCount: total },
    });
  }
  return sendSuccess(res, {
    data: { products, query: req.query.q ?? '' },
    meta: paginationMeta({ page, limit, total }),
  });
});

/** Home page rails, in one round trip so the landing page is a single request. */
export const storefront = asyncHandler(async (_req, res) => {
  const [featured, bestSellers, newArrivals, onSale] = await Promise.all([
    listProducts({ featured: 'true', limit: 8 }),
    listProducts({ bestSeller: 'true', limit: 8, sort: 'popularity' }),
    listProducts({ newArrival: 'true', limit: 8, sort: 'newest' }),
    listProducts({ onSale: 'true', limit: 8 }),
  ]);

  return sendSuccess(res, {
    data: {
      featured: featured.products,
      bestSellers: bestSellers.products,
      newArrivals: newArrivals.products,
      onSale: onSale.products,
    },
  });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  // `status` is interpreted by buildProductFilter: all | active | inactive.
  const { products, total, page, limit } = await listProducts(
    { ...req.query, limit: req.query.limit ?? 20 },
    {
      includeInactive: true,
      fields:
        'name nameNp slug sku thumbnail category variants minPrice maxPrice totalStock ' +
        'isActive isFeatured isBestSeller isNewArrival soldCount ratingAverage updatedAt',
    }
  );

  return sendSuccess(res, {
    data: { products },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const adminGetById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id).populate('category', 'name slug').lean();
  if (!product) throw ApiError.notFound('Product not found');
  return sendSuccess(res, { data: { product } });
});

export const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  const category = await Category.findById(body.category);
  if (!category) throw ApiError.badRequest('Choose a valid category', { details: { category: 'Category not found' } });

  body.slug = await uniqueSlug(
    slugify(body.slug || body.name),
    (candidate) => Product.exists({ slug: candidate })
  );

  await assertSkusAreFree(body);
  // Exactly one default variant, whatever the client sent.
  normaliseVariantDefaults(body.variants);

  const product = await Product.create(body);
  await Category.updateOne({ _id: category._id }, { $inc: { productCount: 1 } });

  return sendCreated(res, { message: 'Product created', data: { product } });
});

export const update = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const body = { ...req.body };
  const previousCategory = String(product.category);

  if (body.category && body.category !== previousCategory) {
    const category = await Category.findById(body.category);
    if (!category) throw ApiError.badRequest('Choose a valid category', { details: { category: 'Category not found' } });
  }

  if (body.slug && slugify(body.slug) !== product.slug) {
    body.slug = await uniqueSlug(
      slugify(body.slug),
      (candidate) => Product.exists({ slug: candidate, _id: { $ne: product._id } })
    );
  } else {
    delete body.slug;
  }

  if (body.variants) {
    await assertSkusAreFree({ ...body, _id: product._id });
    normaliseVariantDefaults(body.variants);
    // Preserve reservations: a stock edit must not silently free reserved units.
    body.variants = body.variants.map((incoming) => {
      const existing = incoming._id ? product.variants.id(incoming._id) : null;
      if (!existing) return incoming;
      const reserved = existing.reservedStock ?? 0;
      return { ...incoming, reservedStock: reserved, availableStock: Math.max(0, incoming.stock - reserved) };
    });
  }

  product.set(body);
  await product.save();

  if (body.category && String(body.category) !== previousCategory) {
    await Promise.all([
      Category.updateOne({ _id: previousCategory }, { $inc: { productCount: -1 } }),
      Category.updateOne({ _id: body.category }, { $inc: { productCount: 1 } }),
    ]);
  }

  return sendSuccess(res, { message: 'Product updated', data: { product } });
});

/**
 * Products are deactivated, not deleted, when they appear in order history: an
 * order line must always be able to resolve back to the product it was sold from.
 */
export const remove = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw ApiError.notFound('Product not found');

  const sold = await Order.exists({ 'items.product': product._id });

  if (sold) {
    product.isActive = false;
    await product.save();
    return sendSuccess(res, {
      message: 'This product has been sold before, so it was deactivated instead of deleted',
      data: { deactivated: true },
    });
  }

  await product.deleteOne();
  await Category.updateOne({ _id: product.category }, { $inc: { productCount: -1 } });
  return sendSuccess(res, { message: 'Product deleted', data: { deactivated: false } });
});

export const updateStock = asyncHandler(async (req, res) => {
  const variant = await setVariantStock({
    productId: req.params.id,
    variantId: req.body.variantId,
    stock: req.body.stock,
  });
  return sendSuccess(res, { message: 'Stock updated', data: { variant } });
});

export const bulkStatus = asyncHandler(async (req, res) => {
  const { ids, isActive } = req.body;
  const result = await Product.updateMany({ _id: { $in: ids } }, { $set: { isActive } });
  return sendSuccess(res, {
    message: `${result.modifiedCount} product(s) ${isActive ? 'activated' : 'deactivated'}`,
    data: { modified: result.modifiedCount },
  });
});

// --- Helpers -----------------------------------------------------------------

/** SKUs identify stock in the warehouse, so they must be unique across products. */
async function assertSkusAreFree({ _id, sku, variants = [] }) {
  const skus = [sku, ...variants.map((variant) => variant.sku)].filter(Boolean);
  const duplicatesInPayload = skus.filter((value, index) => skus.indexOf(value) !== index);
  if (duplicatesInPayload.length) {
    throw ApiError.badRequest(`Duplicate SKU in this product: ${duplicatesInPayload[0]}`, {
      details: { sku: `Duplicate SKU: ${duplicatesInPayload[0]}` },
    });
  }

  const clash = await Product.findOne({
    ...(_id ? { _id: { $ne: _id } } : {}),
    $or: [{ sku: { $in: skus } }, { 'variants.sku': { $in: skus } }],
  }).select('name sku');

  if (clash) {
    throw ApiError.conflict(`That SKU is already used by "${clash.name}"`, {
      details: { sku: `Already used by "${clash.name}"` },
    });
  }
}

function normaliseVariantDefaults(variants = []) {
  const active = variants.filter((variant) => variant.isActive !== false);
  if (!active.length) return;
  const chosen = active.find((variant) => variant.isDefault) ?? active[0];
  variants.forEach((variant) => { variant.isDefault = variant === chosen; });
}

// --- Categories --------------------------------------------------------------

export const listCategories = asyncHandler(async (req, res) => {
  const filter = {};
  if (!req.query.includeInactive) filter.isActive = true;
  if (req.query.featured === 'true') filter.isFeatured = true;

  const categories = await Category.find(filter)
    .select('name nameNp slug description icon image parent order isActive isFeatured productCount')
    .sort({ order: 1, name: 1 })
    .lean();

  if (req.query.tree !== 'true') return sendSuccess(res, { data: { categories } });

  // Two levels is all the catalogue needs; deeper nesting would be a navigation problem.
  const roots = categories.filter((category) => !category.parent);
  const byParent = new Map();
  categories
    .filter((category) => category.parent)
    .forEach((child) => {
      const key = String(child.parent);
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(child);
    });

  return sendSuccess(res, {
    data: {
      categories: roots.map((root) => ({ ...root, children: byParent.get(String(root._id)) ?? [] })),
    },
  });
});

/** Category landing page: the category, its children and its first page of products. */
export const getCategoryBySlug = asyncHandler(async (req, res) => {
  const { category } = await resolveCategoryFilter(req.params.slug);
  const children = await Category.find({ parent: category._id, isActive: true })
    .select('name nameNp slug icon image productCount')
    .sort({ order: 1 })
    .lean();

  const { products, total, page, limit } = await listProducts({
    ...req.query,
    category: category.slug,
  });

  return sendSuccess(res, {
    data: { category: category.toObject({ virtuals: true }), children, products },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const createCategory = asyncHandler(async (req, res) => {
  const body = { ...req.body };
  body.slug = await uniqueSlug(
    slugify(body.slug || body.name),
    (candidate) => Category.exists({ slug: candidate })
  );
  if (body.parent) {
    const parent = await Category.findById(body.parent);
    if (!parent) throw ApiError.badRequest('Parent category not found');
    if (parent.parent) throw ApiError.badRequest('Categories can only be nested one level deep');
  }
  const category = await Category.create(body);
  return sendCreated(res, { message: 'Category created', data: { category } });
});

export const updateCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const body = { ...req.body };
  if (body.slug && slugify(body.slug) !== category.slug) {
    body.slug = await uniqueSlug(
      slugify(body.slug),
      (candidate) => Category.exists({ slug: candidate, _id: { $ne: category._id } })
    );
  } else {
    delete body.slug;
  }

  if (body.parent && String(body.parent) === String(category._id)) {
    throw ApiError.badRequest('A category cannot be its own parent');
  }

  category.set(body);
  await category.save();
  return sendSuccess(res, { message: 'Category updated', data: { category } });
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);
  if (!category) throw ApiError.notFound('Category not found');

  const [products, children] = await Promise.all([
    Product.countDocuments({ category: category._id }),
    Category.countDocuments({ parent: category._id }),
  ]);

  if (products > 0) {
    throw ApiError.conflict(`${products} product(s) still use this category - move them first`);
  }
  if (children > 0) {
    throw ApiError.conflict('Remove or move the subcategories first');
  }

  await category.deleteOne();
  return sendSuccess(res, { message: 'Category deleted' });
});

/** Recomputes `productCount` for every category, for after a bulk import. */
export const recountCategories = asyncHandler(async (_req, res) => {
  const rows = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const counts = new Map(rows.map((row) => [String(row._id), row.count]));
  const categories = await Category.find().select('_id');

  await Promise.all(
    categories.map((category) =>
      Category.updateOne(
        { _id: category._id },
        { $set: { productCount: counts.get(String(category._id)) ?? 0 } }
      )
    )
  );

  return sendSuccess(res, { message: 'Category counts recalculated', data: { categories: categories.length } });
});

export default {
  list,
  getBySlug,
  facets,
  suggestions,
  search,
  storefront,
  adminList,
  adminGetById,
  create,
  update,
  remove,
  updateStock,
  bulkStatus,
  listCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  recountCategories,
};
