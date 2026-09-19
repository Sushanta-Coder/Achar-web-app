import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import Spinner from '../../components/ui/Spinner';
import { useAuth } from '../../context/AuthContext';
import { applyFieldErrors } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Staff sign-in.
 *
 * A separate page from the customer login for two reasons. It posts to
 * `/auth/admin/login`, which rejects a customer account outright rather than signing
 * them in and then bouncing them off /admin; and it takes an email only, where the
 * storefront accepts an email *or* a phone number.
 *
 * `noIndex` because a login form for the back office has no business in a search index.
 */
export default function AdminLogin() {
  const { adminLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useSeo({ title: 'Staff sign in', noIndex: true });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await adminLogin(values);
      navigate(location.state?.from?.pathname ?? '/admin', { replace: true });
    } catch (error) {
      // Field errors go on the field; everything else (bad credentials, locked
      // account, rate limit) is a form-level message.
      if (!applyFieldErrors(error, setError)) {
        setFormError(error?.normalised?.message ?? 'Could not sign you in.');
      }
    }
  };

  return (
    <div className="bg-ink-900 flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="bg-brand-700 mb-3 grid size-12 place-items-center rounded-xl text-white">
            <Icon name="flame" className="size-6" />
          </span>
          <h1 className="font-display text-xl font-bold text-white">Deeva Achar admin</h1>
          <p className="mt-1 text-sm text-cream-400">Sign in to manage the shop</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-5" noValidate>
          {formError ? (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {formError}
            </p>
          ) : null}

          <div>
            <label htmlFor="email" className="field-label">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? 'true' : undefined}
              className="field-input"
              {...register('email', { required: 'Enter your email address' })}
            />
            {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
          </div>

          <div>
            <label htmlFor="password" className="field-label">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                aria-invalid={errors.password ? 'true' : undefined}
                className="field-input pr-11"
                {...register('password', { required: 'Enter your password' })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="text-ink-400 hover:text-ink-700 absolute top-1/2 right-2 grid size-8 -translate-y-1/2 cursor-pointer place-items-center rounded"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <Icon name="eye" className="size-4" />
              </button>
            </div>
            {errors.password ? <p className="field-error">{errors.password.message}</p> : null}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isSubmitting ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="text-ink-400 text-center text-xs">
            Customer account?{' '}
            <Link to="/login" className="text-brand-700 font-medium hover:underline">
              Sign in here
            </Link>
          </p>
        </form>

        <p className="mt-5 text-center text-xs text-cream-400">
          <Link to="/" className="hover:text-white">
            ← Back to the storefront
          </Link>
        </p>
      </div>
    </div>
  );
}
