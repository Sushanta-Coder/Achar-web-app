import { v2 as cloudinary } from 'cloudinary';
import env from './env.js';
import logger from './logger.js';

let configured = false;

export function getCloudinary() {
  if (!env.cloudinary.enabled) return null;
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinary.cloudName,
      api_key: env.cloudinary.apiKey,
      api_secret: env.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
    logger.info(`Cloudinary configured (cloud: ${env.cloudinary.cloudName})`);
  }
  return cloudinary;
}

export const cloudinaryEnabled = () => env.cloudinary.enabled;

export default getCloudinary;
