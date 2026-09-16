import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import Spinner from '../components/ui/Spinner';
import useSeo from '../hooks/useSeo';

/**
 * The eSewa hand-off.
 *
 * eSewa's ePay v2 does not take a redirect: it needs a real browser form POST carrying
 * `signed_field_names` and the `signature` the server computed with the secret key. This
 * page exists only to perform that POST, which is why `App.jsx` mounts it outside every
 * layout - a header would render for one frame and then be gone.
 *
 * Nothing here is trusted or trustworthy. The fields are opaque strings from
 * `POST /api/payments/initiate`; editing them in devtools invalidates the signature and
 * eSewa rejects the transaction. Whatever eSewa reports afterwards goes to
 * `/api/payments/esewa/callback`, which verifies with eSewa directly before any order
 * changes state. This file cannot mark anything paid.
 *
 * Submission is automatic but there is a visible fallback button, because an auto-submit
 * that is blocked (an aggressive extension, JS disabled mid-flow) otherwise leaves the
 * customer on a blank page with a pending order.
 */
export default function PaymentRedirect() {
  const location = useLocation();
  const navigate = useNavigate();
  const formRef = useRef(null);
  const submitted = useRef(false);
  const [stalled, setStalled] = useState(false);

  const { formUrl, fields, orderNumber, gateway } = location.state ?? {};

  useSeo({ title: 'Redirecting to payment', noIndex: true });

  useEffect(() => {
    // Arriving here directly - a refresh, a bookmark, a back button - means there is no
    // form to submit. Send them somewhere they can act instead of showing a dead page.
    if (!formUrl || !fields) {
      navigate(orderNumber ? `/order-success/${orderNumber}` : '/cart', { replace: true });
      return;
    }

    if (submitted.current) return;
    submitted.current = true;

    // One tick, so the "taking you to eSewa" copy paints before the navigation. Without
    // it a fast connection shows a white flash and nothing else.
    const submitTimer = setTimeout(() => formRef.current?.submit(), 60);

    // If we are still here after four seconds the POST did not happen.
    const stallTimer = setTimeout(() => setStalled(true), 4000);

    return () => {
      clearTimeout(submitTimer);
      clearTimeout(stallTimer);
    };
  }, [formUrl, fields, orderNumber, navigate]);

  if (!formUrl || !fields) return null;

  const label = gateway === 'esewa' ? 'eSewa' : 'the payment gateway';

  return (
    <main className="bg-cream-100 grid min-h-dvh place-items-center px-4">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="bg-brand-50 mx-auto grid size-14 place-items-center rounded-full">
          <Icon name="wallet" className="text-brand-600 size-7" />
        </span>

        <h1 className="mt-4 text-xl">Taking you to {label}</h1>
        <p className="text-ink-500 mt-1.5 text-sm">
          {orderNumber ? (
            <>
              Order <span className="tnum font-medium">{orderNumber}</span> is reserved. Do not
              close this tab.
            </>
          ) : (
            'Do not close this tab.'
          )}
        </p>

        {!stalled ? (
          <Spinner label="Redirecting" className="text-brand-600 mx-auto mt-5 size-7" />
        ) : (
          <p className="text-mustard-900 mt-5 text-sm">
            This is taking longer than it should. Use the button below to continue.
          </p>
        )}

        {/*
          `fields` is rendered exactly as the server produced it. The signature covers
          `total_amount`, `transaction_uuid` and `product_code`, so a tampered value is
          rejected by eSewa rather than accepted at a price the customer chose.
        */}
        <form ref={formRef} action={formUrl} method="POST" className="mt-5">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={String(value ?? '')} readOnly />
          ))}
          <button type="submit" className={stalled ? 'btn-primary' : 'btn-outline btn-sm'}>
            Continue to {label}
            <Icon name="external" className="size-4" />
          </button>
        </form>

        <p className="text-ink-400 mt-4 text-xs">
          Payment is confirmed by our server with {label} before your order is marked paid.
        </p>

        {orderNumber ? (
          <Link to={`/order-success/${orderNumber}`} className="text-ink-500 mt-3 inline-block text-xs underline">
            Check this order instead
          </Link>
        ) : null}
      </div>
    </main>
  );
}
