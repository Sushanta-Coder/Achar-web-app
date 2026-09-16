import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import EmptyState from '../components/ui/EmptyState';
import { useSettings } from '../context/SettingsContext';
import useSeo from '../hooks/useSeo';
import { formatPrice } from '../lib/format';
import { breadcrumbJsonLd, faqJsonLd } from '../lib/seo';

/**
 * Frequently asked questions.
 *
 * The content is bundled rather than fetched: site settings has no FAQ collection, and
 * adding one to the schema just to fill this page would be a data model built for a
 * screen. The two numbers that genuinely vary - the free delivery threshold and the phone
 * number - are read from settings, so they cannot drift from what checkout charges.
 *
 * Built on `<details>`, which gives keyboard support, find-in-page and a working
 * open-by-default state for nothing. An accordion built from `useState` and divs has to
 * reimplement all three, and find-in-page cannot see inside a closed one.
 *
 * `faqJsonLd` over the flattened list is the point of the page for search: an FAQPage block
 * is one of the few kinds of rich result a small shop can realistically earn.
 */
export default function Faq() {
  const { settings, freeDeliveryThreshold, gateways } = useSettings();
  const company = settings.company ?? {};
  const [query, setQuery] = useState('');

  const groups = useMemo(
    () => buildGroups({ threshold: freeDeliveryThreshold, gateways }),
    [freeDeliveryThreshold, gateways]
  );

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useSeo({
    title: 'Questions and answers',
    description:
      'Delivery times and charges, how to pay with Khalti or eSewa, shelf life and storage, returns, and how to track an order.',
    canonical: '/faq',
    structuredData: [
      faqJsonLd(flat),
      breadcrumbJsonLd([
        { name: 'Home', url: '/' },
        { name: 'FAQ', url: '/faq' },
      ]),
    ],
  });

  const term = query.trim().toLowerCase();
  const filtered = term
    ? groups
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (item) =>
              item.question.toLowerCase().includes(term) ||
              item.answer.toLowerCase().includes(term)
          ),
        }))
        .filter((group) => group.items.length)
    : groups;

  const matches = filtered.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <div className="container-page py-6 sm:py-10">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">FAQ</span>
      </nav>

      <div className="mx-auto max-w-3xl">
        <header>
          <h1 className="text-2xl sm:text-3xl">Questions we get asked</h1>
          <p className="text-ink-500 mt-1.5 text-sm">
            If yours is not here,{' '}
            <Link to="/contact" className="text-brand-700 underline">
              write to us
            </Link>{' '}
            — we usually reply within one business day.
          </p>
        </header>

        <div className="relative mt-5">
          <Icon
            name="search"
            className="text-ink-400 pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          />
          <label htmlFor="faq-search" className="sr-only">
            Search the questions
          </label>
          <input
            id="faq-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="delivery, refund, how long does it keep…"
            className="field-input pl-9"
          />
          {term ? (
            <p className="text-ink-400 mt-1.5 text-xs">
              {matches} {matches === 1 ? 'answer' : 'answers'} mention “{query.trim()}”
            </p>
          ) : null}
        </div>

        {matches === 0 ? (
          <div className="card mt-5">
            <EmptyState
              icon="search"
              title="Nothing matches that"
              description="Try a single word, or just ask us directly — a real person reads it."
              action="Ask us"
              actionTo="/contact"
            />
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {filtered.map((group) => (
              <section key={group.title}>
                <h2 className="text-ink-800 mb-2 flex items-center gap-2 text-lg">
                  <Icon name={group.icon} className="text-brand-600 size-4.5" />
                  {group.title}
                </h2>
                <ul className="border-cream-300 divide-cream-200 divide-y overflow-hidden rounded-xl border bg-white">
                  {group.items.map((item) => (
                    <li key={item.question}>
                      <details className="group" open={Boolean(term)}>
                        <summary className="hover:bg-cream-50 flex cursor-pointer list-none items-start gap-2 p-4 text-sm font-medium">
                          <Icon
                            name="chevronRight"
                            className="text-ink-400 mt-0.5 size-4 shrink-0 transition-transform group-open:rotate-90"
                          />
                          {item.question}
                        </summary>
                        <div className="text-ink-600 px-4 pb-4 pl-10 text-sm whitespace-pre-line">
                          {item.answer}
                        </div>
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <div className="border-brand-200 bg-brand-50 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <div>
            <p className="text-brand-900 text-sm font-medium">Still stuck?</p>
            <p className="text-brand-900 mt-0.5 text-sm">
              {company.phone ? `Call or WhatsApp ${company.phone}, or send a message.` : 'Send us a message.'}
            </p>
          </div>
          <Link to="/contact" className="btn-primary btn-sm">
            <Icon name="mail" className="size-4" />
            Contact us
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * The questions. A function rather than a constant because two answers quote live
 * settings - a hardcoded free-delivery figure here would eventually contradict checkout,
 * and this page is exactly where someone goes to check that figure.
 */
function buildGroups({ threshold, gateways }) {
  const freeLine =
    threshold > 0
      ? `Orders over ${formatPrice(threshold)} are delivered free anywhere we deliver.`
      : 'Delivery is charged on every order; the amount depends on your district.';

  const walletNames = gateways.length
    ? gateways.map((gateway) => gateway.label ?? gateway.name ?? gateway).join(' and ')
    : 'Khalti and eSewa';

  return [
    {
      title: 'Ordering and delivery',
      icon: 'truck',
      items: [
        {
          question: 'Where do you deliver?',
          answer:
            'Everywhere in Nepal. Inside Kathmandu Valley we deliver ourselves. Outside the valley we use a courier, so the last leg runs on their schedule.',
        },
        {
          question: 'How long will my order take?',
          answer:
            'Kathmandu Valley is usually next working day. Cities on a highway are two to four working days. Remote districts are four to seven, and longer in monsoon when roads close. The date on your order page is the courier’s estimate, not a promise.',
        },
        {
          question: 'What does delivery cost?',
          answer: `The charge is worked out from your district and shown at checkout before you pay — never added afterwards. ${freeLine}`,
        },
        {
          question: 'Can I order without making an account?',
          answer:
            'Yes. Guest checkout only needs a name, phone and address. You get a tracking link, and you can create an account later with the same email to pull the order into your history.',
        },
        {
          question: 'How do I track my order?',
          answer:
            'Signed in, every order is on your account page with its full progress. As a guest, use Track Order with your order number and the phone number you gave — that pair is deliberately required, so nobody can look up an order they do not have.',
        },
        {
          question: 'Can I change or cancel an order?',
          answer:
            'You can cancel from the order page any time before we pack it, and the jars go straight back into stock. After packing, contact us and we will do what we can — once it is with the courier it has to come back to us first.',
        },
      ],
    },
    {
      title: 'Paying',
      icon: 'wallet',
      items: [
        {
          question: 'How can I pay?',
          answer: `${walletNames}, or cash on delivery up to the limit shown at checkout.`,
        },
        {
          question: 'Is paying online safe here?',
          answer:
            'You enter wallet and card details on Khalti’s or eSewa’s own page, never on ours. We never see them and we store no card numbers at all — only the transaction reference, so we can match your payment to your order.',
        },
        {
          question: 'I paid but my order still says pending. What now?',
          answer:
            'Give it a minute. We only mark an order paid after asking the gateway directly and checking the amount matches — coming back from the payment page is not treated as proof on its own. If it is still pending after a few minutes, send us the transaction reference and we will trace it. If a payment failed, your jars stay reserved briefly so you can try again from the order page.',
        },
        {
          question: 'Was I charged twice?',
          answer:
            'It happens occasionally with wallet retries. Send us both transaction references and we refund the duplicate in full.',
        },
        {
          question: 'Do you give a receipt or a VAT invoice?',
          answer:
            'Every paid order has an invoice you can open and print from the order page. If you need a PAN-registered bill for a company, tell us in the order note and we will issue one.',
        },
      ],
    },
    {
      title: 'The achar itself',
      icon: 'flame',
      items: [
        {
          question: 'How long does it keep?',
          answer:
            'Unopened and out of the sun, six to nine months depending on the pickle — the best-before date is printed on every jar. Once opened, refrigerate it and use it within four to six weeks.',
        },
        {
          question: 'Does it need refrigerating?',
          answer:
            'Not until you open it. After that, yes. Always use a dry spoon: water is what spoils achar, not age.',
        },
        {
          question: 'How hot is “hot”?',
          answer:
            'Mild is mild enough for children. Medium is what most Nepali households eat daily. Hot is noticeably hot. Extra hot is for people who already know they want it. Every product page states its level, and you can filter the shop by it.',
        },
        {
          question: 'Any preservatives?',
          answer:
            'No artificial preservatives and no added colour. What keeps achar is what has always kept achar — mustard oil, salt, chilli, and sun. Full ingredients are on every product page.',
        },
        {
          question: 'Is it vegetarian? What about allergens?',
          answer:
            'Most of our range is vegetarian, and the shop has a filter for it. Everything contains mustard oil and chilli, and our kitchen also handles sesame and nuts, so we cannot promise a nut-free jar. Read the ingredients on the product page if you have an allergy.',
        },
      ],
    },
    {
      title: 'Returns and problems',
      icon: 'refresh',
      items: [
        {
          question: 'A jar arrived broken.',
          answer:
            'Send us a photo within 48 hours and we replace or refund it, no argument. The photo is not bureaucracy — it is what lets us claim from the courier and spot a packing problem before it happens again.',
        },
        {
          question: 'Can I return a jar I have opened?',
          answer:
            'Not unless something is wrong with it — that is a food safety rule, not a technicality. If it is spoiled, off, mouldy or past its date on arrival, it is covered in full.',
        },
        {
          question: 'I changed my mind.',
          answer:
            'Unopened and sealed, you can return it within seven days. Return postage is yours unless the fault was ours, and we refund the items rather than the original delivery charge.',
        },
        {
          question: 'How long does a refund take?',
          answer:
            'Khalti and eSewa refunds are processed by hand and usually land in three to five working days. Cash-on-delivery refunds go by bank transfer, so we will ask for your account details. A replacement or store credit is almost always faster if you would rather.',
        },
      ],
    },
    {
      title: 'Your account',
      icon: 'user',
      items: [
        {
          question: 'I forgot my password.',
          answer:
            'Use “Forgot password” on the sign-in page. The link is good for 30 minutes and can be used once. For your safety the page says the same thing whether or not the address has an account.',
        },
        {
          question: 'Can I change my email address?',
          answer:
            'Not from the account page yet — changing a sign-in address safely needs a confirmation step at the new address, and we would rather not offer half of that. Write to us and we will do it for you.',
        },
        {
          question: 'Why is my review not showing?',
          answer:
            'We read every review before it appears, so give it a day. Editing an approved review sends it back for another look, which is deliberate — it stops a published review being quietly rewritten later.',
        },
        {
          question: 'Can I delete my account?',
          answer:
            'Yes, from your profile page. We anonymise your details and sign you out. Past invoices stay in our books without your name attached, because Nepali tax rules require us to keep the record of a sale.',
        },
      ],
    },
  ];
}
