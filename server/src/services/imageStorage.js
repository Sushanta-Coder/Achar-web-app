import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import env from '../config/env.js';
import logger from '../config/logger.js';
import ApiError from '../utils/ApiError.js';
import { getCloudinary, cloudinaryEnabled } from '../config/cloudinary.js';
import { slugify } from '../utils/slug.js';

/**
 * Where an uploaded image actually goes.
 *
 * Two drivers behind one interface, chosen at call time:
 *
 *  - `cloudinary` - used whenever keys are configured. The production path: the CDN
 *    resizes, re-encodes and serves, and the API stays stateless.
 *  - `local` - the fallback, so a fresh checkout with no Cloudinary account can still
 *    upload from the machine it is running on. Files land in `server/uploads/`
 *    (git-ignored) and are served back by `app.js` at `/uploads`.
 *
 * Binary data never reaches MongoDB either way - documents store only
 * `{url, publicId}`, which is what keeps them small and the driver swappable.
 *
 * The `publicId` is what makes deletion possible later, and it also carries the
 * driver: a local file's id is prefixed `local:` so `remove()` knows to unlink it
 * rather than call Cloudinary with an id that was never there.
 *
 * A caveat worth knowing before you rely on the local driver in production: the URL
 * it stores is absolute and built from `SERVER_URL`, and the files live on the
 * container's own disk. Render, Railway and Vercel all wipe that disk on every
 * deploy, so on a free stateless host the images survive until the next restart and
 * no longer. Configure Cloudinary before going live - it is free at the volume a
 * shop like this needs, and the driver switches over on its own once the keys exist.
 */

const LOCAL_PREFIX = 'local:';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** `server/uploads` - resolved from this file so the cwd does not matter. */
const UPLOAD_ROOT = path.resolve(__dirname, '../../uploads');

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

/**
 * `local` unless Cloudinary is configured. `UPLOAD_DRIVER=local` forces the disk
 * driver even with keys present, which is handy for testing this path.
 */
export function activeDriver() {
  if (process.env.UPLOAD_DRIVER === 'local') return 'local';
  return cloudinaryEnabled() ? 'cloudinary' : 'local';
}

/** Uploads always work now; the question is only which driver serves them. */
export const uploadsEnabled = () => true;

const randomSuffix = () => crypto.randomBytes(6).toString('hex');

/** `mula-ko-achar-3f9c1a` - readable, and collision-free without a lookup. */
function safeName(originalname = '') {
  const stem = slugify(originalname.replace(/\.[^.]+$/, ''), '') || 'image';
  return `${stem.slice(0, 60)}-${randomSuffix()}`;
}

// --- Cloudinary driver --------------------------------------------------------

/**
 * Eager transformations are cheap to declare and save the client from downloading a
 * 4000px original: `f_auto,q_auto` alone typically cuts a jar photo by 70%.
 */
const cloudinaryOptions = ({ folder, filename }) => ({
  folder,
  public_id: filename,
  resource_type: 'image',
  overwrite: false,
  unique_filename: true,
  use_filename: Boolean(filename),
  transformation: [
    { width: 1600, height: 1600, crop: 'limit' },
    { quality: 'auto', fetch_format: 'auto' },
  ],
});

function uploadToCloudinary(cloudinary, buffer, options) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
    stream.end(buffer);
  });
}

// --- Local driver ------------------------------------------------------------

/**
 * Resolves a path inside `UPLOAD_ROOT` and refuses anything that escapes it. The
 * folder is already an allow-listed leaf by the time it gets here, but a storage
 * layer that trusts its caller is one refactor away from being a traversal bug.
 */
function resolveLocalPath(...segments) {
  const target = path.resolve(UPLOAD_ROOT, ...segments);
  const root = path.resolve(UPLOAD_ROOT);
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw ApiError.forbidden('That image path is not allowed');
  }
  return target;
}

async function saveLocally({ buffer, mimetype, folder, filename }) {
  const extension = EXTENSIONS[mimetype];
  if (!extension) throw ApiError.badRequest('Only JPEG, PNG, WebP or AVIF images are accepted');

  const leaf = `${filename}.${extension}`;
  const directory = resolveLocalPath(folder);
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(resolveLocalPath(folder, leaf), buffer);

  const relative = `${folder}/${leaf}`;
  return {
    // Absolute so the storefront can render it whether it is served by Vite on
    // :5173 or by the API itself; `express.static` in app.js answers the path.
    url: `${env.serverUrl}/uploads/${relative}`,
    publicId: `${LOCAL_PREFIX}${relative}`,
    bytes: buffer.length,
    format: extension,
    driver: 'local',
  };
}

async function removeLocally(publicId) {
  const relative = publicId.slice(LOCAL_PREFIX.length);
  // Reject `..` before it ever reaches the filesystem, not after.
  if (relative.includes('..') || path.isAbsolute(relative)) {
    throw ApiError.forbidden('That image does not belong to this site');
  }
  try {
    await fs.unlink(resolveLocalPath(relative));
    return { existed: true };
  } catch (error) {
    // The caller wanted it gone, and it is. Anything else is a real failure.
    if (error.code === 'ENOENT') return { existed: false };
    throw error;
  }
}

// --- Public interface --------------------------------------------------------

/** The only shape the rest of the app knows about. */
const asImage = (result, driver) => ({
  url: result.secure_url ?? result.url,
  publicId: result.public_id ?? result.publicId,
  width: result.width,
  height: result.height,
  format: result.format,
  bytes: result.bytes,
  driver,
});

/**
 * Stores one buffered upload. `folder` must already be an allow-listed leaf
 * (`products`, `banners`, ...) - the controller resolves it.
 */
/**
 * Magic-byte signatures for the formats we accept.
 *
 * Multer's `fileFilter` can only see the `Content-Type` the *client* typed into the
 * multipart body, so `curl -F "images=@shell.php;type=image/png"` walks straight
 * past it. These check the bytes themselves.
 *
 * Nothing here is currently exploitable - only admins can upload, and the static
 * mount sends `nosniff` with an `image/*` content type, so a browser will not
 * execute an HTML file that arrives with a `.png` name. This is the layer that keeps
 * that true if any of those conditions ever changes.
 */
const SIGNATURES = {
  'image/jpeg': (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  // RIFF....WEBP - the size field sits between the two markers.
  'image/webp': (b) =>
    b.length > 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  // ISO-BMFF: `ftyp` at offset 4, then an AVIF brand.
  'image/avif': (b) =>
    b.length > 12 &&
    b.subarray(4, 8).toString('ascii') === 'ftyp' &&
    ['avif', 'avis'].includes(b.subarray(8, 12).toString('ascii')),
};

/** Throws unless the buffer really is the format its mime type claims. */
function assertRealImage(buffer, mimetype) {
  const matches = SIGNATURES[mimetype];
  if (!matches || !matches(buffer)) {
    throw ApiError.badRequest('That file is not a valid JPEG, PNG, WebP or AVIF image');
  }
}

export async function storeImage({ buffer, mimetype, originalname, folder }) {
  assertRealImage(buffer, mimetype);

  const driver = activeDriver();
  const filename = safeName(originalname);

  if (driver === 'cloudinary') {
    const cloudinary = getCloudinary();
    const result = await uploadToCloudinary(
      cloudinary,
      buffer,
      cloudinaryOptions({ folder: `${env.cloudinary.folder}/${folder}`, filename })
    );
    return asImage(result, 'cloudinary');
  }

  return asImage(await saveLocally({ buffer, mimetype, folder, filename }), 'local');
}

/**
 * Deletes a stored image. Routes to whichever driver wrote it, read from the id
 * itself rather than from the current config - a site that has since switched to
 * Cloudinary must still be able to clean up the files it wrote to disk before.
 */
export async function removeImage(publicId) {
  if (publicId.startsWith(LOCAL_PREFIX)) return removeLocally(publicId);

  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw ApiError.serviceUnavailable(
      'That image lives on Cloudinary, which is not configured on this server'
    );
  }
  if (!publicId.startsWith(`${env.cloudinary.folder}/`)) {
    throw ApiError.forbidden('That image does not belong to this site');
  }

  const result = await cloudinary.uploader.destroy(publicId, { invalidate: true });
  if (result.result !== 'ok' && result.result !== 'not found') {
    throw ApiError.badGateway(`Cloudinary could not delete that image (${result.result})`);
  }
  return { existed: result.result === 'ok' };
}

/** Called once at boot so the disk driver never fails its first write. */
export async function ensureLocalUploadDir() {
  if (activeDriver() !== 'local') return;
  await fs.mkdir(UPLOAD_ROOT, { recursive: true });
  logger.info(`Image uploads: local disk driver (${UPLOAD_ROOT})`);
}

export const uploadRoot = UPLOAD_ROOT;

export default { storeImage, removeImage, activeDriver, uploadsEnabled, ensureLocalUploadDir };
