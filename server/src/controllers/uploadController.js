import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import logger from '../config/logger.js';
import env from '../config/env.js';
import { storeImage, removeImage, activeDriver } from '../services/imageStorage.js';

/**
 * Image uploads.
 *
 * Staff-only, and deliberately thin: multer buffers the file in memory, and
 * `imageStorage` decides where it goes - Cloudinary when keys are configured, the
 * server's own `uploads/` directory otherwise. Either way the caller gets the same
 * `{url, publicId}` pair, which is all a product, banner, blog or settings document
 * ever stores.
 *
 * Binary data never goes into MongoDB - only the URL - which keeps documents small
 * and lets the storage driver change without a migration.
 *
 * `publicId` is stored alongside every URL specifically so `destroy` can clean up
 * the file later; a URL alone would leave orphans forever.
 */

/** Folders are an allow-list: a caller cannot write outside the account subtree. */
const FOLDERS = {
  products: 'products',
  categories: 'categories',
  banners: 'banners',
  blog: 'blog',
  reviews: 'reviews',
  site: 'site',
};

const resolveFolder = (requested) => FOLDERS[requested] ?? FOLDERS.products;

// --- Handlers ----------------------------------------------------------------

/** `POST /api/uploads/image` - multipart field `image`. */
export const uploadSingle = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach an image file in the "image" field');

  const image = await storeImage({
    buffer: req.file.buffer,
    mimetype: req.file.mimetype,
    originalname: req.file.originalname,
    folder: resolveFolder(req.body.folder),
  });

  logger.info(`Image uploaded (${image.driver}): ${image.publicId}`);
  return sendCreated(res, { message: 'Image uploaded', data: { image } });
});

/**
 * `POST /api/uploads/images` - multipart field `images` (up to 8).
 *
 * Uploads run concurrently but failures are reported per file rather than
 * aborting the batch: losing four good gallery images because the fifth was
 * corrupt would be the wrong trade for an admin re-uploading a product.
 */
export const uploadMultiple = asyncHandler(async (req, res) => {
  const files = req.files ?? [];
  if (!files.length) throw ApiError.badRequest('Attach one or more images in the "images" field');

  const folder = resolveFolder(req.body.folder);

  const settled = await Promise.allSettled(
    files.map((file) =>
      storeImage({
        buffer: file.buffer,
        mimetype: file.mimetype,
        originalname: file.originalname,
        folder,
      })
    )
  );

  const images = [];
  const failed = [];

  settled.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') {
      images.push(outcome.value);
    } else {
      const error = outcome.reason;
      logger.warn(`Upload failed for ${files[index].originalname}: ${error?.message}`);
      /**
       * A 4xx from the storage layer is something the admin can act on ("that file is
       * not a real PNG"), so it is worth repeating back. A 5xx is a Cloudinary outage
       * or a full disk - internal detail that stays in the log.
       */
      const actionable = error?.expose && error.statusCode < 500;
      failed.push({
        filename: files[index].originalname,
        reason: actionable ? error.message : 'Upload failed',
      });
    }
  });

  /**
   * When every file failed for the same actionable reason, lead with it - otherwise
   * the admin sees "try again" and retries an upload that can never succeed.
   */
  if (!images.length) {
    const reasons = [...new Set(failed.map((entry) => entry.reason))];
    if (reasons.length === 1 && reasons[0] !== 'Upload failed') {
      throw ApiError.badRequest(reasons[0], { details: { failed } });
    }
    throw ApiError.badGateway('None of the images could be uploaded. Try again.');
  }

  return sendCreated(res, {
    message: failed.length
      ? `${images.length} of ${files.length} images uploaded`
      : `${images.length} image${images.length === 1 ? '' : 's'} uploaded`,
    data: { images, failed },
  });
});

/**
 * `DELETE /api/uploads` with `{ publicId }` in the body.
 *
 * The id travels in the body rather than the path because Cloudinary public ids
 * contain slashes: `%2F` in a path segment is silently decoded by Nginx and some
 * CDNs, which would break the route only once it was behind a real proxy.
 *
 * `removeImage` scopes both drivers - Cloudinary ids to this account's configured
 * folder, local ids to the uploads directory - so the endpoint cannot be used to
 * reach a file it did not write.
 */
export const destroy = asyncHandler(async (req, res) => {
  const publicId = String(req.body?.publicId ?? '').trim();
  if (!publicId) throw ApiError.badRequest('Which image should be deleted?');

  const { existed } = await removeImage(publicId);

  logger.info(`Image deleted: ${publicId}`);
  return sendSuccess(res, { message: 'Image deleted', data: { publicId, existed } });
});

/**
 * Lets the admin UI describe what it is about to do - "upload to Cloudinary" or
 * "store on this server" - instead of guessing, and keeps the old `enabled` flag
 * for any caller that only wants to know whether the button works.
 */
export const status = asyncHandler(async (_req, res) => {
  const driver = activeDriver();
  return sendSuccess(res, {
    data: {
      enabled: true,
      driver,
      folder: driver === 'cloudinary' ? env.cloudinary.folder : 'uploads',
      /**
       * Local storage lives on the container's disk, which most free hosts wipe on
       * deploy. The admin UI surfaces this so nobody discovers it after a restart.
       */
      persistent: driver === 'cloudinary',
      maxBytes: env.uploadMaxBytes,
      maxFiles: 8,
      accepted: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
    },
  });
});

export default { uploadSingle, uploadMultiple, destroy, status };
