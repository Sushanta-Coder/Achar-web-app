import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import Spinner, { Skeleton } from '../components/ui/Spinner';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useFetch, useMutation } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { apiError, applyFieldErrors, post } from '../lib/apiClient';
import { addressLine } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * Contact.
 *
 * The company block comes from `/contact/details` rather than from the settings context,
 * because that endpoint returns exactly the public subset - address, hours, social, support
 * address - and keeps the decision about what is publishable on the server where it belongs.
 * Settings is still read for the fallback name so the heading is never empty on a cold load.
 *
 * `request()` throws away the server's success message, so the confirmation copy is written
 * here. It deliberately does not promise a timeframe the shop cannot keep: one working day
 * for a message, and the phone number for anything urgent.
 *
 * The map is a plain link, not an embedded iframe. An embed pulls in Google's script on a
 * page whose only job is a form, and on a slow Nepali connection that is the heaviest thing
 * on the page for the least benefit.
 */
export default function Contact() {
  const { settings } = useSettings();
  const { user, isAuthenticated } = useAuth();
  const { data, loading } = useFetch('/contact/details');

  const company = data ?? settings.company ?? {};

  useSeo({
    title: 'Contact us',
    description:
      'Talk to Achar Ghar about an order, a wholesale enquiry, or anything you cannot find an answer to. Phone, WhatsApp, email and our address in Lalitpur.',
    canonical: '/contact',
    structuredData: breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: 'Contact', url: '/contact' },
    ]),
  });

  return (
    <div className="container-page py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">Contact</span>
      </nav>

      <header className="max-w-2xl">
        <h1 className="text-2xl sm:text-3xl">Talk to us</h1>
        <p className="text-ink-500 mt-1.5 text-sm">
          A real person reads every message. If it is about an order you have already placed,
          include the order number and we can answer in one reply instead of three.
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <ContactForm user={isAuthenticated ? user : null} />

        <aside className="space-y-4">
          {loading && !data ? (
            <Skeleton className="h-64 rounded-xl" />
          ) : (
            <>
              <section className="border-cream-300 rounded-xl border bg-white p-4">
                <h2 className="text-ink-800 text-sm font-semibold">Reach us directly</h2>
                <ul className="mt-3 space-y-3 text-sm">
                  {company.phone ? (
                    <Row icon="phone" label="Phone">
                      <a href={`tel:${company.phone}`} className="hover:text-brand-700">
                        {company.phone}
                      </a>
                    </Row>
                  ) : null}

                  {company.whatsapp ? (
                    <Row icon="whatsapp" label="WhatsApp">
                      <a
                        href={`https://wa.me/${String(company.whatsapp).replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-brand-700"
                      >
                        {company.whatsapp}
                      </a>
                    </Row>
                  ) : null}

                  {company.landline ? (
                    <Row icon="phone" label="Landline">
                      <a href={`tel:${company.landline}`} className="hover:text-brand-700">
                        {company.landline}
                      </a>
                    </Row>
                  ) : null}

                  {company.supportEmail || company.email ? (
                    <Row icon="mail" label="Email">
                      <a
                        href={`mailto:${company.supportEmail || company.email}`}
                        className="hover:text-brand-700 break-all"
                      >
                        {company.supportEmail || company.email}
                      </a>
                    </Row>
                  ) : null}
                </ul>
              </section>

              {company.address ? (
                <section className="border-cream-300 rounded-xl border bg-white p-4">
                  <h2 className="text-ink-800 text-sm font-semibold">Where we are</h2>
                  <p className="text-ink-600 mt-2 text-sm whitespace-pre-line">
                    {company.name}
                    {'\n'}
                    {addressLine(company.address)}
                  </p>
                  {/* A link, not an iframe - see the note at the top of this file. */}
                  <a
                    href={mapHref(company)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-outline btn-sm mt-3 w-full justify-center"
                  >
                    <Icon name="pin" className="size-4" />
                    Open in maps
                    <Icon name="external" className="size-3.5" />
                  </a>
                </section>
              ) : null}

              {company.openingHours?.length ? (
                <section className="border-cream-300 rounded-xl border bg-white p-4">
                  <h2 className="text-ink-800 flex items-center gap-1.5 text-sm font-semibold">
                    <Icon name="clock" className="text-ink-400 size-4" />
                    Opening hours
                  </h2>
                  <ul className="text-ink-600 mt-2 space-y-1 text-sm">
                    {company.openingHours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="text-ink-400 mt-2 text-xs">
                    Closed on public holidays. Orders placed outside these hours are picked up
                    the next working morning.
                  </p>
                </section>
              ) : null}

              <SocialLinks social={company.social} />

              <section className="border-cream-300 bg-cream-100 rounded-xl border p-4">
                <h2 className="text-ink-800 text-sm font-semibold">Faster than writing</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  <li>
                    <Link to="/track-order" className="text-brand-700 hover:underline">
                      Track an order
                    </Link>{' '}
                    <span className="text-ink-500">— order number and phone.</span>
                  </li>
                  <li>
                    <Link to="/faq" className="text-brand-700 hover:underline">
                      Common questions
                    </Link>{' '}
                    <span className="text-ink-500">— delivery, heat, storage, refunds.</span>
                  </li>
                  <li>
                    <Link to="/returns-policy" className="text-brand-700 hover:underline">
                      Returns and refunds
                    </Link>
                  </li>
                </ul>
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <li className="flex items-start gap-2.5">
      <Icon name={icon} className="text-brand-600 mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="text-ink-400 block text-xs">{label}</span>
        <span className="text-ink-700">{children}</span>
      </span>
    </li>
  );
}

function SocialLinks({ social }) {
  const links = [
    { key: 'facebook', icon: 'facebook', label: 'Facebook' },
    { key: 'instagram', icon: 'instagram', label: 'Instagram' },
    { key: 'tiktok', icon: 'external', label: 'TikTok' },
    { key: 'youtube', icon: 'external', label: 'YouTube' },
    { key: 'twitter', icon: 'external', label: 'X' },
  ].filter((entry) => social?.[entry.key]);

  if (!links.length) return null;

  return (
    <section className="border-cream-300 rounded-xl border bg-white p-4">
      <h2 className="text-ink-800 text-sm font-semibold">Follow along</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {links.map((entry) => (
          <a
            key={entry.key}
            href={social[entry.key]}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline btn-sm"
          >
            <Icon name={entry.icon} className="size-4" />
            {entry.label}
          </a>
        ))}
      </div>
    </section>
  );
}

/**
 * `/contact` is rate limited by `publicWriteLimiter`, so a 429 is a normal outcome rather
 * than a bug - the catch-all error line covers it with the server's own wording.
 */
function ContactForm({ user }) {
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setError,
    formState: { errors },
  } = useForm({
    defaultValues: {
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      subject: '',
      message: '',
    },
  });

  const send = useMutation((values) => post('/contact', values), {
    onSuccess: () => setSent(true),
  });

  // Writing a second message keeps the identity fields and clears only what changes, so
  // nobody retypes their name and email to ask a follow-up question.
  const again = () => {
    reset({ ...getValues(), subject: '', message: '' });
    send.reset();
    setSent(false);
  };

  const onSubmit = async (data) => {
    const payload = {
      name: data.name.trim(),
      email: data.email.trim(),
      subject: data.subject.trim(),
      message: data.message.trim(),
    };
    // The server treats phone as optional but validates it when present, so an untouched
    // field has to be left out entirely rather than sent as an empty string.
    if (data.phone?.trim()) payload.phone = data.phone.trim();

    try {
      await send.run(payload);
    } catch (caught) {
      applyFieldErrors(caught, setError);
    }
  };

  if (sent) {
    return (
      <section className="border-leaf-200 bg-leaf-50 rounded-xl border p-6">
        <h2 className="text-leaf-800 flex items-center gap-2 text-lg font-semibold">
          <Icon name="checkCircle" className="size-5" />
          Message sent
        </h2>
        <p className="text-leaf-800 mt-2 text-sm">
          We have it. Expect a reply by email within one working day — sooner during shop
          hours. If it is urgent, call instead; a phone call always beats a queue.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={again} className="btn-outline btn-sm">
            Send another
          </button>
          <Link to="/shop" className="btn-primary btn-sm">
            Back to the shop
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="border-cream-300 rounded-xl border bg-white p-4 sm:p-6">
      <h2 className="text-lg">Send a message</h2>
      <p className="text-ink-500 mt-1 text-sm">
        Everything except the phone number is needed so we can actually reply.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-name" className="field-label">
              Your name
            </label>
            <input
              id="contact-name"
              type="text"
              autoComplete="name"
              className="field-input"
              {...register('name', {
                required: 'Tell us what to call you',
                maxLength: { value: 80, message: 'Please keep this under 80 characters' },
              })}
            />
            {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
          </div>

          <div>
            <label htmlFor="contact-email" className="field-label">
              Email
            </label>
            <input
              id="contact-email"
              type="email"
              autoComplete="email"
              className="field-input"
              {...register('email', {
                required: 'We reply by email, so we need one',
                pattern: { value: /^\S+@\S+\.\S+$/, message: 'That does not look like an email' },
              })}
            />
            {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="contact-phone" className="field-label">
              Phone <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input
              id="contact-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
              className="field-input"
              {...register('phone', {
                maxLength: { value: 20, message: 'That is too long for a phone number' },
              })}
            />
            {errors.phone ? (
              <p className="field-error">{errors.phone.message}</p>
            ) : (
              <p className="field-hint">Only if you would rather we called.</p>
            )}
          </div>

          <div>
            <label htmlFor="contact-subject" className="field-label">
              Subject
            </label>
            <input
              id="contact-subject"
              type="text"
              placeholder="Order #ACH-… / wholesale / something else"
              className="field-input"
              {...register('subject', {
                required: 'A few words about what this is',
                maxLength: { value: 140, message: 'Please keep the subject short' },
              })}
            />
            {errors.subject ? <p className="field-error">{errors.subject.message}</p> : null}
          </div>
        </div>

        <div>
          <label htmlFor="contact-message" className="field-label">
            Message
          </label>
          <textarea
            id="contact-message"
            rows={7}
            className="field-input resize-y"
            {...register('message', {
              required: 'Tell us what you need',
              minLength: { value: 10, message: 'A little more detail helps us answer properly' },
              maxLength: { value: 2000, message: 'Please keep this under 2000 characters' },
            })}
          />
          {errors.message ? <p className="field-error">{errors.message.message}</p> : null}
        </div>

        {/* Field-level problems are attached above; this covers everything else the server
            can answer with, including the rate limiter. */}
        {send.error && !Object.keys(errors).length ? (
          <p className="field-error">{apiError(send.error).message}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className="btn-primary" disabled={send.pending}>
            {send.pending ? <Spinner className="size-4" /> : <Icon name="mail" className="size-4" />}
            Send message
          </button>
          <p className="text-ink-400 text-xs">
            We use your details to answer you and nothing else — see the{' '}
            <Link to="/privacy-policy" className="underline">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </form>
    </section>
  );
}

function mapHref(company) {
  if (company.mapUrl) return company.mapUrl;
  const { lat, lng } = company.geo ?? {};
  if (lat && lng) return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${company.name ?? ''} ${addressLine(company.address ?? {})}`.trim()
  )}`;
}
