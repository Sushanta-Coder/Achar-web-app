import { Router } from 'express';
import * as uploads from '../controllers/uploadController.js';
import { requireAuth, requireStaff } from '../middleware/auth.js';
import { singleImage, multipleImages } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { uploadFolderSchema, deleteUploadSchema } from '../validators/contentValidators.js';

/**
 * `/api/uploads`
 *
 * Staff-only in its entirety. There is no public or customer upload path anywhere in
 * the API: review photos are the one thing a customer might send, and they are
 * deliberately not supported rather than opened up as an anonymous write to a
 * third-party image host.
 *
 * `validate` runs *after* multer on the two multipart routes. The `folder` field
 * arrives as part of the multipart body, so it does not exist until multer has parsed
 * the request - validating first would see an empty body and quietly drop the folder.
 */
const router = Router();

router.use(requireAuth, requireStaff);

/** Whether Cloudinary is configured, so the admin UI can explain a disabled button. */
router.get('/status', uploads.status);

router.post(
  '/image',
  singleImage,
  validate({ body: uploadFolderSchema }),
  uploads.uploadSingle
);
router.post(
  '/images',
  multipleImages,
  validate({ body: uploadFolderSchema }),
  uploads.uploadMultiple
);

/**
 * The public id travels in the body, not the path: Cloudinary ids contain slashes,
 * and `%2F` in a path segment is silently decoded by Nginx and several CDNs - the
 * route would work locally and break the first time it sat behind a real proxy.
 *
 * The controller additionally refuses any id outside this deployment's folder, so a
 * compromised staff session cannot reach another tenant's media.
 */
router.delete('/', validate({ body: deleteUploadSchema }), uploads.destroy);

export default router;
