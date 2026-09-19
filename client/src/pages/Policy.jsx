import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/EmptyState';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { formatDate, formatPrice } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * The five policy pages: shipping, returns, payment, privacy, terms.
 *
 * One component mounted five times with a different `slug` prop, because they are the same
 * page with different words in it. Each body is admin-authored HTML held in site settings
 * and sanitised on write, so it is rendered with `dangerouslySetInnerHTML` for the same
 * reason the blog body is - the stored value is already safe.
 *
 * A fresh install has all five empty. Rather than serving a blank "Returns policy" page -
 * which is worse than useless on a shop taking money - each slug has a bundled default
 * written from how this shop actually operates, shown when the admin has not written their
 * own. The banner says which one you are reading, because a customer is entitled to know
 * whether a policy is the shop's own or a stand-in.
 */

const META = {
  shipping: {
    title: 'Delivery',
    lead: 'Where we deliver, what it costs, and how long it takes.',
  },
  returns: {
    title: 'Returns and refunds',
    lead: 'Food is different from electronics. Here is exactly where we stand.',
  },
  payment: {
    title: 'Payment',
    lead: 'How you can pay, and what happens to your money at each step.',
  },
  privacy: {
    title: 'Privacy',
    lead: 'What we collect, why, and what we never do with it.',
  },
  terms: {
    title: 'Terms of service',
    lead: 'The agreement between you and Deeva Achar when you place an order.',
  },
};

export default function Policy({ slug }) {
  const { settings, freeDeliveryThreshold } = useSettings();
  const { data, error, loading, refetch } = useFetch(`/settings/policy/${slug}`, { deps: [slug] });

  const meta = META[slug] ?? { title: 'Policy', lead: '' };
  const company = settings.company ?? {};

  useSeo({
    title: meta.title,
    description: meta.lead,
    canonical: slug === 'terms' ? '/terms' : `/${slug}-policy`,
    structuredData: breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: meta.title, url: slug === 'terms' ? '/terms' : `/${slug}-policy` },
    ]),
  });

  if (loading) return <PageLoader label="Loading" />;

  const usingFallback = Boolean(error) || Boolean(data?.isEmpty);

  return (
    <div className="container-page py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">{meta.title}</span>
      </nav>

      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-2xl sm:text-3xl">{meta.title}</h1>
          <p className="text-ink-500 mt-1.5 text-sm">{meta.lead}</p>
          {data?.updatedAt && !usingFallback ? (
            <p className="text-ink-400 mt-1 text-xs">Last updated {formatDate(data.updatedAt)}</p>
          ) : null}
        </header>

        {/* A failed request is worth saying out loud; falling back silently would leave a
            customer reading standard terms while believing they were the shop's own. */}
        {error ? (
          <div className="mt-5">
            <ErrorState error={error} onRetry={refetch} />
          </div>
        ) : null}

        {usingFallback ? (
          <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mt-5 rounded-lg border px-3 py-2 text-sm">
            These are our standard terms. Anything agreed with you in writing takes
            precedence — write to{' '}
            <a href={`mailto:${company.supportEmail || company.email}`} className="underline">
              {company.supportEmail || company.email || 'our support address'}
            </a>{' '}
            if something here does not match what you were told.
          </p>
        ) : null}

        <div className="mt-6">
          {usingFallback ? (
            <Fallback slug={slug} company={company} threshold={freeDeliveryThreshold} />
          ) : (
            <div className="rich-text" dangerouslySetInnerHTML={{ __html: data.content }} />
          )}
        </div>

        <div className="border-cream-300 mt-10 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <p className="text-ink-500 text-sm">Still not sure about something?</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/faq" className="btn-outline btn-sm">
              Common questions
            </Link>
            <Link to="/contact" className="btn-primary btn-sm">
              <Icon name="mail" className="size-4" />
              Ask us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Bundled defaults --------------------------------------------------------

function Fallback({ slug, company, threshold }) {
  if (slug === 'shipping') {
    return (
      <div className="rich-text">
        <h2>Where we deliver</h2>
        <p>
          Everywhere in Nepal. Inside Kathmandu Valley we deliver ourselves; outside the
          valley we hand over to a courier, so the last leg is on their schedule rather than
          ours.
        </p>
        <h2>What it costs</h2>
        <p>
          The delivery charge is worked out at checkout from your district, and it is shown
          before you pay — never added afterwards.
          {threshold > 0 ? (
            <>
              {' '}
              Orders over {formatPrice(threshold)} are delivered free anywhere we deliver.
            </>
          ) : null}
        </p>
        <h2>How long it takes</h2>
        <ul>
          <li>Kathmandu Valley: usually the next working day.</li>
          <li>Other cities on a highway: two to four working days.</li>
          <li>
            Remote districts: four to seven working days, and longer in monsoon when roads
            close.
          </li>
        </ul>
        <p>
          The estimate on your order page is the courier&apos;s, not a promise. Public
          holidays and bandhs are not working days.
        </p>
        <h2>Packing</h2>
        <p>
          Every jar is glass, sealed, and packed in a moulded insert. Breakages are rare, and
          if one arrives broken it is covered — see the returns page.
        </p>
        <h2>Nobody home</h2>
        <p>
          The courier calls the number on your order. After two failed attempts the parcel
          comes back to us and we will contact you to arrange it again. Cash-on-delivery
          orders that are refused twice are cancelled.
        </p>
      </div>
    );
  }

  if (slug === 'returns') {
    return (
      <div className="rich-text">
        <h2>Sealed food cannot be returned once opened</h2>
        <p>
          This is not a technicality — it is a food safety rule, and no reputable pickle
          maker can take back an opened jar and sell it again. So an opened jar is not
          returnable unless something is wrong with it.
        </p>
        <h2>What we do replace or refund, always</h2>
        <ul>
          <li>A jar that arrives broken, leaking, or with a lifted seal.</li>
          <li>The wrong item, or a missing item.</li>
          <li>Anything past its best-before date on the day it arrives.</li>
          <li>Anything that is clearly spoiled — off smell, mould, fermentation.</li>
        </ul>
        <p>
          Tell us within <strong>48 hours</strong> of delivery, with a photo. That is not
          bureaucracy: it is what lets us take it up with the courier, and it is how we find
          out if a whole batch has a problem.
        </p>
        <h2>Changed your mind</h2>
        <p>
          If the jars are unopened and the seal is intact, you can return them within seven
          days of delivery. Return postage is yours unless the fault was ours. We refund the
          items, not the original delivery charge.
        </p>
        <h2>How a refund reaches you</h2>
        <p>
          Back the way you paid. Khalti and eSewa refunds are processed by hand and typically
          land within three to five working days. Cash-on-delivery refunds go by bank
          transfer, so we will ask for account details. We will always offer a replacement or
          store credit as well — it is usually faster.
        </p>
        <h2>Cancelling</h2>
        <p>
          You can cancel from your order page any time before we pack it. After that, contact
          us and we will do what we can, but a parcel already with the courier has to come
          back before we can refund it.
        </p>
      </div>
    );
  }

  if (slug === 'payment') {
    return (
      <div className="rich-text">
        <h2>How you can pay</h2>
        <ul>
          <li>
            <strong>Khalti</strong> — wallet, mobile banking or connected bank.
          </li>
          <li>
            <strong>eSewa</strong> — wallet or linked bank account.
          </li>
          <li>
            <strong>Cash on delivery</strong> — pay the courier, available up to the limit
            shown at checkout.
          </li>
        </ul>
        <h2>What we never see, and never store</h2>
        <p>
          Card and wallet details are entered on Khalti&apos;s or eSewa&apos;s own page, not
          ours. We never see them and we do not store card numbers anywhere. What we keep is
          the gateway&apos;s transaction reference, so we can match a payment to your order.
        </p>
        <h2>How your order is marked paid</h2>
        <p>
          Only after we ask the gateway directly and it confirms the payment — including that
          the amount matches. Returning to our site from Khalti or eSewa is not by itself
          treated as proof of payment, which is why a successful-looking redirect can still
          show as pending for a few seconds while we check.
        </p>
        <h2>The price you see is the price you pay</h2>
        <p>
          Every total is calculated on our server from the current price, your quantities,
          any discount, and the delivery charge for your district. Nothing in your browser
          can change it. If a price changed between adding something to your bag and paying,
          your bag is repriced and you will see it before you confirm.
        </p>
        <h2>If a payment fails or you are charged twice</h2>
        <p>
          Failed payments leave the order unpaid and your jars reserved briefly, so you can
          try again from the order page. A duplicate charge is refunded in full — send us the
          transaction reference and we will trace it.
        </p>
        <p>All prices are in Nepalese Rupees.</p>
      </div>
    );
  }

  if (slug === 'privacy') {
    return (
      <div className="rich-text">
        <h2>What we collect</h2>
        <ul>
          <li>Your name, email, phone and delivery addresses — to deliver your order.</li>
          <li>Your order history — to show it back to you, and because tax law requires it.</li>
          <li>
            A payment reference from Khalti or eSewa. Never card numbers, never wallet
            credentials.
          </li>
          <li>
            Basic usage counts — which products get viewed and searched for — so we know what
            to make more of.
          </li>
        </ul>
        <h2>What we do not do</h2>
        <p>
          We do not sell your details. We do not share them with advertisers. We do not email
          you marketing unless you asked for it, and unsubscribing is one click and takes
          effect immediately. Order confirmations and delivery updates are not marketing and
          are sent either way.
        </p>
        <h2>Who else sees it</h2>
        <p>
          Only who has to: the courier gets your name, address and phone; the payment gateway
          gets the amount and order reference. That is the whole list.
        </p>
        <h2>How it is kept</h2>
        <p>
          Passwords are hashed, never stored as text — we could not tell you your own
          password if you asked. Sessions use HTTP-only cookies, so no script in your browser
          can read them. The connection is encrypted end to end.
        </p>
        <h2>Your choices</h2>
        <p>
          You can see and correct everything we hold from your account pages, and you can
          close your account whenever you like. Closing it anonymises your details; the
          invoices themselves have to stay, because Nepali tax rules require us to keep the
          record of a sale — but they no longer carry your name.
        </p>
        <h2>Cookies</h2>
        <p>
          Two kinds only: one to keep you signed in, and one to remember your bag and your
          language. No advertising or cross-site tracking cookies.
        </p>
        <p>
          Questions, or a request to delete something:{' '}
          <a href={`mailto:${company.supportEmail || company.email}`}>
            {company.supportEmail || company.email || 'our support address'}
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rich-text">
      <h2>Who you are dealing with</h2>
      <p>
        {company.legalName || company.name || 'Deeva Achar'}, registered in Nepal and operating
        the site you are reading. Placing an order means you accept these terms.
      </p>
      <h2>Orders</h2>
      <p>
        An order is an offer to buy, and it becomes a contract when we accept it. We may
        decline one — if something has sold out, if a price was listed wrongly, or if we
        cannot deliver to the address. If we decline after you have paid, you are refunded in
        full.
      </p>
      <h2>Prices and stock</h2>
      <p>
        Prices can change, and stock is not reserved by browsing. Everything is confirmed at
        the moment you check out; that total is the binding one. Obvious pricing errors are
        not binding on us, and we will always contact you rather than quietly cancelling.
      </p>
      <h2>Your account</h2>
      <p>
        Keep your password to yourself and your contact details current — a wrong phone
        number is the single most common reason a delivery fails. Tell us straight away if
        you think someone else has used your account.
      </p>
      <h2>Food, allergens and storage</h2>
      <p>
        Our achar contains mustard oil, chilli and spices, and is made in a kitchen that also
        handles sesame and nuts. Ingredients are listed on every product page and on the jar —
        please read them if you have an allergy. Refrigerate after opening and use a dry
        spoon; we cannot be responsible for a jar that has been stored badly.
      </p>
      <h2>Reviews</h2>
      <p>
        Write what you actually think. We read every review before it appears and we publish
        the critical ones too, but we remove anything abusive, off-topic, or not about the
        product.
      </p>
      <h2>Limits</h2>
      <p>
        Our liability for an order is limited to what you paid for it. Nothing here limits
        rights you have under Nepali consumer law, and disputes are governed by Nepali law
        and heard in Kathmandu.
      </p>
      <h2>Changes</h2>
      <p>
        We may update these terms. The version in force for your order is the one published
        on the day you placed it.
      </p>
    </div>
  );
}
