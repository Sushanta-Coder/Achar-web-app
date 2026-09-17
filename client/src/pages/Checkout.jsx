import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Icon from '../components/ui/Icon';
import Spinner from '../components/ui/Spinner';
import EmptyState from '../components/ui/EmptyState';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useToast } from '../context/ToastContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { post, apiError } from '../lib/apiClient';
import { addressLine, formatPrice } from '../lib/format';
import { rememberOrderToken } from '../lib/guestOrders';

/**
 * Checkout.
 *
 * Four steps on one route rather than four routes: the cart quote, the address and the
 * chosen method all belong to one decision, and a page reload halfway through a payment
 * flow is exactly what you do not want. Step state is local; nothing is persisted until
 * `POST /orders` is called.
 *
 * **What the client sends:** customer details, a shipping address, a payment method, and
 * for guests the `{productId, variantId, quantity}` list. No prices. The order total is
 * computed by the server from the live catalogue — `createOrder` re-prices the whole cart
 * with `enforceStock: true` and ignores anything the browser thinks it costs. The summary
 * on the right is `quote.pricing`, read straight from `POST /cart/quote`.
 *
 * The delivery charge only becomes real once a district is chosen, so the address step
 * re-quotes on province/district change. That request is a read; it cannot change a price.
 *
 * Online payment never settles here. `POST /orders` returns `requiresPayment`, then
 * `POST /payments/initiate` returns either a Khalti URL to visit or eSewa's form fields,
 * and the gateway sends the customer back to the *API*, which verifies server-side. There
 * is no branch in this file that can mark an order paid.
 */

const STEPS = ['Contact', 'Address', 'Payment', 'Review'];

const CONTACT_FIELDS = ['name', 'email', 'phone'];
const ADDRESS_FIELDS = [
  'fullName',
  'phone',
  'province',
  'district',
  'municipality',
  'wardNo',
  'tole',
  'street',
  'landmark',
  'altPhone',
  'label',
  'deliveryInstructions',
];
const FIELDS_BY_STEP = [CONTACT_FIELDS, ['fullName', 'province', 'district', 'municipality', 'wardNo', 'tole']];

const BLANK_ADDRESS = {
  label: '',
  fullName: '',
  phone: '',
  altPhone: '',
  province: '',
  district: '',
  municipality: '',
  wardNo: '',
  tole: '',
  street: '',
  landmark: '',
  deliveryInstructions: '',
};

export default function Checkout() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const {
    items,
    quote,
    pricing,
    coupon,
    isEmpty,
    loading: cartLoading,
    guestItems,
    quoteFor,
    clear,
  } = useCart();

  const [step, setStep] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [saveAddress, setSaveAddress] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [method, setMethod] = useState('');
  const [note, setNote] = useState('');

  useSeo({ title: 'Checkout', noIndex: true });

  // Gateways, saved addresses, COD limits and the guest-checkout switch, in one request.
  const context = useFetch('/orders/checkout-context');
  const locations = useFetch('/settings/locations');

  const { register, watch, setValue, setError, handleSubmit, formState, trigger, getValues } =
    useForm({
      mode: 'onTouched',
      defaultValues: {
        name: '',
        email: '',
        phone: '',
        ...BLANK_ADDRESS,
      },
    });

  const province = watch('province');
  const district = watch('district');

  const provinces = locations.data?.provinces ?? [];
  const districts = useMemo(
    () => provinces.find((entry) => entry.name === province)?.districts ?? [],
    [provinces, province]
  );

  const savedAddresses = context.data?.addresses ?? [];
  const gateways = context.data?.gateways ?? [];
  const codConfig = settings?.payments?.cod;
  const minOrder = context.data?.minOrderAmount ?? 0;

  /**
   * Seeds the contact fields from the account once, when the context arrives. Written as
   * an effect because it depends on a fetch, and guarded on the field still being empty
   * so it can never overwrite something the customer has typed.
   */
  useEffect(() => {
    const customer = context.data?.customer;
    if (!customer) return;
    if (!getValues('name')) setValue('name', customer.name ?? '');
    if (!getValues('email')) setValue('email', customer.email ?? '');
    if (!getValues('phone')) setValue('phone', customer.phone ?? '');
  }, [context.data, getValues, setValue]);

  /** Picks the default saved address on first load, and fills the form from it. */
  useEffect(() => {
    if (selectedAddressId !== null || !savedAddresses.length) return;
    const preferred = savedAddresses.find((entry) => entry.isDefault) ?? savedAddresses[0];
    setSelectedAddressId(String(preferred._id));
    fillFromAddress(preferred);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddresses]);

  const fillFromAddress = (address) => {
    for (const key of Object.keys(BLANK_ADDRESS)) {
      setValue(key, address?.[key] ?? '', { shouldValidate: false });
    }
  };

  /**
   * Re-quotes when the district changes so the delivery charge on the right is the real
   * one. The province is sent too because zone matching uses both.
   */
  useEffect(() => {
    if (!district || !province) return;
    quoteFor({ address: { province, district }, paymentMethod: method || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [district, province, method]);

  // Default to the first available method once we know what is on offer.
  useEffect(() => {
    if (method) return;
    if (gateways.length) setMethod(gateways[0]);
    else if (codConfig?.isEnabled) setMethod('cod');
  }, [gateways, codConfig, method]);

  const codBlocked =
    method === 'cod' &&
    ((codConfig?.maxOrderAmount > 0 && (pricing?.total ?? 0) > codConfig.maxOrderAmount) ||
      quote?.delivery?.codAvailable === false);

  const belowMinimum = minOrder > 0 && (pricing?.subtotal ?? 0) < minOrder;

  const next = async () => {
    const fields = FIELDS_BY_STEP[step];
    if (fields && !(await trigger(fields))) return;
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  };

  /**
   * Places the order, then hands off to the gateway if one is needed.
   *
   * The two calls are deliberately separate: the order is written first and exists in
   * `payment_pending` regardless of what happens next, so a customer who abandons the
   * Khalti page leaves a record an admin can reconcile rather than a lost sale.
   */
  const placeOrder = async (values) => {
    setPlacing(true);
    try {
      const body = {
        customer: { name: values.name, email: values.email, phone: values.phone },
        shippingAddress: {
          label: values.label || undefined,
          fullName: values.fullName,
          phone: values.phone,
          altPhone: values.altPhone || undefined,
          province: values.province,
          district: values.district,
          municipality: values.municipality,
          wardNo: Number(values.wardNo),
          tole: values.tole,
          street: values.street || undefined,
          landmark: values.landmark || undefined,
          deliveryInstructions: values.deliveryInstructions || undefined,
        },
        paymentMethod: method,
        couponCode: coupon?.code,
        customerNote: note || undefined,
        saveAddress: isAuthenticated ? saveAddress : false,
        // Guests carry their cart with the request; a member's order is built from the
        // server-side cart and this is ignored.
        ...(isAuthenticated ? {} : { items: guestItems }),
      };

      const result = await post('/orders', body);
      const { order, accessToken, requiresPayment } = result;

      // A guest's only way back into this order. Router state does not survive the
      // gateway round-trip, so it is kept for the tab as well - see lib/guestOrders.
      rememberOrderToken(order.orderNumber, accessToken);

      /*
        These items are an order now, so the bag is emptied before the gateway hand-off -
        otherwise the header still shows a count for goods that are already sold, and a
        customer who abandons the payment could place the same order twice. `createOrder`
        already cleared a signed-in customer's server cart; this also resets the local
        quote so the header agrees, and clears a guest's localStorage copy which the
        server never sees.
      */
      await clear().catch(() => {});

      if (!requiresPayment) {
        // COD: the order is placed. The cart was cleared server-side by createOrder.
        navigate(`/order-success/${order.orderNumber}`, {
          replace: true,
          state: { justPlaced: true, accessToken },
        });
        return;
      }

      const payment = await post('/payments/initiate', {
        orderNumber: order.orderNumber,
        gateway: method,
        token: accessToken,
      });

      if (payment.method === 'redirect') {
        // Khalti hands back a URL. Full navigation, not a router push — we are leaving.
        window.location.assign(payment.redirectUrl);
        return;
      }

      // eSewa needs a browser form POST. The dedicated page renders and submits it; the
      // signature in `fields` was computed server-side and cannot be edited usefully.
      navigate('/payment/redirect', {
        state: {
          formUrl: payment.formUrl,
          fields: payment.fields,
          orderNumber: order.orderNumber,
          gateway: method,
        },
      });
    } catch (error) {
      const { message, errors } = apiError(error);
      const targets = mapServerErrors(errors);

      if (targets.length) {
        for (const target of targets) {
          setError(target.field, { type: 'server', message: target.message });
        }
        // Send the customer to the step that owns the first bad field, or the message
        // sits on an input two steps back where nobody will find it.
        setStep(CONTACT_FIELDS.includes(targets[0].field) ? 0 : 1);
        toast.error('Please check the highlighted fields');
      } else {
        toast.error(message);
      }
      setPlacing(false);
    }
  };

  if (cartLoading && !quote) {
    return (
      <div className="container-page py-20">
        <Spinner label="Loading checkout" className="mx-auto size-8" />
      </div>
    );
  }

  // `placing` matters: the bag is emptied the moment the order is written, a beat before
  // the redirect, and without this guard that beat renders "nothing to check out".
  if (isEmpty && !placing) {
    return (
      <div className="container-page py-10">
        <div className="card">
          <EmptyState
            icon="cart"
            title="There is nothing to check out"
            description="Your bag is empty. Add a jar or two and come back."
            action="Shop the shelf"
            actionTo="/shop"
          />
        </div>
      </div>
    );
  }

  if (!isAuthenticated && context.data && context.data.allowGuestCheckout === false) {
    return (
      <div className="container-page py-10">
        <div className="card">
          <EmptyState
            icon="user"
            title="Please sign in to check out"
            description="Guest checkout is switched off at the moment. Signing in also keeps your order history and addresses."
            action="Sign in"
            actionTo="/login"
            secondary={
              <Link to="/register" className="btn-outline">
                Create an account
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-6 sm:py-8">
      <h1 className="text-2xl sm:text-3xl">Checkout</h1>

      <ol className="mt-5 mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {STEPS.map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <button
              type="button"
              // Going back is always allowed; skipping ahead is not, because the later
              // steps read values the earlier ones validate.
              onClick={() => index < step && setStep(index)}
              disabled={index > step}
              className={`flex items-center gap-1.5 ${
                index === step
                  ? 'text-brand-700 font-medium'
                  : index < step
                    ? 'text-ink-600 cursor-pointer hover:underline'
                    : 'text-ink-400'
              }`}
            >
              <span
                className={`tnum grid size-6 place-items-center rounded-full text-xs ${
                  index < step
                    ? 'bg-leaf-600 text-white'
                    : index === step
                      ? 'bg-brand-600 text-white'
                      : 'bg-cream-200 text-ink-500'
                }`}
              >
                {index < step ? <Icon name="check" className="size-3.5" /> : index + 1}
              </span>
              {label}
            </button>
            {index < STEPS.length - 1 ? (
              <Icon name="chevronRight" className="text-cream-400 size-3.5" />
            ) : null}
          </li>
        ))}
      </ol>

      <form
        onSubmit={handleSubmit(placeOrder)}
        className="lg:grid lg:grid-cols-[1fr_20rem] lg:items-start lg:gap-8"
      >
        <div className="card p-4 sm:p-5">
          {/* --- 1. Contact ------------------------------------------------- */}
          {step === 0 ? (
            <fieldset>
              <legend className="text-lg">Who is this order for?</legend>
              <p className="text-ink-500 mt-1 text-sm">
                We use these to send the confirmation and to call if the courier cannot find
                the address.
              </p>

              {!isAuthenticated ? (
                <p className="border-cream-300 text-ink-600 mt-3 rounded-xl border p-3 text-sm">
                  Checking out as a guest.{' '}
                  <Link to="/login" state={{ from: { pathname: '/checkout' } }} className="text-brand-700 underline">
                    Sign in
                  </Link>{' '}
                  to use a saved address and keep your order history.
                </p>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Full name" error={formState.errors.name?.message}>
                  <input
                    {...register('name', { required: 'Your name is required' })}
                    className="field-input"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Email" error={formState.errors.email?.message}>
                  <input
                    {...register('email', {
                      required: 'An email is required for the receipt',
                      pattern: { value: /^[^@\s]+@[^@\s]+\.[^@\s]+$/, message: 'Check that email' },
                    })}
                    type="email"
                    className="field-input"
                    autoComplete="email"
                  />
                </Field>
                <Field
                  label="Mobile number"
                  error={formState.errors.phone?.message}
                  hint="10 digits, starting 97 or 98."
                >
                  <input
                    {...register('phone', {
                      required: 'A mobile number is required',
                      pattern: { value: /^9[678]\d{8}$/, message: 'Enter a valid Nepali mobile number' },
                    })}
                    inputMode="numeric"
                    className="field-input tnum"
                    autoComplete="tel"
                    placeholder="98XXXXXXXX"
                  />
                </Field>
              </div>
            </fieldset>
          ) : null}

          {/* --- 2. Address ------------------------------------------------- */}
          {step === 1 ? (
            <fieldset>
              <legend className="text-lg">Where should it go?</legend>

              {savedAddresses.length ? (
                <div className="mt-3 space-y-2">
                  {savedAddresses.map((address) => (
                    <label
                      key={address._id}
                      className={`flex cursor-pointer gap-2.5 rounded-xl border p-3 text-sm ${
                        selectedAddressId === String(address._id)
                          ? 'border-brand-400 bg-brand-50'
                          : 'border-cream-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="saved-address"
                        checked={selectedAddressId === String(address._id)}
                        onChange={() => {
                          setSelectedAddressId(String(address._id));
                          fillFromAddress(address);
                        }}
                        className="mt-0.5 size-4 cursor-pointer"
                      />
                      <span className="min-w-0">
                        <span className="font-medium">
                          {address.label || address.fullName}
                          {address.isDefault ? (
                            <span className="text-leaf-700 ml-1.5 text-xs">Default</span>
                          ) : null}
                        </span>
                        <span className="text-ink-500 block">{addressLine(address)}</span>
                      </span>
                    </label>
                  ))}

                  <label className="border-cream-300 flex cursor-pointer items-center gap-2.5 rounded-xl border bg-white p-3 text-sm">
                    <input
                      type="radio"
                      name="saved-address"
                      checked={selectedAddressId === 'new'}
                      onChange={() => {
                        setSelectedAddressId('new');
                        fillFromAddress(BLANK_ADDRESS);
                      }}
                      className="size-4 cursor-pointer"
                    />
                    Use a different address
                  </label>
                </div>
              ) : null}

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Recipient name" error={formState.errors.fullName?.message}>
                  <input
                    {...register('fullName', { required: 'Who should the courier ask for?' })}
                    className="field-input"
                    autoComplete="shipping name"
                  />
                </Field>

                <Field label="Province" error={formState.errors.province?.message}>
                  <select
                    {...register('province', {
                      required: 'Select a province',
                      // Clearing the district prevents a mismatched pair reaching the
                      // server, which validates that the district sits in the province.
                      onChange: () => setValue('district', ''),
                    })}
                    className="field-input"
                  >
                    <option value="">Choose…</option>
                    {provinces.map((entry) => (
                      <option key={entry.name} value={entry.name}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="District" error={formState.errors.district?.message}>
                  <select
                    {...register('district', { required: 'Select a district' })}
                    className="field-input"
                    disabled={!province}
                  >
                    <option value="">{province ? 'Choose…' : 'Pick a province first'}</option>
                    {districts.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Municipality / VDC" error={formState.errors.municipality?.message}>
                  <input
                    {...register('municipality', { required: 'Municipality is required' })}
                    className="field-input"
                  />
                </Field>

                <Field label="Ward no." error={formState.errors.wardNo?.message}>
                  <input
                    {...register('wardNo', {
                      required: 'Ward number is required',
                      min: { value: 1, message: 'Ward numbers start at 1' },
                      max: { value: 35, message: 'That ward number is too high' },
                    })}
                    type="number"
                    min={1}
                    max={35}
                    step={1}
                    className="field-input tnum"
                  />
                </Field>

                <Field label="Tole / area" error={formState.errors.tole?.message}>
                  <input
                    {...register('tole', { required: 'Tole or area is required' })}
                    className="field-input"
                    placeholder="Chabahil"
                  />
                </Field>

                <Field label="Landmark" hint="Optional, but it speeds up delivery.">
                  <input {...register('landmark')} className="field-input" placeholder="Near the temple gate" />
                </Field>

                <Field label="Alternate phone" hint="Optional.">
                  <input {...register('altPhone')} inputMode="numeric" className="field-input tnum" />
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Delivery instructions" hint="Optional.">
                    <textarea
                      {...register('deliveryInstructions')}
                      rows={2}
                      className="field-input"
                      placeholder="Call before arriving, gate is usually locked."
                    />
                  </Field>
                </div>
              </div>

              {isAuthenticated ? (
                <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={saveAddress}
                    onChange={(event) => setSaveAddress(event.target.checked)}
                    className="size-4 cursor-pointer"
                  />
                  Save this address to my account
                </label>
              ) : null}
            </fieldset>
          ) : null}

          {/* --- 3. Payment ------------------------------------------------- */}
          {step === 2 ? (
            <fieldset>
              <legend className="text-lg">How would you like to pay?</legend>
              <p className="text-ink-500 mt-1 text-sm">
                Online payments are verified by our server with the gateway before an order is
                marked paid.
              </p>

              <div className="mt-4 space-y-2">
                {gateways.includes('khalti') ? (
                  <MethodOption
                    value="khalti"
                    checked={method === 'khalti'}
                    onChange={setMethod}
                    icon="wallet"
                    title="Khalti"
                    description="Khalti wallet, mobile banking, connectIPS or a card."
                  />
                ) : null}

                {gateways.includes('esewa') ? (
                  <MethodOption
                    value="esewa"
                    checked={method === 'esewa'}
                    onChange={setMethod}
                    icon="wallet"
                    title="eSewa"
                    description="Pay from your eSewa balance or a linked bank."
                  />
                ) : null}

                {codConfig?.isEnabled ? (
                  <MethodOption
                    value="cod"
                    checked={method === 'cod'}
                    onChange={setMethod}
                    icon="truck"
                    title={codConfig.label || 'Cash on delivery'}
                    description={
                      codConfig.maxOrderAmount > 0
                        ? `Pay the courier in cash. Available up to ${formatPrice(codConfig.maxOrderAmount)}.`
                        : 'Pay the courier in cash when your order arrives.'
                    }
                    disabled={
                      (codConfig.maxOrderAmount > 0 && (pricing?.total ?? 0) > codConfig.maxOrderAmount) ||
                      quote?.delivery?.codAvailable === false
                    }
                    disabledReason={
                      quote?.delivery?.codAvailable === false
                        ? 'Not available for this district.'
                        : `This order is over the ${formatPrice(codConfig.maxOrderAmount)} cash limit.`
                    }
                  />
                ) : null}

                {!gateways.length && !codConfig?.isEnabled ? (
                  <p className="border-mustard-200 bg-mustard-50 text-mustard-900 rounded-xl border p-3 text-sm">
                    No payment method is available right now. Please{' '}
                    <Link to="/contact" className="underline">
                      get in touch
                    </Link>{' '}
                    and we will take your order directly.
                  </p>
                ) : null}
              </div>

              <div className="mt-4">
                <Field label="Anything we should know?" hint="Optional. Gift note, delivery timing, and so on.">
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value.slice(0, 500))}
                    rows={3}
                    className="field-input"
                  />
                </Field>
              </div>
            </fieldset>
          ) : null}

          {/* --- 4. Review -------------------------------------------------- */}
          {step === 3 ? (
            <div>
              <h2 className="text-lg">Check it over</h2>

              <dl className="mt-4 space-y-3 text-sm">
                <ReviewRow label="Contact" onEdit={() => setStep(0)}>
                  {watch('name')}
                  <span className="text-ink-500 block">
                    {watch('email')} · {watch('phone')}
                  </span>
                </ReviewRow>

                <ReviewRow label="Delivering to" onEdit={() => setStep(1)}>
                  {watch('fullName')}
                  <span className="text-ink-500 block">
                    {addressLine({
                      tole: watch('tole'),
                      street: watch('street'),
                      municipality: watch('municipality'),
                      wardNo: watch('wardNo'),
                      district: watch('district'),
                      province: watch('province'),
                    })}
                  </span>
                  {quote?.delivery ? (
                    <span className="text-ink-500 block">
                      {quote.delivery.zoneName}
                      {deliveryWindow(quote.delivery.estimatedDays)
                        ? ` · about ${deliveryWindow(quote.delivery.estimatedDays)}`
                        : ''}
                    </span>
                  ) : null}
                </ReviewRow>

                <ReviewRow label="Paying by" onEdit={() => setStep(2)}>
                  {method === 'cod'
                    ? codConfig?.label || 'Cash on delivery'
                    : method === 'khalti'
                      ? 'Khalti'
                      : method === 'esewa'
                        ? 'eSewa'
                        : '—'}
                  {method !== 'cod' ? (
                    <span className="text-ink-500 block">
                      You will be taken to the gateway to complete the payment.
                    </span>
                  ) : null}
                </ReviewRow>
              </dl>

              <ul className="divide-cream-200 border-cream-300 mt-4 divide-y rounded-xl border">
                {items.map((line) => (
                  <li key={`${line.productId}-${line.variantId}`} className="flex gap-3 p-3 text-sm">
                    <span className="bg-cream-200 size-12 shrink-0 overflow-hidden rounded-lg">
                      {line.image?.url ? (
                        <img
                          src={line.image.url}
                          alt={line.image.alt ?? line.name}
                          className="size-full object-cover"
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{line.name}</span>
                      <span className="text-ink-500 block text-xs">
                        {line.size} · {line.quantity} × {formatPrice(line.unitPrice)}
                      </span>
                    </span>
                    <span className="tnum font-medium">{formatPrice(line.lineTotal)}</span>
                  </li>
                ))}
              </ul>

              <p className="text-ink-400 mt-3 text-xs">
                Placing the order means you accept our{' '}
                <Link to="/terms" className="underline">
                  terms
                </Link>
                ,{' '}
                <Link to="/returns-policy" className="underline">
                  returns policy
                </Link>{' '}
                and{' '}
                <Link to="/privacy-policy" className="underline">
                  privacy policy
                </Link>
                .
              </p>
            </div>
          ) : null}

          {/* --- Step controls ---------------------------------------------- */}
          <div className="border-cream-300 mt-6 flex items-center justify-between gap-3 border-t pt-4">
            {step > 0 ? (
              <button type="button" onClick={() => setStep(step - 1)} className="btn-ghost btn-sm">
                <Icon name="arrowLeft" className="size-4" />
                Back
              </button>
            ) : (
              <Link to="/cart" className="btn-ghost btn-sm">
                <Icon name="arrowLeft" className="size-4" />
                Back to bag
              </Link>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                disabled={step === 2 && (!method || codBlocked)}
                className="btn-primary"
              >
                Continue
                <Icon name="arrowRight" className="size-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={placing || belowMinimum || !method || codBlocked}
                className="btn-primary btn-lg"
              >
                {placing ? <Spinner className="size-5" /> : <Icon name="checkCircle" className="size-5" />}
                {method === 'cod' ? 'Place the order' : `Pay ${formatPrice(pricing?.total ?? 0)}`}
              </button>
            )}
          </div>
        </div>

        {/* --- Summary ------------------------------------------------------- */}
        <aside className="mt-5 lg:sticky lg:top-24 lg:mt-0">
          <div className="card p-4">
            <h2 className="text-base">
              Order summary
              <span className="text-ink-400 ml-1.5 text-sm font-normal">
                {items.length} {items.length === 1 ? 'line' : 'lines'}
              </span>
            </h2>

            <dl className="border-cream-300 mt-3 space-y-2 border-t pt-3 text-sm">
              <SummaryRow
                label="Subtotal"
                value={formatPrice(pricing?.listSubtotal ?? pricing?.subtotal ?? 0)}
              />
              {pricing?.itemDiscount > 0 ? (
                <SummaryRow label="Product offers" value={`− ${formatPrice(pricing.itemDiscount)}`} tone="leaf" />
              ) : null}
              {pricing?.couponDiscount > 0 ? (
                <SummaryRow
                  label={`Coupon ${coupon?.code ?? ''}`}
                  value={`− ${formatPrice(pricing.couponDiscount)}`}
                  tone="leaf"
                />
              ) : null}
              <SummaryRow
                label="Delivery"
                value={
                  quote?.delivery
                    ? quote.delivery.isFree
                      ? 'Free'
                      : formatPrice(pricing.deliveryCharge)
                    : 'Choose a district'
                }
                muted={!quote?.delivery}
              />
              {pricing?.taxAmount > 0 ? (
                <SummaryRow
                  label={`${context.data?.taxLabel ?? 'VAT'} (${pricing.taxRate}%)`}
                  value={formatPrice(pricing.taxAmount)}
                />
              ) : null}

              <div className="border-cream-300 flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">Total</dt>
                <dd className="tnum text-lg font-semibold">{formatPrice(pricing?.total ?? 0)}</dd>
              </div>
            </dl>

            {belowMinimum ? (
              <p className="mt-3 text-sm text-red-700">
                Minimum order is {formatPrice(minOrder)}.{' '}
                <Link to="/cart" className="underline">
                  Add a little more
                </Link>
                .
              </p>
            ) : null}

            {codBlocked ? (
              <p className="text-mustard-900 mt-3 text-sm">
                Cash on delivery is not available for this order. Choose Khalti or eSewa.
              </p>
            ) : null}

            <p className="text-ink-400 mt-3 flex items-start gap-1.5 text-xs">
              <Icon name="info" className="mt-0.5 size-3.5 shrink-0" />
              Every amount here was calculated by our server from the live catalogue, and is
              recalculated once more when the order is placed.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

/**
 * Server error paths are dotted (`shippingAddress.district`, `customer.email`) while
 * this form's inputs are flat, so handing them to `applyFieldErrors` unchanged would
 * attach each message to a field that does not exist and highlight nothing. Paths are
 * stripped back to their input name and anything with no input - `paymentMethod`,
 * `items` - is left for the toast instead of vanishing.
 */
function mapServerErrors(errors) {
  if (!errors || typeof errors !== 'object') return [];
  const known = new Set([...CONTACT_FIELDS, ...ADDRESS_FIELDS]);
  return Object.entries(errors)
    .map(([path, message]) => ({
      field: path.replace(/^(?:shippingAddress|customer)\./, ''),
      message: String(message),
    }))
    .filter((entry) => known.has(entry.field));
}

/**
 * A zone's delivery estimate as text. The quote sends a `{min, max}` window rather than a
 * single number, so the pair has to be flattened here - dropping the object straight into
 * JSX throws "Objects are not valid as a React child" and takes the whole step down.
 */
function deliveryWindow(estimatedDays) {
  const min = Number(estimatedDays?.min) || 0;
  const max = Number(estimatedDays?.max) || 0;
  if (!min && !max) return '';
  if (!min || !max || min === max) {
    const days = min || max;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${min}-${max} days`;
}

function Field({ label, error, hint, children }) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  );
}

function MethodOption({ value, checked, onChange, icon, title, description, disabled, disabledReason }) {
  return (
    <label
      className={`flex gap-3 rounded-xl border p-3 ${
        disabled
          ? 'border-cream-300 cursor-not-allowed bg-cream-50 opacity-70'
          : checked
            ? 'border-brand-400 bg-brand-50 cursor-pointer'
            : 'border-cream-300 cursor-pointer bg-white'
      }`}
    >
      <input
        type="radio"
        name="payment-method"
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => onChange(value)}
        className="mt-0.5 size-4 cursor-pointer"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon name={icon} className="text-ink-500 size-4" />
          {title}
        </span>
        <span className="text-ink-500 mt-0.5 block text-xs">{description}</span>
        {disabled && disabledReason ? (
          <span className="text-mustard-800 mt-0.5 block text-xs">{disabledReason}</span>
        ) : null}
      </span>
    </label>
  );
}

function ReviewRow({ label, onEdit, children }) {
  return (
    <div className="border-cream-300 flex items-start justify-between gap-3 rounded-xl border p-3">
      <div className="min-w-0">
        <dt className="text-ink-400 text-xs">{label}</dt>
        <dd className="mt-0.5 font-medium">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="text-brand-700 shrink-0 text-xs underline">
        Change
      </button>
    </div>
  );
}

function SummaryRow({ label, value, tone, muted }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={muted ? 'text-ink-400' : 'text-ink-600'}>{label}</dt>
      <dd
        className={`tnum ${
          tone === 'leaf' ? 'text-leaf-700' : muted ? 'text-ink-400 text-xs' : 'text-ink-800'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
