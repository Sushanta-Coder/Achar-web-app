import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard, { FormError, PasswordField } from '../../components/auth/AuthCard';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { apiError, applyFieldErrors, get } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Account signup.
 *
 * Field names mirror `registerSchema` (`name`, `email`, `phone`, `password`,
 * `marketingOptIn`, `cart`) so server-side field errors attach to the right inputs.
 *
 * Two things worth noting:
 *
 *  - Phone is optional here but required at checkout. Asking for it now is a courtesy,
 *    not a gate; a signup form with four required fields loses people.
 *  - The strength meter measures length and variety and *does not block submission*.
 *    The server's only rule is eight characters, deliberately - composition rules push
 *    people towards `Password1!`. The meter encourages, it does not enforce, and this
 *    page does not invent a stricter rule than the API it posts to.
 */
export default function Register() {
  const { register: createAccount } = useAuth();
  const { guestItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [formError, setFormError] = useState('');
  const [shown, setShown] = useState(false);
  /** `{ email: true, phone: false }` - what the API said about each, or undefined. */
  const [taken, setTaken] = useState({});

  useSeo({
    title: 'Create an account',
    description:
      'Create an Deeva Achar account to track orders, save addresses and check out faster.',
    canonical: '/register',
    noIndex: true,
  });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    mode: 'onTouched',
    defaultValues: { name: '', email: '', phone: '', password: '', marketingOptIn: false },
  });

  const password = watch('password') ?? '';
  const strength = passwordStrength(password);

  /**
   * Checks an address or number the moment the field loses focus, so "that email is
   * already registered" arrives before the customer has filled in a password. The
   * endpoint is read-only, rate-limited and answers a boolean; a failure here is
   * ignored, because the real check happens on submit either way.
   */
  const checkAvailability = async (field, value) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return;
    try {
      const data = await get('/auth/availability', { [field]: trimmed });
      setTaken((current) => ({ ...current, [field]: data?.[field] === false }));
    } catch {
      setTaken((current) => ({ ...current, [field]: undefined }));
    }
  };

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await createAccount({
        name: values.name.trim(),
        email: values.email.trim(),
        // An empty string would fail `nepaliPhone`; omit the key instead.
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        password: values.password,
        marketingOptIn: values.marketingOptIn,
        ...(guestItems.length ? { cart: guestItems } : {}),
      });
      navigate(location.state?.from?.pathname || '/account', { replace: true });
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(apiError(error).message);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      description="Save your addresses, follow your orders and reorder your favourites in a tap."
      footer={
        <p className="text-ink-500">
          Already have an account?{' '}
          <Link
            to="/login"
            state={location.state}
            className="text-brand-700 font-medium hover:underline"
          >
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError>{formError}</FormError>

        <div>
          <label htmlFor="name" className="field-label">
            Full name
          </label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            autoFocus
            aria-invalid={errors.name ? 'true' : undefined}
            className="field-input"
            {...register('name', {
              required: 'Please tell us your name',
              maxLength: { value: 80, message: 'That is a little too long' },
            })}
          />
          {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
        </div>

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={errors.email ? 'true' : undefined}
            className="field-input"
            {...register('email', {
              required: 'We need an email for your receipts',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Check that email address' },
              onBlur: (event) => checkAvailability('email', event.target.value),
            })}
          />
          {errors.email ? (
            <p className="field-error">{errors.email.message}</p>
          ) : taken.email ? (
            <p className="field-error">
              That email already has an account.{' '}
              <Link to="/login" className="underline">
                Sign in instead
              </Link>
              .
            </p>
          ) : (
            <p className="field-hint">Order confirmations and receipts go here.</p>
          )}
        </div>

        <div>
          <label htmlFor="phone" className="field-label">
            Mobile <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="98XXXXXXXX"
            aria-invalid={errors.phone ? 'true' : undefined}
            className="field-input tnum"
            {...register('phone', {
              pattern: { value: /^(?:\+?977)?0?9[678]\d{8}$/, message: 'Enter a Nepali mobile number' },
              onBlur: (event) => checkAvailability('phone', event.target.value),
            })}
          />
          {errors.phone ? (
            <p className="field-error">{errors.phone.message}</p>
          ) : taken.phone ? (
            <p className="field-error">That number is already registered.</p>
          ) : (
            <p className="field-hint">We only call about your deliveries.</p>
          )}
        </div>

        <div>
          <PasswordField
            id="password"
            label="Password"
            autoComplete="new-password"
            shown={shown}
            onToggle={() => setShown((value) => !value)}
            error={errors.password}
            registration={register('password', {
              required: 'Choose a password',
              minLength: { value: 8, message: 'Use at least 8 characters' },
            })}
          />
          {password ? <StrengthMeter strength={strength} /> : null}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4" {...register('marketingOptIn')} />
          <span className="text-ink-600">
            Email me when a new season&apos;s achar is ready. No more than once a month.
          </span>
        </label>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? <Spinner className="size-4" /> : <Icon name="user" className="size-4" />}
          {isSubmitting ? 'Creating your account…' : 'Create account'}
        </button>

        <p className="text-ink-400 text-center text-xs">
          By continuing you agree to our{' '}
          <Link to="/terms" className="underline">
            terms
          </Link>{' '}
          and{' '}
          <Link to="/privacy-policy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthCard>
  );
}

/**
 * Length first, variety second - in that order, because length is the property that
 * actually resists a guess. Four bands, no score shown: a number invites gaming.
 */
function passwordStrength(value) {
  if (!value) return 0;
  const variety =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/\d/.test(value)) +
    Number(/[^A-Za-z0-9]/.test(value));

  if (value.length < 8) return 1;
  if (value.length >= 14 || (value.length >= 11 && variety >= 3)) return 4;
  if (value.length >= 11 || variety >= 3) return 3;
  return 2;
}

const STRENGTH = [
  { label: '', bar: '', text: '' },
  { label: 'Too short', bar: 'bg-red-500', text: 'text-red-700' },
  { label: 'Workable', bar: 'bg-mustard-500', text: 'text-mustard-900' },
  { label: 'Good', bar: 'bg-leaf-500', text: 'text-leaf-700' },
  { label: 'Strong', bar: 'bg-leaf-600', text: 'text-leaf-700' },
];

function StrengthMeter({ strength }) {
  const band = STRENGTH[strength];
  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`h-1 flex-1 rounded-full ${step <= strength ? band.bar : 'bg-cream-300'}`}
          />
        ))}
      </div>
      <p className={`mt-1 text-xs ${band.text}`} aria-live="polite">
        {band.label}
        {strength === 1 ? ' — 8 characters minimum' : ''}
        {strength === 2 ? ' — a longer phrase is much harder to guess' : ''}
      </p>
    </div>
  );
}
