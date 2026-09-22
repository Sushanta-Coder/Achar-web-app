import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { PageHeader, Panel, TabBar } from '../../components/admin/AdminPage';
import { useFetch } from '../../hooks/useApi';
import { patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';

/**
 * Site settings. Admin-only, mirroring `requireAdmin` on the server.
 *
 * Two rules shape this screen.
 *
 * **It saves one section at a time.** `PATCH /settings/admin` merges rather than replaces, and
 * the validator only accepts keys it knows. Sending the whole document back would mean an admin
 * editing the phone number could silently overwrite a policy someone else changed a minute ago;
 * sending only `{ company: {...} }` cannot.
 *
 * **No key material, ever.** The Payments tab shows which gateways the *deployment* has
 * credentials for as read-only booleans from the server's own environment. The toggles here
 * decide whether a configured gateway is offered at checkout — they cannot supply a secret, and
 * enabling a gateway with no credentials is refused by checkout rather than pretended at. Khalti
 * and eSewa keys live in the server's environment and are never sent to a browser, not even an
 * admin's.
 */

const TABS = [
  { value: 'company', label: 'Company' },
  { value: 'commerce', label: 'Commerce' },
  { value: 'payments', label: 'Payments' },
  { value: 'seo', label: 'SEO' },
  { value: 'announcement', label: 'Announcement' },
  { value: 'policies', label: 'Policies' },
];

const POLICY_TABS = [
  { slug: 'shipping', label: 'Shipping & delivery', hint: 'Charges, lead times, what happens to a late parcel.' },
  { slug: 'returns', label: 'Returns & refunds', hint: 'Food is hard to return. Say plainly what you will and will not take back.' },
  { slug: 'payment', label: 'Payment', hint: 'Which methods you accept and when money is taken. Khalti and eSewa both check for this page.' },
  { slug: 'privacy', label: 'Privacy', hint: 'What you store, why, and who else sees it.' },
  { slug: 'terms', label: 'Terms of service', hint: 'The contract between the shop and the buyer.' },
];

export default function AdminSettings() {
  const [tab, setTab] = useState('company');
  const toast = useToast();

  useSeo({ title: 'Settings · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/settings/admin');

  const settings = data?.settings;
  const integrations = data?.integrations ?? {};

  /** One section, one PATCH. The server merges; nothing outside `section` is touched. */
  const save = async (section, body, { url = '/settings/admin' } = {}) => {
    try {
      await patch(url, section ? { [section]: body } : body);
      toast.success('Saved');
      refetch();
      return true;
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not save');
      return false;
    }
  };

  if (loading && !data) return <PageLoader label="Loading settings" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Site settings"
        description="Everything the storefront reads about the shop itself. Each tab saves on its own."
      />

      {/*
        Maintenance mode is above the tabs because it is the one switch here that takes the
        shop offline, and burying it inside a tab would make it findable only by someone who
        already knew where it was.
      */}
      <MaintenanceBanner
        active={Boolean(settings?.maintenanceMode)}
        onToggle={async (next) => {
          try {
            await patch('/settings/admin/maintenance', { maintenanceMode: next });
            toast.success(next ? 'The shop is now in maintenance mode' : 'The shop is open again');
            refetch();
          } catch (requestError) {
            /**
             * A 503 here is the maintenance gate refusing the one request that ends
             * maintenance - an API old enough to predate the fix for that. Showing its
             * body verbatim told the admin "please try placing your order again
             * shortly", which is copy written for a customer and reads, to the person
             * holding the switch, as if the button had silently done nothing.
             */
            const { status, message } = requestError?.normalised ?? {};
            toast.error(
              status === 503
                ? 'This API build cannot switch maintenance off - deploy the latest commit on Render, then try again.'
                : (message ?? 'Could not change maintenance mode')
            );
          }
        }}
      />

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'company' ? <CompanySection settings={settings} onSave={save} /> : null}
      {tab === 'commerce' ? <CommerceSection settings={settings} onSave={save} /> : null}
      {tab === 'payments' ? (
        <PaymentsSection settings={settings} integrations={integrations} onSave={save} />
      ) : null}
      {tab === 'seo' ? <SeoSection settings={settings} onSave={save} /> : null}
      {tab === 'announcement' ? <AnnouncementSection settings={settings} onSave={save} /> : null}
      {tab === 'policies' ? <PoliciesSection settings={settings} onSave={save} /> : null}
    </>
  );
}

// --- Shared -------------------------------------------------------------------

/**
 * A section form. Local state seeded from the settings document, a dirty flag so the Save
 * button is honest about whether there is anything to save, and a submit that hands the
 * section body up. Sections differ only in their fields, so the plumbing lives here once.
 */
function useSection(initial, deps) {
  const [form, setForm] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm(initial);
    setDirty(false);
    // `initial` is rebuilt on every render by the caller, so the dep is the settings object
    // it was derived from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const field = (patchValues) => {
    setForm((current) => ({ ...current, ...patchValues }));
    setDirty(true);
  };

  return { form, field, dirty, setDirty, busy, setBusy };
}

function SectionForm({ title, description, children, dirty, busy, onSubmit }) {
  return (
    <form onSubmit={onSubmit}>
      <Panel
        title={title}
        actions={
          <button
            type="submit"
            disabled={busy || !dirty}
            className="btn-primary btn-sm"
            title={dirty ? undefined : 'Nothing has changed'}
          >
            {busy ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
            Save
          </button>
        }
      >
        {description ? <p className="text-ink-500 mb-3 text-sm">{description}</p> : null}
        {children}
      </Panel>
    </form>
  );
}

function Field({ id, label, hint, children, error }) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

function Check({ checked, onChange, children }) {
  return (
    <label className="border-cream-300 flex cursor-pointer items-start gap-2 rounded-xl border p-3 text-sm">
      <input
        type="checkbox"
        checked={Boolean(checked)}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 size-4 shrink-0 cursor-pointer"
      />
      <span>{children}</span>
    </label>
  );
}

// --- Maintenance --------------------------------------------------------------

function MaintenanceBanner({ active, onToggle }) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    await onToggle(!active);
    setBusy(false);
  };

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 ${
        active ? 'border-red-200 bg-red-50' : 'border-cream-300 bg-white'
      }`}
    >
      <Icon
        name={active ? 'alert' : 'checkCircle'}
        className={`size-5 shrink-0 ${active ? 'text-red-600' : 'text-leaf-600'}`}
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${active ? 'text-red-800' : 'text-ink-800'}`}>
          {active ? 'The shop is in maintenance mode' : 'The shop is open'}
        </p>
        <p className={`text-sm ${active ? 'text-red-700' : 'text-ink-500'}`}>
          {active
            ? 'Customers see a holding page and cannot order. This dashboard keeps working.'
            : 'Customers can browse and order normally.'}
        </p>
      </div>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={
          active
            ? 'btn btn-sm bg-leaf-600 text-white hover:bg-leaf-700'
            : 'btn-outline btn-sm text-red-600'
        }
      >
        {busy ? <Spinner className="size-4" /> : null}
        {/*
          Named for what it does to the switch, not for the outcome. "Open the shop"
          sat next to a link-coloured storefront preview and read as "take me to the
          shop", so the one control that ends a maintenance window looked like
          navigation - which is a bad thing to be unsure about with the shop closed.
        */}
        {active ? 'Turn maintenance off' : 'Close for maintenance'}
      </button>
    </div>
  );
}

// --- Company ------------------------------------------------------------------

function CompanySection({ settings, onSave }) {
  const company = settings?.company ?? {};
  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    {
      name: company.name ?? '',
      nameNp: company.nameNp ?? '',
      tagline: company.tagline ?? '',
      taglineNp: company.taglineNp ?? '',
      legalName: company.legalName ?? '',
      panNumber: company.panNumber ?? '',
      email: company.email ?? '',
      supportEmail: company.supportEmail ?? '',
      phone: company.phone ?? '',
      whatsapp: company.whatsapp ?? '',
      landline: company.landline ?? '',
      street: company.address?.street ?? '',
      municipality: company.address?.municipality ?? '',
      wardNo: company.address?.wardNo ?? '',
      district: company.address?.district ?? '',
      province: company.address?.province ?? '',
      mapUrl: company.mapUrl ?? '',
      openingHours: (company.openingHours ?? []).join('\n'),
      facebook: company.social?.facebook ?? '',
      instagram: company.social?.instagram ?? '',
      tiktok: company.social?.tiktok ?? '',
      youtube: company.social?.youtube ?? '',
    },
    [settings]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const saved = await onSave('company', {
      name: form.name,
      nameNp: form.nameNp,
      tagline: form.tagline,
      taglineNp: form.taglineNp,
      legalName: form.legalName,
      panNumber: form.panNumber,
      email: form.email,
      supportEmail: form.supportEmail,
      phone: form.phone,
      whatsapp: form.whatsapp,
      landline: form.landline,
      address: {
        street: form.street,
        municipality: form.municipality,
        // Sent only when set: the schema caps the ward at 35 and an empty string is not a
        // number, so an untouched field must be left out rather than coerced to 0.
        ...(form.wardNo ? { wardNo: Number(form.wardNo) } : {}),
        district: form.district,
        province: form.province,
      },
      mapUrl: form.mapUrl,
      openingHours: form.openingHours
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 7),
      social: {
        facebook: form.facebook,
        instagram: form.instagram,
        tiktok: form.tiktok,
        youtube: form.youtube,
      },
    });
    setBusy(false);
    if (saved) setDirty(false);
  };

  return (
    <SectionForm
      title="Company"
      description="Used in the header, the footer, invoices, structured data and the contact page."
      dirty={dirty}
      busy={busy}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="set-name" label="Shop name">
            <input
              id="set-name"
              maxLength={90}
              value={form.name}
              onChange={(event) => field({ name: event.target.value })}
              className="field-input"
            />
          </Field>
          <Field id="set-nameNp" label="Shop name in Nepali">
            <input
              id="set-nameNp"
              maxLength={90}
              value={form.nameNp}
              onChange={(event) => field({ nameNp: event.target.value })}
              className="field-input"
              lang="ne"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="set-tagline" label="Tagline" hint="One line. Appears under the logo.">
            <input
              id="set-tagline"
              maxLength={160}
              value={form.tagline}
              onChange={(event) => field({ tagline: event.target.value })}
              className="field-input"
            />
          </Field>
          <Field id="set-taglineNp" label="Tagline in Nepali">
            <input
              id="set-taglineNp"
              maxLength={160}
              value={form.taglineNp}
              onChange={(event) => field({ taglineNp: event.target.value })}
              className="field-input"
              lang="ne"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="set-legal"
            label="Registered name"
            hint="The name on the registration, if it differs. Shown on invoices."
          >
            <input
              id="set-legal"
              maxLength={120}
              value={form.legalName}
              onChange={(event) => field({ legalName: event.target.value })}
              className="field-input"
            />
          </Field>
          <Field id="set-pan" label="PAN / VAT number">
            <input
              id="set-pan"
              maxLength={30}
              value={form.panNumber}
              onChange={(event) => field({ panNumber: event.target.value })}
              className="field-input tnum"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="set-email" label="Public email">
            <input
              id="set-email"
              type="email"
              maxLength={160}
              value={form.email}
              onChange={(event) => field({ email: event.target.value })}
              className="field-input"
            />
          </Field>
          <Field
            id="set-support"
            label="Support email"
            hint="Where the contact form says to write. Falls back to the public one."
          >
            <input
              id="set-support"
              type="email"
              maxLength={160}
              value={form.supportEmail}
              onChange={(event) => field({ supportEmail: event.target.value })}
              className="field-input"
            />
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="set-phone" label="Mobile">
            <input
              id="set-phone"
              maxLength={20}
              value={form.phone}
              onChange={(event) => field({ phone: event.target.value })}
              className="field-input tnum"
              placeholder="98XXXXXXXX"
            />
          </Field>
          <Field id="set-whatsapp" label="WhatsApp" hint="Adds a chat button.">
            <input
              id="set-whatsapp"
              maxLength={20}
              value={form.whatsapp}
              onChange={(event) => field({ whatsapp: event.target.value })}
              className="field-input tnum"
            />
          </Field>
          <Field id="set-landline" label="Landline">
            <input
              id="set-landline"
              maxLength={20}
              value={form.landline}
              onChange={(event) => field({ landline: event.target.value })}
              className="field-input tnum"
              placeholder="01-XXXXXXX"
            />
          </Field>
        </div>

        <fieldset className="border-cream-300 rounded-xl border p-3">
          <legend className="text-ink-700 px-1 text-sm font-medium">Address</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="set-street" label="Street / tole">
              <input
                id="set-street"
                maxLength={120}
                value={form.street}
                onChange={(event) => field({ street: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-municipality" label="Municipality">
              <input
                id="set-municipality"
                maxLength={90}
                value={form.municipality}
                onChange={(event) => field({ municipality: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-ward" label="Ward no.">
              <input
                id="set-ward"
                type="number"
                min={1}
                max={35}
                step={1}
                value={form.wardNo}
                onChange={(event) => field({ wardNo: event.target.value })}
                className="field-input tnum"
              />
            </Field>
            <Field id="set-district" label="District">
              <input
                id="set-district"
                maxLength={60}
                value={form.district}
                onChange={(event) => field({ district: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-province" label="Province">
              <input
                id="set-province"
                maxLength={60}
                value={form.province}
                onChange={(event) => field({ province: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-map" label="Google Maps link">
              <input
                id="set-map"
                maxLength={600}
                value={form.mapUrl}
                onChange={(event) => field({ mapUrl: event.target.value })}
                className="field-input"
              />
            </Field>
          </div>
        </fieldset>

        <Field
          id="set-hours"
          label="Opening hours"
          hint="One line per day, up to seven. Shown on the contact page and in the shop's structured data."
        >
          <textarea
            id="set-hours"
            rows={4}
            value={form.openingHours}
            onChange={(event) => field({ openingHours: event.target.value })}
            className="field-input text-sm"
            placeholder={'Sunday–Friday: 9am – 6pm\nSaturday: closed'}
          />
        </Field>

        <fieldset className="border-cream-300 rounded-xl border p-3">
          <legend className="text-ink-700 px-1 text-sm font-medium">Social links</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="set-fb" label="Facebook">
              <input
                id="set-fb"
                maxLength={300}
                value={form.facebook}
                onChange={(event) => field({ facebook: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-ig" label="Instagram">
              <input
                id="set-ig"
                maxLength={300}
                value={form.instagram}
                onChange={(event) => field({ instagram: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-tt" label="TikTok">
              <input
                id="set-tt"
                maxLength={300}
                value={form.tiktok}
                onChange={(event) => field({ tiktok: event.target.value })}
                className="field-input"
              />
            </Field>
            <Field id="set-yt" label="YouTube">
              <input
                id="set-yt"
                maxLength={300}
                value={form.youtube}
                onChange={(event) => field({ youtube: event.target.value })}
                className="field-input"
              />
            </Field>
          </div>
        </fieldset>
      </div>
    </SectionForm>
  );
}

// --- Commerce -----------------------------------------------------------------

function CommerceSection({ settings, onSave }) {
  const commerce = settings?.commerce ?? {};
  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    {
      taxRate: commerce.taxRate ?? 0,
      taxLabel: commerce.taxLabel ?? 'VAT',
      pricesIncludeTax: commerce.pricesIncludeTax ?? true,
      freeDeliveryThreshold: commerce.freeDeliveryThreshold ?? 0,
      minOrderAmount: commerce.minOrderAmount ?? 0,
      allowGuestCheckout: commerce.allowGuestCheckout ?? true,
      requireDeliveredOrderForReview: commerce.requireDeliveredOrderForReview ?? true,
      autoApproveReviews: commerce.autoApproveReviews ?? false,
    },
    [settings]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const saved = await onSave('commerce', {
      taxRate: Number(form.taxRate) || 0,
      taxLabel: form.taxLabel,
      pricesIncludeTax: form.pricesIncludeTax,
      freeDeliveryThreshold: Number(form.freeDeliveryThreshold) || 0,
      minOrderAmount: Number(form.minOrderAmount) || 0,
      allowGuestCheckout: form.allowGuestCheckout,
      requireDeliveredOrderForReview: form.requireDeliveredOrderForReview,
      autoApproveReviews: form.autoApproveReviews,
    });
    setBusy(false);
    if (saved) setDirty(false);
  };

  return (
    <SectionForm
      title="Commerce"
      description="These change what the server charges. The storefront only ever displays what the server has calculated."
      dirty={dirty}
      busy={busy}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="set-tax" label="Tax rate (%)" hint="0 if you do not charge tax.">
            <input
              id="set-tax"
              type="number"
              min={0}
              max={30}
              step={0.5}
              value={form.taxRate}
              onChange={(event) => field({ taxRate: event.target.value })}
              className="field-input tnum"
            />
          </Field>
          <Field id="set-tax-label" label="Tax label">
            <input
              id="set-tax-label"
              maxLength={20}
              value={form.taxLabel}
              onChange={(event) => field({ taxLabel: event.target.value })}
              className="field-input"
            />
          </Field>
          <Field
            id="set-min"
            label="Minimum order"
            hint="Rupees. 0 means no minimum."
          >
            <input
              id="set-min"
              type="number"
              min={0}
              step={1}
              value={form.minOrderAmount}
              onChange={(event) => field({ minOrderAmount: event.target.value })}
              className="field-input tnum"
            />
          </Field>
        </div>

        <Field
          id="set-free"
          label="Free delivery over"
          hint="Rupees. A delivery zone can override this with its own threshold. 0 disables it."
        >
          <input
            id="set-free"
            type="number"
            min={0}
            step={1}
            value={form.freeDeliveryThreshold}
            onChange={(event) => field({ freeDeliveryThreshold: event.target.value })}
            className="field-input tnum"
          />
        </Field>

        <div className="space-y-2">
          <Check
            checked={form.pricesIncludeTax}
            onChange={(next) => field({ pricesIncludeTax: next })}
          >
            Prices already include tax
            <span className="text-ink-500 block text-xs">
              Nepali retail prices normally do. Leave this on unless you add tax at checkout.
            </span>
          </Check>

          <Check
            checked={form.allowGuestCheckout}
            onChange={(next) => field({ allowGuestCheckout: next })}
          >
            Allow checkout without an account
            <span className="text-ink-500 block text-xs">
              Turning this off will cost you orders. Most people buying one jar of achar will not
              register first.
            </span>
          </Check>

          <Check
            checked={form.requireDeliveredOrderForReview}
            onChange={(next) => field({ requireDeliveredOrderForReview: next })}
          >
            Only let customers review what they have received
            <span className="text-ink-500 block text-xs">
              Reviews are marked as verified purchases. Off, anyone with an account can review
              anything.
            </span>
          </Check>

          <Check
            checked={form.autoApproveReviews}
            onChange={(next) => field({ autoApproveReviews: next })}
          >
            Publish reviews without moderation
            <span className="text-ink-500 block text-xs">
              Faster, but a bad-faith review is live before you see it. Off, they wait in the
              Reviews queue.
            </span>
          </Check>
        </div>
      </div>
    </SectionForm>
  );
}

// --- Payments -----------------------------------------------------------------

function PaymentsSection({ settings, integrations, onSave }) {
  const payments = settings?.payments ?? {};
  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    {
      khaltiEnabled: payments.khalti?.isEnabled ?? false,
      khaltiLabel: payments.khalti?.label ?? 'Khalti',
      esewaEnabled: payments.esewa?.isEnabled ?? false,
      esewaLabel: payments.esewa?.label ?? 'eSewa',
      codEnabled: payments.cod?.isEnabled ?? true,
      codLabel: payments.cod?.label ?? 'Cash on Delivery',
      codMax: payments.cod?.maxOrderAmount ?? 0,
    },
    [settings]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const saved = await onSave('payments', {
      khalti: { isEnabled: form.khaltiEnabled, label: form.khaltiLabel },
      esewa: { isEnabled: form.esewaEnabled, label: form.esewaLabel },
      cod: {
        isEnabled: form.codEnabled,
        label: form.codLabel,
        maxOrderAmount: Number(form.codMax) || 0,
      },
    });
    setBusy(false);
    if (saved) setDirty(false);
  };

  return (
    <>
      {/*
        Read-only, straight from the server's environment. An admin needs to know whether a
        gateway *can* work; they must never be shown the key that makes it work, and there is
        no field here to type one into — that is a deployment change, not a settings change.
      */}
      <Panel title="How this deployment is configured" className="mb-4">
        <p className="text-ink-500 mb-3 text-sm">
          Credentials live in the server&apos;s environment and are never sent to a browser. To
          change them, edit the environment and restart the API.
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <ConfigRow label="Khalti keys" ok={integrations.khaltiConfigured} detail={integrations.khaltiBaseUrl} />
          <ConfigRow label="eSewa keys" ok={integrations.esewaConfigured} detail={integrations.esewaBaseUrl} />
          <ConfigRow
            label="Cloudinary"
            ok={integrations.cloudinaryConfigured}
            detail={integrations.cloudinaryConfigured ? 'Image uploads enabled' : 'Uploads fall back to pasting a URL'}
          />
          <ConfigRow
            label="Email"
            ok={integrations.emailConfigured}
            detail={integrations.emailConfigured ? 'Order emails will send' : 'Order emails are logged, not sent'}
            action={<TestEmailButton enabled={integrations.emailConfigured} />}
          />
        </dl>
      </Panel>

      <SectionForm
        title="Payment methods at checkout"
        description="A method must be switched on here and configured above before a customer is offered it."
        dirty={dirty}
        busy={busy}
        onSubmit={submit}
      >
        <div className="space-y-3">
          <GatewayRow
            name="Khalti"
            enabled={form.khaltiEnabled}
            onToggle={(next) => field({ khaltiEnabled: next })}
            label={form.khaltiLabel}
            onLabel={(next) => field({ khaltiLabel: next })}
            configured={integrations.khaltiConfigured}
            id="khalti"
          />

          <GatewayRow
            name="eSewa"
            enabled={form.esewaEnabled}
            onToggle={(next) => field({ esewaEnabled: next })}
            label={form.esewaLabel}
            onLabel={(next) => field({ esewaLabel: next })}
            configured={integrations.esewaConfigured}
            id="esewa"
          />

          <div className="border-cream-300 rounded-xl border p-3">
            <Check checked={form.codEnabled} onChange={(next) => field({ codEnabled: next })}>
              Cash on delivery
              <span className="text-ink-500 block text-xs">
                No gateway needed. A delivery zone can still refuse COD for its own districts.
              </span>
            </Check>

            {form.codEnabled ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Field id="set-cod-label" label="Label at checkout">
                  <input
                    id="set-cod-label"
                    maxLength={40}
                    value={form.codLabel}
                    onChange={(event) => field({ codLabel: event.target.value })}
                    className="field-input"
                  />
                </Field>
                <Field
                  id="set-cod-max"
                  label="Maximum COD order"
                  hint="Rupees. 0 means no cap. A cap limits what a refused delivery can cost you."
                >
                  <input
                    id="set-cod-max"
                    type="number"
                    min={0}
                    step={1}
                    value={form.codMax}
                    onChange={(event) => field({ codMax: event.target.value })}
                    className="field-input tnum"
                  />
                </Field>
              </div>
            ) : null}
          </div>
        </div>
      </SectionForm>
    </>
  );
}

function ConfigRow({ label, ok, detail, action }) {
  return (
    <div className="border-cream-300 flex items-start gap-2 rounded-lg border px-3 py-2">
      <Icon
        name={ok ? 'checkCircle' : 'alert'}
        className={`mt-0.5 size-4 shrink-0 ${ok ? 'text-leaf-600' : 'text-mustard-600'}`}
      />
      <div className="min-w-0 flex-1">
        <dt className="text-sm font-medium">{label}</dt>
        <dd className="text-ink-400 truncate text-xs">
          {ok ? detail || 'Configured' : 'Not configured'}
        </dd>
      </div>
      {action}
    </div>
  );
}

/**
 * Proves the mail provider works without placing an order.
 *
 * Worth a button because the alternative is guesswork: order confirmations are sent
 * fire-and-forget so that a broken provider cannot fail a checkout, which also means a
 * broken provider looks exactly like a working one from this screen. The boolean above
 * only says a key is present - not that it is valid, nor that the sender address has
 * been verified, which is the failure that actually happens.
 *
 * The server's message is shown verbatim on both paths; it names what the provider
 * objected to, and a generic "could not send" would put the admin straight back to
 * guessing.
 */
function TestEmailButton({ enabled }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      // `request` unwraps to `data`, so the server's own headline is not available here -
      // hence the wording is repeated rather than echoed. The error path *does* get the
      // server's message, which is the one that has to be exact.
      const result = await post('/settings/admin/test-email');
      toast.success(
        `Test email sent to ${result?.to ?? 'your address'}. Check spam if it is not in the inbox.`
      );
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not send the test email');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy || !enabled}
      title={enabled ? 'Sends one email to your own address' : 'Configure a provider first'}
      className="btn-outline btn-sm shrink-0"
    >
      {busy ? <Spinner className="size-4" /> : null}
      Send test
    </button>
  );
}

function GatewayRow({ name, id, enabled, onToggle, label, onLabel, configured }) {
  return (
    <div className="border-cream-300 rounded-xl border p-3">
      <Check checked={enabled} onChange={onToggle}>
        {name}
        {!configured ? (
          <span className="text-mustard-800 block text-xs">
            No keys in this environment — switching it on will not make it work at checkout.
          </span>
        ) : (
          <span className="text-ink-500 block text-xs">
            Verified server-side on every callback. A browser redirect alone never marks an order
            paid.
          </span>
        )}
      </Check>

      {enabled ? (
        <div className="mt-3">
          <Field id={`set-${id}-label`} label="Label at checkout">
            <input
              id={`set-${id}-label`}
              maxLength={40}
              value={label}
              onChange={(event) => onLabel(event.target.value)}
              className="field-input"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

// --- SEO ----------------------------------------------------------------------

function SeoSection({ settings, onSave }) {
  const seo = settings?.seo ?? {};
  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    {
      defaultTitle: seo.defaultTitle ?? '',
      titleTemplate: seo.titleTemplate ?? '%s · {{name}}',
      defaultDescription: seo.defaultDescription ?? '',
      defaultKeywords: (seo.defaultKeywords ?? []).join(', '),
      ogImageUrl: seo.ogImageUrl ?? '',
      twitterHandle: seo.twitterHandle ?? '',
      googleSiteVerification: seo.googleSiteVerification ?? '',
      indexable: seo.indexable ?? true,
    },
    [settings]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    // Its own endpoint, so the body is the section itself rather than `{ seo: … }`.
    const saved = await onSave(null, {
      defaultTitle: form.defaultTitle,
      titleTemplate: form.titleTemplate,
      defaultDescription: form.defaultDescription,
      defaultKeywords: form.defaultKeywords
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, 30),
      ogImageUrl: form.ogImageUrl,
      twitterHandle: form.twitterHandle,
      googleSiteVerification: form.googleSiteVerification,
      indexable: form.indexable,
    }, { url: '/settings/admin/seo' });
    setBusy(false);
    if (saved) setDirty(false);
  };

  return (
    <SectionForm
      title="Search engines"
      description="Defaults for any page that does not set its own. Product and article pages override these."
      dirty={dirty}
      busy={busy}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <Field
          id="set-seo-title"
          label="Default title"
          hint="Around 60 characters shows in full on Google."
        >
          <input
            id="set-seo-title"
            maxLength={70}
            value={form.defaultTitle}
            onChange={(event) => field({ defaultTitle: event.target.value })}
            className="field-input"
          />
        </Field>

        <Field
          id="set-seo-template"
          label="Title template"
          hint="How a page title is combined with the shop name. %s is the page's own title."
        >
          <input
            id="set-seo-template"
            maxLength={60}
            value={form.titleTemplate}
            onChange={(event) => field({ titleTemplate: event.target.value })}
            className="field-input font-mono text-sm"
          />
        </Field>

        <Field
          id="set-seo-desc"
          label="Default description"
          hint="Up to 180 characters. Write it as a sentence a person would read, not a keyword list."
        >
          <textarea
            id="set-seo-desc"
            rows={2}
            maxLength={180}
            value={form.defaultDescription}
            onChange={(event) => field({ defaultDescription: event.target.value })}
            className="field-input"
          />
        </Field>

        <Field id="set-seo-keywords" label="Default keywords" hint="Comma separated.">
          <input
            id="set-seo-keywords"
            value={form.defaultKeywords}
            onChange={(event) => field({ defaultKeywords: event.target.value })}
            className="field-input"
            placeholder="nepali achar, homemade pickle, mula ko achar"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            id="set-seo-og"
            label="Share image"
            hint="1200×630. Used when a link is pasted into Facebook, Viber or WhatsApp."
          >
            <input
              id="set-seo-og"
              maxLength={600}
              value={form.ogImageUrl}
              onChange={(event) => field({ ogImageUrl: event.target.value })}
              className="field-input"
            />
          </Field>

          <Field id="set-seo-twitter" label="Twitter handle">
            <input
              id="set-seo-twitter"
              maxLength={40}
              value={form.twitterHandle}
              onChange={(event) => field({ twitterHandle: event.target.value })}
              className="field-input"
              placeholder="@aamaachar"
            />
          </Field>
        </div>

        <Field
          id="set-seo-verify"
          label="Google site verification"
          hint="The token from Search Console, without the meta tag around it."
        >
          <input
            id="set-seo-verify"
            maxLength={120}
            value={form.googleSiteVerification}
            onChange={(event) => field({ googleSiteVerification: event.target.value })}
            className="field-input font-mono text-sm"
          />
        </Field>

        <Check checked={form.indexable} onChange={(next) => field({ indexable: next })}>
          Allow search engines to index the site
          <span className="text-ink-500 block text-xs">
            Off sends <code>noindex</code> site-wide and empties the sitemap. Only useful before
            launch — leaving it off is how a shop stays invisible for months.
          </span>
        </Check>
      </div>
    </SectionForm>
  );
}

// --- Announcement -------------------------------------------------------------

function AnnouncementSection({ settings, onSave }) {
  const announcement = settings?.announcement ?? {};
  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    {
      isActive: announcement.isActive ?? false,
      text: announcement.text ?? '',
      textNp: announcement.textNp ?? '',
      link: announcement.link ?? '',
    },
    [settings]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const saved = await onSave('announcement', {
      isActive: form.isActive,
      text: form.text,
      textNp: form.textNp,
      link: form.link,
    });
    setBusy(false);
    if (saved) setDirty(false);
  };

  return (
    <SectionForm
      title="Announcement bar"
      description="The strip above the header. Good for a festival delivery cut-off; bad as permanent furniture — people stop seeing it."
      dirty={dirty}
      busy={busy}
      onSubmit={submit}
    >
      <div className="space-y-3">
        <Check checked={form.isActive} onChange={(next) => field({ isActive: next })}>
          Show the announcement bar
        </Check>

        <Field id="set-ann-text" label="Text">
          <input
            id="set-ann-text"
            maxLength={200}
            value={form.text}
            onChange={(event) => field({ text: event.target.value })}
            className="field-input"
            placeholder="Free delivery inside Kathmandu Valley over Rs 1,500"
          />
        </Field>

        <Field id="set-ann-textNp" label="Text in Nepali">
          <input
            id="set-ann-textNp"
            maxLength={200}
            value={form.textNp}
            onChange={(event) => field({ textNp: event.target.value })}
            className="field-input"
            lang="ne"
          />
        </Field>

        <Field id="set-ann-link" label="Link" hint="Optional. A path on this site.">
          <input
            id="set-ann-link"
            maxLength={200}
            value={form.link}
            onChange={(event) => field({ link: event.target.value })}
            className="field-input"
            placeholder="/shop"
          />
        </Field>

        {form.isActive && form.text ? (
          <div>
            <p className="field-label">Preview</p>
            <div className="bg-ink-800 rounded-lg px-3 py-2 text-center text-sm text-white">
              {form.text}
            </div>
          </div>
        ) : null}
      </div>
    </SectionForm>
  );
}

// --- Policies -----------------------------------------------------------------

/**
 * The five policy pages, each a Markdown textarea saved on its own.
 *
 * These are not optional decoration: Khalti and eSewa both require a live, reachable refund
 * and privacy policy before they will approve a merchant account. Empty ones are flagged.
 */
function PoliciesSection({ settings, onSave }) {
  const [slug, setSlug] = useState('shipping');
  const policies = settings?.policies ?? {};
  const active = POLICY_TABS.find((entry) => entry.slug === slug) ?? POLICY_TABS[0];

  const { form, field, dirty, setDirty, busy, setBusy } = useSection(
    { body: policies[slug] ?? '' },
    [settings, slug]
  );

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    const saved = await onSave('policies', { [slug]: form.body });
    setBusy(false);
    if (saved) setDirty(false);
  };

  const missing = POLICY_TABS.filter((entry) => !(policies[entry.slug] ?? '').trim());

  return (
    <>
      {missing.length ? (
        <div className="border-mustard-200 bg-mustard-50 mb-4 flex items-start gap-2 rounded-xl border p-3">
          <Icon name="alert" className="text-mustard-600 mt-0.5 size-4 shrink-0" />
          <p className="text-mustard-800 text-sm">
            {missing.length} policy page{missing.length === 1 ? ' is' : 's are'} empty:{' '}
            <strong>{missing.map((entry) => entry.label).join(', ')}</strong>. Khalti and eSewa
            both check for a live refund and privacy policy before approving a merchant account.
          </p>
        </div>
      ) : null}

      <TabBar
        tabs={POLICY_TABS.map((entry) => ({ value: entry.slug, label: entry.label }))}
        active={slug}
        onChange={(next) => setSlug(next)}
      />

      <SectionForm
        title={active.label}
        description={`${active.hint} Markdown — headings, lists, bold and links render.`}
        dirty={dirty}
        busy={busy}
        onSubmit={submit}
      >
        <textarea
          rows={18}
          maxLength={40_000}
          value={form.body}
          onChange={(event) => field({ body: event.target.value })}
          className="field-input font-mono text-sm leading-relaxed"
          placeholder={'## How long delivery takes\n\n- Kathmandu Valley: 1–2 days\n- Outside the valley: 3–5 days'}
        />
        <p className="field-hint">
          Reachable at <code>/{slug === 'terms' ? 'terms' : `${slug}-policy`}</code>. Linked from
          the footer whether or not it has content, so an empty one is a visible gap.
        </p>
      </SectionForm>
    </>
  );
}
