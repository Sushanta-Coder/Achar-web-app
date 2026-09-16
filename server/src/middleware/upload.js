import multer from 'multer';
import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif']);

/**
 * Images are buffered in memory and streamed straight to Cloudinary - nothing is
 * written to the server's disk, which keeps stateless hosts (Render, Railway,
 * Vercel functions) working and removes a local-file attack surface.
 */
const storage = multer.memoryStorage();

export const uploadImages = multer({
  storage,
  limits: { fileSize: env.uploadMaxBytes, files: 8 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(ApiError.badRequest('Only JPEG, PNG, WebP or AVIF images are accepted'));
      return;
    }
    cb(null, true);
  },
});

export const singleImage = uploadImages.single('image');
export const multipleImages = uploadImages.array('images', 8);

export default uploadImages;
