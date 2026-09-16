import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { PasswordField } from '../../components/auth/AuthCard';
import Icon from '../../components/ui/Icon';
import Spinner from '../../components/ui/Spinner';
import { Modal, Panel } from '../../components/admin/AdminPage';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../context/CartContext';
import { useSettings } from '../../context/SettingsContext';
import { useToast } from '../../context/ToastContext';
import { apiError, applyFieldErrors, patch, post } from '../../lib/apiClient';

/**
 * Profile, password and the two destructive buttons.
 *
 * `user` comes from `AuthContext` rather than a fetch - it is already loaded and already
 * kept fresh. A successful save merges the response into the context with `patchUser`, so
 * the header greeting and the account sidebar update without a second round trip.
 *
 * The email address has no edit control on purpose: there is no endpoint for it. Changing
 * a login identifier needs a confirm-at-the-new-address flow to avoid locking someone out
 * of their own account, and inventing half of that here would be worse than not offering
 * it. The field is shown, disabled, with the reason.
 *
 * Both irreversible actions live at the bottom behind their own confirmation. Changing the
 * password keeps *this* session and signs out every other device - the server bumps
 * `tokenVersion` and re-issues cookies for the caller - so this page says so instead of
 * letting it surprise someone.
 */
export default function Profile() {
  const { user, patchUser, logoutEverywhere } = useAuth();
  const { setLocale } = useSettings();
  const { clear } = useCart();
  const toast = useToast();
  const navigate = useNavigate();

  const [signingOutAll, setSigningOutAll] = useState(false);
  const [closing, setClosing] = useState(false);

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Profile</h1>
      <p className="text-ink-500 mt-1 text-sm">Your details, your password, and the exit door.</p>

      <div className="mt-5 space-y-4">
        <DetailsForm
          user={user}
          onSaved={(updated) => {
            patchUser(updated);
            // Keep the interface language in step with the saved preference.
            if (updated.locale) setLocale(updated.locale);
            toast.success('Profile updated');
          }}
        />

        <PasswordForm onSaved={() => toast.success('Password updated on this device')} />

        {/* --- Sessions ------------------------------------------------------ */}
        <Panel title="Signed-in devices" bodyClassName="p-4">
          <p className="text-ink-600 text-sm">
            If you have signed in on a shared or lost phone, this ends every session
            including this one. You will need to sign in again.
          </p>
          <button
            type="button"
            className="btn-outline btn-sm mt-3"
            disabled={signingOutAll}
            onClick={async () => {
              setSigningOutAll(true);
              try {
                await logoutEverywhere();
                await clear().catch(() => {});
                navigate('/login', { replace: true });
              } catch (caught) {
                toast.error(apiError(caught).message);
                setSigningOutAll(false);
              }
            }}
          >
            {signingOutAll ? <Spinner className="size-4" /> : <Icon name="logout" className="size-4" />}
            Sign out everywhere
          </button>
        </Panel>

        {/* --- Closure ------------------------------------------------------- */}
        <Panel title="Close your account" bodyClassName="p-4">
          <p className="text-ink-600 text-sm">
            We anonymise your details and sign you out. Past orders stay in our books
            without your name attached — Nepali tax rules require us to keep the invoice,
            not the customer.
          </p>
          <p className="text-ink-400 mt-2 text-xs">
            You cannot close an account with an order still on its way. Wait for it to
            arrive, or cancel it first.
          </p>
          <button
            type="button"
            onClick={() => setClosing(true)}
            className="btn-ghost btn-sm mt-3 text-red-700"
          >
            Close my account
          </button>
        </Panel>
      </div>

      <CloseAccountModal
        open={closing}
        onClose={() => setClosing(false)}
        onClosed={async () => {
          await clear().catch(() => {});
          toast.info('Your account has been closed. Thank you for shopping with us.');
          navigate('/', { replace: true });
        }}
      />
    </div>
  );
}

// --- Details -----------------------------------------------------------------

function DetailsForm({ user, onSaved }) {
  const { register, handleSubmit, setError, reset, formState } = useForm({
    defaultValues: {
      name: user.name ?? '',
      phone: user.phone ?? '',
      locale: user.locale ?? 'en',
      marketingOptIn: Boolean(user.marketingOptIn),
    },
  });
  const [formError, setFormError] = useState('');

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      /*
        Every field is optional server-side, so an empty phone must be omitted rather
        than sent as '' - `nepaliPhone` would reject the empty string and the customer
        would be told their (blank, optional) number is invalid.
      */
      const data = await patch('/users/me', {
        name: values.name.trim(),
        ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
        locale: values.locale,
        marketingOptIn: values.marketingOptIn,
      });
      onSaved(data.user);
      reset({
        name: data.user.name ?? '',
        phone: data.user.phone ?? '',
        locale: data.user.locale ?? 'en',
        marketingOptIn: Boolean(data.user.marketingOptIn),
      });
    } catch (caught) {
      // A 409 on the phone number is the interesting case: it belongs to another account.
      if (!applyFieldErrors(caught, setError)) {
        const normalised = apiError(caught);
        if (normalised.status === 409) {
          setError('phone', { type: 'server', message: normalised.message });
        } else {
          setFormError(normalised.message);
        }
      }
    }
  });

  return (
    <Panel title="Your details" bodyClassName="p-4">
      <form onSubmit={submit} noValidate>
        {formError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {formError}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Name</span>
            <input
              {...register('name', { required: 'Your name is required' })}
              className="field-input"
              autoComplete="name"
            />
            {formState.errors.name ? (
              <span className="field-error">{formState.errors.name.message}</span>
            ) : null}
          </label>

          <label className="block">
            <span className="field-label">Email</span>
            <input value={user.email} disabled readOnly className="field-input" />
            <span className="field-hint">
              {user.emailVerified
                ? 'Confirmed. Get in touch if you need this changed.'
                : 'Not confirmed yet — check for our verification link.'}
            </span>
          </label>

          <label className="block">
            <span className="field-label">Mobile</span>
            <input
              {...register('phone')}
              className="field-input tnum"
              inputMode="numeric"
              autoComplete="tel"
              placeholder="98XXXXXXXX"
            />
            {formState.errors.phone ? (
              <span className="field-error">{formState.errors.phone.message}</span>
            ) : (
              <span className="field-hint">Required at checkout, so worth saving now.</span>
            )}
          </label>

          <label className="block">
            <span className="field-label">Language</span>
            <select {...register('locale')} className="field-input">
              <option value="en">English</option>
              <option value="np">नेपाली</option>
            </select>
            <span className="field-hint">Product names and descriptions, where we have both.</span>
          </label>
        </div>

        <label className="mt-3 flex items-start gap-2.5 text-sm">
          <input type="checkbox" {...register('marketingOptIn')} className="mt-0.5 size-4 shrink-0" />
          <span className="text-ink-600">
            Email me when there is a new pickle or an offer.
            <span className="text-ink-400 block text-xs">
              Order updates and receipts are sent either way — those are not marketing.
            </span>
          </span>
        </label>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            className="btn-primary btn-sm"
            disabled={formState.isSubmitting || !formState.isDirty}
          >
            {formState.isSubmitting ? <Spinner className="size-4" /> : null}
            Save changes
          </button>
          {formState.isDirty ? (
            <span className="text-ink-400 text-xs">Unsaved changes</span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}

// --- Password ----------------------------------------------------------------

function PasswordForm({ onSaved }) {
  const { register, handleSubmit, watch, setError, reset, formState } = useForm({
    defaultValues: { currentPassword: '', password: '', confirm: '' },
  });
  const [formError, setFormError] = useState('');
  const [shown, setShown] = useState(false);

  const submit = handleSubmit(async (values) => {
    setFormError('');
    try {
      // `confirm` never leaves the browser - the API takes one new password, and the
      // second box is only here to catch a typo before it becomes a lockout.
      await post('/auth/change-password', {
        currentPassword: values.currentPassword,
        password: values.password,
      });
      reset({ currentPassword: '', password: '', confirm: '' });
      onSaved();
    } catch (caught) {
      // The server names the offending field for both "wrong current password" and
      // "same as the old one", so this maps straight onto the inputs.
      if (!applyFieldErrors(caught, setError)) setFormError(apiError(caught).message);
    }
  });

  return (
    <Panel title="Password" bodyClassName="p-4">
      <form onSubmit={submit} noValidate className="max-w-md">
        {formError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {formError}
          </p>
        ) : null}

        <div className="space-y-3">
          <PasswordField
            id="currentPassword"
            label="Current password"
            autoComplete="current-password"
            registration={register('currentPassword', { required: 'Enter your current password' })}
            error={formState.errors.currentPassword}
            shown={shown}
            onToggle={() => setShown((value) => !value)}
          />

          <PasswordField
            id="newPassword"
            label="New password"
            autoComplete="new-password"
            hint="At least 8 characters. A short phrase beats a clever word."
            registration={register('password', {
              required: 'Choose a new password',
              minLength: { value: 8, message: 'At least 8 characters' },
              maxLength: { value: 128, message: 'That is longer than 128 characters' },
            })}
            error={formState.errors.password}
            shown={shown}
            onToggle={() => setShown((value) => !value)}
          />

          <PasswordField
            id="confirmPassword"
            label="New password again"
            autoComplete="new-password"
            registration={register('confirm', {
              validate: (value) => value === watch('password') || 'These do not match',
            })}
            error={formState.errors.confirm}
            shown={shown}
            onToggle={() => setShown((value) => !value)}
          />
        </div>

        <p className="text-ink-400 mt-3 text-xs">
          You stay signed in here. Every other device is signed out.
        </p>

        <button type="submit" className="btn-primary btn-sm mt-3" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Spinner className="size-4" /> : null}
          Update password
        </button>
      </form>
    </Panel>
  );
}

// --- Closure -----------------------------------------------------------------

function CloseAccountModal({ open, onClose, onClosed }) {
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      // Password-confirmed server-side and rate-limited. The response clears the auth
      // cookies, so there is no session left to tidy up here.
      await post('/users/me/delete', { password, reason: reason.trim() || undefined });
      onClosed();
    } catch (caught) {
      setError(apiError(caught).message);
      setPending(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Close your account">
      <form onSubmit={submit} noValidate>
        <p className="text-ink-600 text-sm">
          This cannot be undone. Your name, email, phone and saved addresses are replaced
          with anonymous placeholders, and you will not be able to sign in again.
        </p>

        <label className="mt-4 block">
          <span className="field-label">Confirm with your password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field-input"
            autoComplete="current-password"
            required
          />
        </label>

        <label className="mt-3 block">
          <span className="field-label">Anything we could have done better? (optional)</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={300}
            className="field-input"
          />
          <span className="field-hint">Kept separately from your order history.</span>
        </label>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}

        <div className="border-cream-300 mt-5 flex justify-end gap-2 border-t pt-4">
          <button type="button" onClick={onClose} className="btn-outline" disabled={pending}>
            Keep my account
          </button>
          <button type="submit" className="btn-danger" disabled={pending || !password}>
            {pending ? <Spinner className="size-4" /> : null}
            Close it
          </button>
        </div>
      </form>
    </Modal>
  );
}
