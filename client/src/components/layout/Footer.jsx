import { Link } from 'react-router-dom';
import Icon from '../ui/Icon';
import { useSettings } from '../../context/SettingsContext';
import { addressLine, formatPhone } from '../../lib/format';

/**
 * Footer.
 *
 * The policy links here are not decoration: Khalti and eSewa both require a live
 * refund/return policy and reachable contact details before they will approve a
 * merchant account, so these pages exist and are linked from every page.
 *
 * Contact details come from site settings, so the admin can change the support number
 * without a deploy.
 */

const SHOP_LINKS = [
  { to: '/shop', label: 'All products' },
  { to: '/categories', label: 'Categories' },
  { to: '/shop?sort=popularity', label: 'Best sellers' },
  { to: '/shop?onSale=true', label: 'On offer' },
  { to: '/shop?newArrival=true', label: 'New arrivals' },
];

const HELP_LINKS = [
  { to: '/track-order', label: 'Track your order' },
  { to: '/shipping-policy', label: 'Delivery & shipping' },
  { to: '/returns-policy', label: 'Returns & refunds' },
  { to: '/payment-policy', label: 'Payment options' },
  { to: '/faq', label: 'FAQ' },
];

const COMPANY_LINKS = [
  { to: '/about', label: 'Our story' },
  { to: '/blog', label: 'Recipes & journal' },
  { to: '/contact', label: 'Contact us' },
  { to: '/privacy-policy', label: 'Privacy policy' },
  { to: '/terms', label: 'Terms & conditions' },
];

export default function Footer() {
  const { settings } = useSettings();
  /*
    Field names mirror `GET /api/settings` exactly - the API's public projection sends a
    `company` section, and reading a section that does not exist is how a footer ends up
    permanently showing its own fallbacks.
  */
  const company = settings.company ?? {};
  const social = company.social ?? {};
  const phone = company.phone || company.landline || '';
  const email = company.supportEmail || company.email || '';
  const address = addressLine(company.address);
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink-900 mt-16 text-cream-300 no-print">
      <div className="container-page py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="bg-brand-700 grid size-10 place-items-center rounded-lg text-white">
                <Icon name="flame" className="size-5.5" />
              </span>
              <span className="font-display text-lg font-bold text-white">
                {company.name ?? 'Deeva Achar'}
              </span>
            </div>

            <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream-400">
              {company.tagline ??
                'Small-batch Nepali achar made the way it is made at home - sun-dried, hand-ground spices, mustard oil, no preservatives.'}
            </p>

            <ul className="mt-5 space-y-2.5 text-sm">
              {phone ? (
                <li>
                  <a
                    href={`tel:${phone}`}
                    className="flex items-center gap-2.5 transition hover:text-white"
                  >
                    <Icon name="phone" className="size-4 shrink-0 opacity-60" />
                    {formatPhone(phone)}
                  </a>
                </li>
              ) : null}
              {email ? (
                <li>
                  <a
                    href={`mailto:${email}`}
                    className="flex items-center gap-2.5 transition hover:text-white"
                  >
                    <Icon name="mail" className="size-4 shrink-0 opacity-60" />
                    {email}
                  </a>
                </li>
              ) : null}
              {address ? (
                <li className="flex items-start gap-2.5">
                  <Icon name="pin" className="mt-0.5 size-4 shrink-0 opacity-60" />
                  <span>{address}</span>
                </li>
              ) : null}
            </ul>

            {(social.facebook || social.instagram || company.whatsapp) && (
              <div className="mt-5 flex items-center gap-2">
                {social.facebook ? (
                  <SocialLink href={social.facebook} icon="facebook" label="Facebook" />
                ) : null}
                {social.instagram ? (
                  <SocialLink href={social.instagram} icon="instagram" label="Instagram" />
                ) : null}
                {company.whatsapp ? (
                  <SocialLink
                    href={`https://wa.me/${String(company.whatsapp).replace(/\D/g, '')}`}
                    icon="whatsapp"
                    label="WhatsApp"
                  />
                ) : null}
              </div>
            )}
          </div>

          <FooterColumn title="Shop" links={SHOP_LINKS} />
          <FooterColumn title="Help" links={HELP_LINKS} />
          <FooterColumn title="Company" links={COMPANY_LINKS} />
        </div>

        {/* Payment methods. Named in text as well as shown, so it is readable to
            everyone and does not depend on logo assets we may not have rights to. */}
        <div className="border-ink-700 mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-6">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-cream-400">We accept</span>
            {['Cash on delivery', 'Khalti', 'eSewa'].map((method) => (
              <span
                key={method}
                className="border-ink-700 bg-ink-800 rounded border px-2.5 py-1 font-medium text-cream-200"
              >
                {method}
              </span>
            ))}
          </div>

          <p className="text-xs text-cream-400">
            © {year} {company.name ?? 'Deeva Achar'}. Made in Nepal.
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }) {
  return (
    <div>
      <h2 className="text-sm font-semibold tracking-wide text-white uppercase">{title}</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {links.map((link) => (
          <li key={link.to}>
            <Link to={link.to} className="transition hover:text-white">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialLink({ href, icon, label }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      aria-label={label}
      className="border-ink-700 hover:bg-brand-700 grid size-9 place-items-center rounded-lg border transition hover:border-transparent hover:text-white"
    >
      <Icon name={icon} className="size-4" />
    </a>
  );
}
