import BlogPost from '../models/BlogPost.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated, paginationMeta } from '../utils/ApiResponse.js';
import { parsePagination, escapeRegex } from '../utils/pagination.js';
import { slugify, uniqueSlug } from '../utils/slug.js';
import { sanitizeHtml, stripTags } from '../utils/sanitize.js';
import { BLOG_CATEGORIES, BLOG_STATUS, BLOG_STATUS_VALUES } from '../utils/constants.js';

/**
 * Blog.
 *
 * The public handlers only ever see published posts - `publicFilter()` is applied
 * in the query rather than checked after fetching, so a draft cannot leak through
 * a listing, a related-posts rail or a sitemap.
 *
 * Admin-authored HTML goes through `sanitizeHtml` on write, not on read: the
 * stored value is already safe, so rendering it never depends on remembering to
 * sanitise at the call site.
 */

/**
 * Built fresh on every call - a module-level constant would freeze `publishedAt`
 * at boot and silently stop honouring scheduled posts.
 */
const publicFilter = () => ({
  status: BLOG_STATUS.PUBLISHED,
  publishedAt: { $lte: new Date() },
});

const LIST_FIELDS =
  'title titleNp slug excerpt excerptNp featuredImage category tags authorName ' +
  'publishedAt readingMinutes viewCount createdAt';

// --- Public ------------------------------------------------------------------

export const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 9 });
  const filter = publicFilter();

  if (req.query.category) filter.category = req.query.category;
  if (req.query.tag) filter.tags = new RegExp(`^${escapeRegex(req.query.tag)}$`, 'i');
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ title: pattern }, { excerpt: pattern }, { tags: pattern }];
  }

  const [posts, total] = await Promise.all([
    BlogPost.find(filter).select(LIST_FIELDS).sort({ publishedAt: -1 }).skip(skip).limit(limit).lean(),
    BlogPost.countDocuments(filter),
  ]);

  return sendSuccess(res, {
    data: { posts },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const getBySlug = asyncHandler(async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, ...publicFilter() }).lean();
  if (!post) throw ApiError.notFound('Article not found');

  // Fire-and-forget: a view counter must never delay the article.
  BlogPost.updateOne({ _id: post._id }, { $inc: { viewCount: 1 } }).catch(() => {});

  const [related, adjacent] = await Promise.all([
    BlogPost.find({
      _id: { $ne: post._id },
      category: post.category,
      ...publicFilter(),
    })
      .select(LIST_FIELDS)
      .sort({ publishedAt: -1 })
      .limit(3)
      .lean(),
    neighbours(post),
  ]);

  return sendSuccess(res, { data: { post, related, ...adjacent } });
});

/** Previous / next article by publish date, for the in-article navigation. */
async function neighbours(post) {
  const [previous, next] = await Promise.all([
    BlogPost.findOne({ publishedAt: { $lt: post.publishedAt }, status: BLOG_STATUS.PUBLISHED })
      .select('title slug')
      .sort({ publishedAt: -1 })
      .lean(),
    BlogPost.findOne({
      publishedAt: { $gt: post.publishedAt, $lte: new Date() },
      status: BLOG_STATUS.PUBLISHED,
    })
      .select('title slug')
      .sort({ publishedAt: 1 })
      .lean(),
  ]);
  return { previous, next };
}

/** Category and tag counts for the blog sidebar. */
export const taxonomy = asyncHandler(async (_req, res) => {
  const [categories, tags] = await Promise.all([
    BlogPost.aggregate([
      { $match: publicFilter() },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    BlogPost.aggregate([
      { $match: publicFilter() },
      { $unwind: '$tags' },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]),
  ]);

  const counted = new Map(categories.map((row) => [row._id, row.count]));

  return sendSuccess(res, {
    data: {
      // Every category is listed, including empty ones, so the filter UI is stable.
      categories: BLOG_CATEGORIES.map((category) => ({
        category,
        count: counted.get(category) ?? 0,
      })),
      tags: tags.map((row) => ({ tag: row._id, count: row.count })),
    },
  });
});

/** The three most recent articles, for the homepage rail and the footer. */
export const latest = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 3, 12);
  const posts = await BlogPost.find(publicFilter())
    .select(LIST_FIELDS)
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();
  return sendSuccess(res, { data: { posts } });
});

// --- Admin -------------------------------------------------------------------

export const adminList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20 });
  const filter = {};

  if (req.query.status) filter.status = req.query.status;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.q) {
    const pattern = new RegExp(escapeRegex(req.query.q), 'i');
    filter.$or = [{ title: pattern }, { slug: pattern }, { tags: pattern }];
  }

  const [posts, total, counts] = await Promise.all([
    BlogPost.find(filter)
      .select(`${LIST_FIELDS} status updatedAt`)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    BlogPost.countDocuments(filter),
    BlogPost.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);

  return sendSuccess(res, {
    data: {
      posts,
      // Seeded with every status so a tab reads "Draft 0" rather than disappearing.
      counts: counts.reduce(
        (acc, row) => ({ ...acc, [row._id]: row.count }),
        Object.fromEntries(BLOG_STATUS_VALUES.map((status) => [status, 0]))
      ),
    },
    meta: paginationMeta({ page, limit, total }),
  });
});

export const adminGetById = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id).lean();
  if (!post) throw ApiError.notFound('Article not found');
  return sendSuccess(res, { data: { post } });
});

export const create = asyncHandler(async (req, res) => {
  const body = { ...req.body };

  body.slug = await resolveSlug(body.slug || body.title);
  body.content = sanitizeHtml(body.content);
  if (body.contentNp) body.contentNp = sanitizeHtml(body.contentNp);
  body.excerpt = stripTags(body.excerpt);
  if (body.excerptNp) body.excerptNp = stripTags(body.excerptNp);
  body.tags = normaliseTags(body.tags);

  // Attribution defaults to the signed-in author but stays editable, so a post can
  // be credited to a chef or guest writer who has no admin account.
  body.author = req.user._id;
  body.authorName = body.authorName || req.user.name;

  const post = await BlogPost.create(body);
  return sendCreated(res, { message: `"${post.title}" created`, data: { post } });
});

export const update = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw ApiError.notFound('Article not found');

  const body = { ...req.body };

  if (body.slug && body.slug !== post.slug) {
    body.slug = await resolveSlug(body.slug, post._id);
  } else {
    delete body.slug;
  }
  if (body.content) body.content = sanitizeHtml(body.content);
  if (body.contentNp) body.contentNp = sanitizeHtml(body.contentNp);
  if (body.excerpt) body.excerpt = stripTags(body.excerpt);
  if (body.excerptNp) body.excerptNp = stripTags(body.excerptNp);
  if (body.tags) body.tags = normaliseTags(body.tags);

  post.set(body);
  await post.save(); // pre-save recomputes readingMinutes and stamps publishedAt

  return sendSuccess(res, { message: 'Article saved', data: { post } });
});

/** Publish / unpublish without sending the whole document back. */
export const setStatus = asyncHandler(async (req, res) => {
  const post = await BlogPost.findById(req.params.id);
  if (!post) throw ApiError.notFound('Article not found');

  post.status = req.body.status;
  // Reverting to draft clears the publish date so re-publishing later reads as new.
  if (post.status !== BLOG_STATUS.PUBLISHED && !req.body.keepPublishedAt) {
    post.publishedAt = null;
  }
  await post.save();

  return sendSuccess(res, {
    message: post.status === BLOG_STATUS.PUBLISHED ? 'Article published' : `Article set to ${post.status}`,
    data: { post: { id: String(post._id), status: post.status, publishedAt: post.publishedAt } },
  });
});

export const remove = asyncHandler(async (req, res) => {
  const post = await BlogPost.findByIdAndDelete(req.params.id);
  if (!post) throw ApiError.notFound('Article not found');
  return sendSuccess(res, { message: `"${post.title}" deleted` });
});

// --- Helpers -----------------------------------------------------------------

/** Slugs are unique across the collection, so a URL always names one article. */
async function resolveSlug(source, excludeId) {
  const base = slugify(source);
  if (!base) throw ApiError.badRequest('Could not build a URL from that title');

  return uniqueSlug(base, async (candidate) => {
    const filter = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };
    return Boolean(await BlogPost.exists(filter));
  });
}

const normaliseTags = (tags = []) => [
  ...new Set(
    tags
      .map((tag) => stripTags(String(tag)).toLowerCase().trim())
      .filter((tag) => tag.length > 1)
  ),
];

export default {
  list,
  getBySlug,
  taxonomy,
  latest,
  adminList,
  adminGetById,
  create,
  update,
  setStatus,
  remove,
};
