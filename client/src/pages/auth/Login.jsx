import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AuthCard, { FormError, PasswordField } from '../../components/auth/AuthCard';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { apiError, applyFieldErrors } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Customer sign-in.
 *
 * One field for email *or* phone, because that is how people think about signing in to a
 * Nepali storefront - the server works out which it received. The field names match
 * `loginSchema` exactly (`identifier`, `password`) so a 422 lands on the right input.
 *
 * The guest cart rides along in the request. `CartContext` also merges on the signed-out
 * to signed-in transition, and `mergeGuestCart` takes the larger of the two quantities
 * rather than adding them, so doing it here as well is safe and means the cart survives
 * even if the customer navigates away before that effect runs.
 */
export default function Login() {
  const { login } = useAuth();
  const { guestItems } = useCart();
  const navigate = useNavigate();
  const location = useLocation();

  const [formError, setFormError] = useState('');
  const [shown, setShown] = useState(false);

  useSeo({
    title: 'Sign in',
    description: 'Sign in to your Deeva Achar account to track orders and check out faster.',
    canonical: '/login',
    noIndex: true,
  });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched', defaultValues: { identifier: '', password: '' } });

  // Where a guard sent them from, so sign-in returns them to it rather than to /account.
  const from = location.state?.from?.pathname;

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await login({
        identifier: values.identifier.trim(),
        password: values.password,
        ...(guestItems.length ? { cart: guestItems } : {}),
      });
      navigate(from || '/account', { replace: true });
    } catch (error) {
      // A field error goes on the field. Everything else - wrong password, a deactivated
      // account, the rate limiter - is a form-level message, because the server
      // deliberately does not say *which* half of the pair was wrong.
      if (!applyFieldErrors(error, setError)) setFormError(apiError(error).message);
    }
  };

  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to track your orders and check out faster."
      footer={
        <>
          <p className="text-ink-500">
            New here?{' '}
            <Link
              to="/register"
              state={location.state}
              className="text-brand-700 font-medium hover:underline"
            >
              Create an account
            </Link>
          </p>
          <p className="text-ink-400 mt-2 text-xs">
            You do not need an account to order -{' '}
            <Link to="/cart" className="underline">
              check out as a guest
            </Link>
            .
          </p>
        </>
      }
    >
      {from ? (
        <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mb-4 rounded-lg border px-3 py-2.5 text-sm">
          Sign in to carry on where you left off.
        </p>
      ) : null}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError>{formError}</FormError>

        <div>
          <label htmlFor="identifier" className="field-label">
            Email or phone
          </label>
          <input
            id="identifier"
            type="text"
            inputMode="email"
            autoComplete="username"
            autoFocus
            aria-invalid={errors.identifier ? 'true' : undefined}
            className="field-input"
            placeholder="you@example.com or 98XXXXXXXX"
            {...register('identifier', { required: 'Enter your email or phone number' })}
          />
          {errors.identifier ? <p className="field-error">{errors.identifier.message}</p> : null}
        </div>

        <PasswordField
          id="password"
          label="Password"
          shown={shown}
          onToggle={() => setShown((value) => !value)}
          error={errors.password}
          registration={register('password', { required: 'Enter your password' })}
        />

        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-brand-700 text-sm hover:underline">
            Forgot your password?
          </Link>
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? <Spinner className="size-4" /> : <Icon name="user" className="size-4" />}
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthCard>
  );
}
