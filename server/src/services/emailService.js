import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Thin transport wrapper. Templates live in `notificationService`; this module
 * only knows how to put a message on the wire.
 *
 * Two transports, chosen by `EMAIL_PROVIDER`:
 *
 *  - `brevo` posts to Brevo's REST API over 443. This is the one that works on a free
 *    host: Render, Fly and friends block outbound 25/465/587 to keep spammers out, so an
 *    SMTP transport there fails on connect no matter how correct the credentials are.
 *  - `smtp` is plain nodemailer, for a paid host or local testing against Mailpit.
 *
 * When neither is configured (local development, CI) messages are logged instead of sent,
 * so no code path has to branch on "is email set up".
 */

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

let transporter = null;

function getTransporter() {
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
 * Splits `EMAIL_FROM` into the `{name, email}` pair Brevo wants. Accepts both
 * `Deeva Achar <hi@example.com>` and a bare `hi@example.com`.
 */
export function parseAddress(value = '') {
  const match = String(value).match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  if (match) return { name: match[1].replace(/^"|"$/g, '') || undefined, email: match[2] };
  return { email: String(value).trim() };
}

async function sendViaBrevo({ to, subject, html, text, replyTo }) {
  const sender = parseAddress(env.email.from);
  const response = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': env.email.brevoApiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text,
      ...(replyTo ? { replyTo: parseAddress(replyTo) } : {}),
    }),
  });

  if (!response.ok) {
    // Brevo puts the useful part in `message` - an unverified sender or a bad key both
    // land here, and both are worth reading verbatim in the logs.
    const detail = await response.text().catch(() => '');
    throw new Error(`Brevo responded ${response.status}: ${detail.slice(0, 300)}`);
  }

  const body = await response.json().catch(() => ({}));
  return body.messageId ?? 'brevo';
}

/**
 * @returns {Promise<{sent:boolean, skipped?:boolean, messageId?:string, error?:string}>}
 *   Never throws - a failed notification must not fail the order it describes.
 */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (!env.email.enabled) {
    logger.info(`[email skipped - ${env.email.provider} not configured] to=${to} subject="${subject}"`);
    return { sent: false, skipped: true };
  }

  const body = text ?? stripHtml(html);

  try {
    const messageId =
      env.email.provider === 'brevo'
        ? await sendViaBrevo({ to, subject, html, text: body, replyTo })
        : (await getTransporter().sendMail({ from: env.email.from, to, subject, html, text: body, replyTo }))
            .messageId;
    logger.info(`Email sent to ${to} (${messageId})`);
    return { sent: true, messageId };
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error.message}`);
    return { sent: false, error: error.message };
  }
}

/**
 * The entities the templates actually emit, plus the five `escape()` produces from
 * customer-supplied text. `&amp;` is applied last so `&amp;lt;` decodes to `&lt;`
 * rather than to `<` - escaping is not undone twice.
 */
const ENTITIES = [
  [/&middot;/g, '·'],
  [/&times;/g, '×'],
  [/&nbsp;/g, ' '],
  [/&quot;/g, '"'],
  [/&#3[59];/g, "'"],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&amp;/g, '&'],
];

/**
 * The plain-text alternative for a mail client that will not render HTML. Tags go
 * first, then entities - a reader who gets this part should not be shown `&middot;`.
 */
export function stripHtml(html = '') {
  let text = String(html)
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  for (const [pattern, char] of ENTITIES) text = text.replace(pattern, char);
  return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Confirms the credentials are usable, without sending anything. */
export async function verifyTransport() {
  if (!env.email.enabled) return { ok: false, reason: `${env.email.provider} not configured` };
  try {
    if (env.email.provider === 'brevo') {
      const response = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': env.email.brevoApiKey, accept: 'application/json' },
      });
      if (!response.ok) return { ok: false, reason: `Brevo responded ${response.status}` };
      return { ok: true };
    }
    await getTransporter().verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}

export default { sendMail, verifyTransport };
