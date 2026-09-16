import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import AuthCard, { FormError, PasswordField } from '../../components/auth/AuthCard';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import { useToast } from '../../context/ToastContext';
import { apiError, applyFieldErrors, post } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Set a new password from an emailed link.
 *
 * The link is `/reset-password?token=…&email=…`, exactly as `notifyPasswordReset` builds
 * it, and the API needs both: the token is matched against a *hash* stored on the user
 * document, scoped to that address. Neither value is trusted here - this page only
 * carries them to `POST /auth/reset-password`, which is where an expired or already-used
 * token is rejected.
 *
 * A successful reset bumps `tokenVersion` server-side and clears the auth cookies, so
 * every other session is signed out. That is intentional: a reset is often the response
 * to a compromise, and it is why this page sends the customer to sign in afterwards
 * rather than dropping them into their account.
 */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();

  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [formError, setFormError] = useState('');
  const [shown, setShown] = useState(false);

  useSeo({ title: 'Choose a new password', noIndex: true });

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ mode: 'onTouched', defaultValues: { password: '', confirm: '' } });

  const onSubmit = async (values) => {
    setFormError('');
    try {
      await post('/auth/reset-password', { email, token, password: values.password });
      toast.success('Password changed. Please sign in.');
      navigate('/login', { replace: true });
    } catch (error) {
      if (!applyFieldErrors(error, setError)) setFormError(apiError(error).message);
    }
  };

  // A link that arrived without both halves cannot be completed, and there is nothing
  // useful to submit - so say so here rather than after a round trip.
  if (!token || !email) {
    return (
      <AuthCard
        title="That link is incomplete"
        footer={
          <Link to="/forgot-password" className="text-brand-700 font-medium hover:underline">
            Request a new link
          </Link>
        }
      >
        <div className="text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-red-100">
            <Icon name="alert" className="size-7 text-red-700" />
          </span>
          <p className="text-ink-600 mt-4 text-sm">
            Some email apps break long links across lines. Copy the whole thing from the email,
            or just ask for a fresh one - it only takes a moment.
          </p>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Choose a new password"
      description={`For ${email}`}
      footer={
        <p className="text-ink-500">
          Changed your mind?{' '}
          <Link to="/login" className="text-brand-700 font-medium hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormError>{formError}</FormError>

        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          autoFocus
          shown={shown}
          onToggle={() => setShown((value) => !value)}
          error={errors.password}
          hint="At least 8 characters. A short phrase beats a clever word."
          registration={register('password', {
            required: 'Choose a new password',
            minLength: { value: 8, message: 'Use at least 8 characters' },
          })}
        />

        <PasswordField
          id="confirm"
          label="Confirm new password"
          autoComplete="new-password"
          shown={shown}
          onToggle={() => setShown((value) => !value)}
          error={errors.confirm}
          registration={register('confirm', {
            required: 'Type it once more',
            // Compared here only. The API takes one password field; a mismatch is a
            // typo to catch before it becomes a password nobody knows.
            validate: (value) => value === watch('password') || 'These do not match',
          })}
        />

        <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
          {isSubmitting ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
          {isSubmitting ? 'Saving…' : 'Save new password'}
        </button>

        <p className="text-ink-400 text-center text-xs">
          Doing this signs you out everywhere else.
        </p>
      </form>
    </AuthCard>
  );
}
