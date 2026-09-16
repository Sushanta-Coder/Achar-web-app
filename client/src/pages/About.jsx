import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { addressLine } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * About.
 *
 * There is no `/about` endpoint and there should not be: this is prose, and prose belongs in
 * the build where it is versioned and reviewable, not in a settings document where a stray
 * save can blank it. What *is* read from settings is the handful of facts that also appear on
 * invoices and in the footer - legal name, PAN, address, hours - because those must never
 * disagree between two pages.
 *
 * The Organization JSON-LD is written inline rather than added to `lib/seo.js`, since one
 * page needs it and a helper for a single caller is indirection for its own sake.
 */
export default function About() {
  const { settings } = useSettings();
  const company = settings.company ?? {};
  const name = company.name || 'Achar Ghar';

  useSeo({
    title: `About ${name}`,
    description: `Who makes ${name} achar, where the ingredients come from, and how a Nepali pickle kitchen in Lalitpur turns them into what arrives at your door.`,
    canonical: '/about',
    structuredData: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: company.legalName || name,
        alternateName: company.nameNp || undefined,
        url: window.location.origin,
        logo: company.logoUrl || undefined,
        email: company.email || undefined,
        telephone: company.phone || undefined,
        address: company.address
          ? {
              '@type': 'PostalAddress',
              streetAddress: [company.address.tole, company.address.street]
                .filter(Boolean)
                .join(', '),
              addressLocality: company.address.municipality,
              addressRegion: company.address.province,
              postalCode: company.address.postalCode,
              addressCountry: 'NP',
            }
          : undefined,
        sameAs: Object.values(company.social ?? {}).filter(Boolean),
      },
      breadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'About', url: '/about' },
      ]),
    ],
  });

  return (
    <div>
      {/* --- Opening ---------------------------------------------------- */}
      <section className="bg-cream-100 border-cream-200 border-b">
        <div className="container-page py-10 sm:py-14">
          <nav
            aria-label="Breadcrumb"
            className="text-ink-400 mb-4 flex items-center gap-1 text-xs"
          >
            <Link to="/" className="hover:text-brand-700">
              Home
            </Link>
            <Icon name="chevronRight" className="size-3" />
            <span className="text-ink-600">About</span>
          </nav>

          <div className="max-w-2xl">
            <p className="text-brand-700 text-xs font-semibold tracking-widest uppercase">
              Made in Lalitpur
            </p>
            <h1 className="mt-2 text-3xl leading-tight sm:text-4xl">
              Achar the way it is made at home, in quantities that are not
            </h1>
            <p className="text-ink-600 mt-4 text-base leading-relaxed">
              {name} started in a kitchen with two pressure cookers, a stone mortar and more
              lapsi than one family could ever eat. What we sell now is the same recipe scaled
              up carefully — never so far that we stopped tasting every batch.
            </p>
            {company.tagline ? (
              <p className="text-ink-400 font-np mt-3 text-sm italic">{company.tagline}</p>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container-page py-10 sm:py-14">
        {/* --- The story ------------------------------------------------ */}
        <section className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div className="rich-text">
            <h2>How this started</h2>
            <p>
              Every Nepali household has an achar that belongs to it — an aunt&apos;s timur
              blend, a grandmother&apos;s way of drying gundruk, the exact minute mustard oil
              stops smelling raw. Ours came from a mother-in-law who measured nothing and got
              it right anyway.
            </p>
            <p>
              The problem with a family recipe is that it does not survive a move to the city.
              Jars get sent up on buses, arrive broken, or arrive fine and run out in a
              fortnight. We started making it in bigger batches for friends who kept asking,
              and at some point the asking became a business.
            </p>
            <p>
              We are not trying to be a factory. We are trying to be the jar somebody&apos;s
              mother would have sent, available on a Tuesday.
            </p>
          </div>

          <div className="rich-text">
            <h2>What we will not do</h2>
            <p>
              No artificial preservatives and no added colour. Achar has been keeping through
              Nepali winters for centuries on salt, chilli, mustard oil and sunlight, and none
              of those need help from a laboratory.
            </p>
            <p>
              No secret ingredient lists. Everything that is in a jar is printed on the jar and
              on its product page. If you have an allergy you should be able to read the label
              and decide, not email us and wait.
            </p>
            <p>
              No pretending about heat. A pickle labelled mild is mild. We would rather lose a
              sale than have somebody&apos;s child in tears.
            </p>
          </div>
        </section>

        {/* --- How it is made ------------------------------------------ */}
        <section className="mt-14">
          <h2 className="text-2xl">From field to jar</h2>
          <p className="text-ink-500 mt-1.5 max-w-prose text-sm">
            Four steps, none of which we have found a shortcut for.
          </p>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-cream-300 rounded-xl border bg-white p-4">
                <span className="bg-brand-50 text-brand-700 tnum grid size-8 place-items-center rounded-full text-sm font-semibold">
                  {index + 1}
                </span>
                <h3 className="mt-3 flex items-center gap-1.5 text-base font-semibold">
                  <Icon name={step.icon} className="text-brand-600 size-4" />
                  {step.title}
                </h3>
                <p className="text-ink-500 mt-1.5 text-sm">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --- Sourcing ------------------------------------------------- */}
        <section className="border-leaf-200 bg-leaf-50 mt-14 rounded-2xl border p-5 sm:p-8">
          <div className="grid gap-6 lg:grid-cols-[1fr_18rem] lg:items-center">
            <div>
              <h2 className="text-leaf-900 text-2xl">Where the ingredients come from</h2>
              <p className="text-leaf-800 mt-2 text-sm leading-relaxed">
                Lapsi and radish from Kavre and Dhading. Timur from Jumla, which is worth the
                freight because nothing grown lower down tastes like it. Mustard oil pressed in
                Nepal, not imported and diluted. Chilli from Sindhuli, and akabare from the
                east when the season allows.
              </p>
              <p className="text-leaf-800 mt-2 text-sm leading-relaxed">
                We buy from the same growers each year and pay before the harvest where it
                helps them. That is not charity — a farmer who is not desperate in March grows
                better lapsi in October.
              </p>
            </div>
            <ul className="space-y-2">
              {[
                'Seasonal, so some pickles genuinely sell out',
                'Nepali-pressed mustard oil only',
                'No imported pulp or concentrate',
                'Glass jars, no plastic tubs',
              ].map((line) => (
                <li key={line} className="text-leaf-900 flex items-start gap-2 text-sm">
                  <Icon name="check" className="text-leaf-700 mt-0.5 size-4 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* --- Values --------------------------------------------------- */}
        <section className="mt-14">
          <h2 className="text-2xl">What we hold ourselves to</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {VALUES.map((value) => (
              <div key={value.title} className="border-cream-300 rounded-xl border bg-white p-4">
                <span className="bg-cream-200 text-brand-700 grid size-9 place-items-center rounded-lg">
                  <Icon name={value.icon} className="size-4.5" />
                </span>
                <h3 className="mt-3 text-base font-semibold">{value.title}</h3>
                <p className="text-ink-500 mt-1.5 text-sm">{value.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* --- The registered facts ------------------------------------ */}
        <section className="mt-14 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="rich-text">
            <h2>The boring but important bit</h2>
            <p>
              {company.legalName || name} is a registered company in Nepal and issues a proper
              bill for every order. We are a small team — the same people who make the achar
              answer the phone, which is why an email sometimes takes until the next morning
              and never takes a week.
            </p>
            <p>
              If you want to stock our jars in a shop or serve them in a restaurant, write to{' '}
              <a href={`mailto:${company.email || company.supportEmail}`}>
                {company.email || company.supportEmail || 'us'}
              </a>{' '}
              with roughly how much you would need per month and we will send wholesale
              pricing.
            </p>
          </div>

          <dl className="border-cream-300 divide-cream-200 divide-y rounded-xl border bg-white text-sm">
            {[
              ['Registered name', company.legalName || name],
              ['PAN', company.panNumber],
              ['Address', addressLine(company.address)],
              ['Phone', company.phone],
              ['Email', company.email],
              ['Hours', company.openingHours?.join(' · ')],
            ]
              .filter(([, value]) => Boolean(value))
              .map(([label, value]) => (
                <div key={label} className="flex gap-3 p-3">
                  <dt className="text-ink-400 w-28 shrink-0 text-xs">{label}</dt>
                  <dd className="text-ink-700 min-w-0 break-words">{value}</dd>
                </div>
              ))}
          </dl>
        </section>

        {/* --- CTA ------------------------------------------------------ */}
        <section className="border-brand-200 bg-brand-50 mt-14 rounded-2xl border p-6 text-center sm:p-10">
          <h2 className="text-brand-900 text-2xl">Easier to taste than to read about</h2>
          <p className="text-brand-900 mx-auto mt-2 max-w-lg text-sm">
            Start with the mixed pack if you are not sure — four small jars, one of each heat
            level, so you learn what you actually like before committing to a big one.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Link to="/shop" className="btn-primary">
              <Icon name="cart" className="size-4" />
              See the range
            </Link>
            <Link to="/blog" className="btn-outline">
              Read the journal
            </Link>
            <Link to="/contact" className="btn-ghost">
              Ask us something
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

const STEPS = [
  {
    icon: 'leaf',
    title: 'Sourced',
    body: 'Bought in season from growers we buy from every year, graded by hand before anything is washed.',
  },
  {
    icon: 'flame',
    title: 'Sun and spice',
    body: 'Dried the slow way, then blended with spices roasted in small batches — big batches scorch unevenly.',
  },
  {
    icon: 'package',
    title: 'Jarred',
    body: 'Into sterilised glass the same day, sealed, coded and dated. Nothing sits overnight in a vat.',
  },
  {
    icon: 'truck',
    title: 'Sent',
    body: 'Packed in moulded inserts. Next working day in the valley, two to seven days elsewhere in Nepal.',
  },
];

const VALUES = [
  {
    icon: 'eye',
    title: 'Nothing hidden',
    body: 'Full ingredients, honest heat levels, and reviews published as written — including the unflattering ones.',
  },
  {
    icon: 'wallet',
    title: 'Fair on both ends',
    body: 'Growers paid on time, prices that do not change after checkout, and no charges that appear at the last screen.',
  },
  {
    icon: 'refresh',
    title: 'Own our mistakes',
    body: 'A broken or spoiled jar is replaced or refunded, no argument. Tell us within 48 hours with a photo.',
  },
];
