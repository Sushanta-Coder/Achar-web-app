import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Thin transport wrapper. Templates live in `notificationService`; this module
 * only knows how to put a message on the wire.
 *
 * When SMTP is not configured (local development, CI) messages are logged instead
 * of sent, so no code path has to branch on "is email set up".
 */
let transporter = null;

function getTransporter() {
  if (!env.email.enabled) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.email.host,
      port: env.email.port,
      secure: env.email.secure,
      auth: { user: env.email.user, pass: env.email.password },
    });
  }
  return transporter;
}

/**
 * @returns {Promise<{sent:boolean, skipped?:boolean, messageId?:string}>}
 *   Never throws - a failed notification must not fail the order it describes.
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  const transport = getTransporter();
  if (!transport) {
    logger.info(`[email skipped - SMTP not configured] to=${to} subject="${subject}"`);
    return { sent: false, skipped: true };
  }
  try {
    const info = await transport.sendMail({
      from: env.email.from,
      to,
      subject,
      html,
      text: text ?? stripHtml(html),
      replyTo,
    });
    logger.info(`Email sent to ${to} (${info.messageId})`);
    return { sent: true, messageId: info.messageId };
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error.message);
    return { sent: false, error: error.message };
  }
}

export function stripHtml(html = '') {
  return String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function verifyTransport() {
  const transport = getTransporter();
  if (!transport) return { ok: false, reason: 'SMTP not configured' };
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export default { sendMail, verifyTransport };
