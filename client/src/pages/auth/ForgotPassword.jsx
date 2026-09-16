import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import AuthCard, { FormError } from '../../components/auth/AuthCard';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import { apiError, applyFieldErrors, post } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Request a password reset link.
 *
 * The API answers identically whether or not the address is registered - that is what
 * stops this form being used to enumerate customers - so this page must not imply
 * otherwise. The confirmation deliberately says "if that email is registered". A page
 * that said "sent!" for a known address and "not found" for an unknown one would hand
 * over the customer list one guess at a time.
 *
 * Note that the reset email is sent server-side and the token never comes back in this
 * response, so there is nothing here to leak.
 */
export default function ForgotPassword() {
  const [sentTo, setSentTo] = useState('');
  const [formError, setFormError] = useState('');

  useSeo({ title: 'Reset your password', canonical: '/forgot-password', noIndex: true });

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched', defaultValues: { email: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      const email = values.email.trim();
      await post('/auth/forgot-password', { email });
      setSentTo(email);
    } catch (error) {
      // The likely failure is the rate limiter, which is a form-level message.
      if (!applyFieldErrors(error, setError)) setFormError(apiError(error).message);
    }
  };

  if (sentTo) {
    return (
      <AuthCard
        title="Check your inbox"
        footer={
          <Link to="/login" className="text-brand-700 font-medium hover:underline">
            Back to sign in
          </Link>
        }
      >
        <div className="text-center">
          <span className="bg-leaf-100 mx-auto grid size-14 place-items-center rounded-full">
            <Icon name="mail" className="text-leaf-700 size-7" />
          </span>
          <p className="text-ink-600 mt-4 text-sm">
            If <span className="font-medium">{sentTo}</span> is registered with us, a reset link
            is on its way. It expires in 30 minutes and works once.
          </p>
          <p className="text-ink-400 mt-3 text-xs">
            Nothing after a few minutes? Check your spam folder, and make sure that is the
            address you signed up with.
          </p>
          <button
            type="button"
            onClick={() => setSentTo('')}
            className="btn-ghost btn-sm mt-4"
          >
            Try a different email
          </button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      description="Give us the email on your account and we will send you a link to set a new one."
      footer={
        <p className="text-ink-500">
          Remembered it?{' '}
          <Link to="/login" className="text-brand-700 font-medium hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError>{formError}</FormError>

        <div>
          <label htmlFor="email" className="field-label">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            autoFocus
            aria-invalid={errors.email ? 'true' : undefined}
            className="field-input"
            {...register('email', {
              required: 'Enter the email on your account',
              pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Check that email address' },
            })}
          />
          {errors.email ? <p className="field-error">{errors.email.message}</p> : null}
        </div>

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? <Spinner className="size-4" /> : <Icon name="mail" className="size-4" />}
          {isSubmitting ? 'Sending…' : 'Send the reset link'}
        </button>

        <p className="text-ink-400 text-center text-xs">
          Signed up with a phone number and no email? Call us and we will sort it out.
        </p>
      </form>
    </AuthCard>
  );
}
