import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { Modal, PageHeader, StatTile } from '../../components/admin/AdminPage';
import { useFetch } from '../../hooks/useApi';
import { applyFieldErrors, patch, post } from '../../lib/apiClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDateTime, formatRelative } from '../../lib/format';

/**
 * Staff accounts. Admin-only — mirrors `requireAdmin` on the server.
 *
 * The lockout guard is the whole design here. Every dangerous action (revoke, deactivate,
 * downgrade) is refused by the server when it would leave the shop with no active admin, and
 * refused outright on your own account. This page does not try to reimplement that arithmetic;
 * it disables the obvious cases so the buttons are honest, and lets the API be the authority on
 * the rest. A UI that guesses wrong about a lockout rule is worse than one that asks.
 *
 * Revoking downgrades to `customer` rather than deleting, so the orders and audit lines that
 * name the account still resolve to a person.
 *
 * There is no password field on the edit form. Changing someone's password is a separate,
 * louder action that signs them out everywhere, and it should not be something you do by
 * accident while fixing a typo in their phone number.
 */

const ROLE_LABELS = {
  admin: 'Admin',
  staff: 'Staff',
};

const ROLE_STYLES = {
  admin: 'border-brand-200 bg-brand-50 text-brand-800',
  staff: 'border-cream-400 bg-cream-200 text-ink-700',
};

const BLANK = { name: '', email: '', phone: '', password: '', role: 'staff' };

export default function AdminStaff() {
  const { user } = useAuth();
  const [editing, setEditing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Staff · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/admin/staff');

  const staff = data?.staff ?? [];
  const roles = data?.roles ?? ['admin', 'staff'];

  const setActive = async (member) => {
    setBusy(true);
    try {
      await patch(`/admin/staff/${member._id}`, { isActive: !member.isActive });
      toast.success(member.isActive ? `${member.name} deactivated` : `${member.name} reactivated`);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not change the account');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      await patch(`/admin/staff/${pendingRevoke._id}/revoke`);
      toast.success(`${pendingRevoke.name} no longer has access`);
      setPendingRevoke(null);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not revoke access');
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <PageLoader label="Loading staff" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Staff"
        description="Who can sign in to this dashboard. Staff run the day-to-day screens; admins also change settings and manage accounts."
        actions={
          <button
            type="button"
            onClick={() => setEditing(BLANK)}
            className="btn-primary btn-sm"
          >
            <Icon name="plus" className="size-4" />
            Add account
          </button>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile
          label="Accounts"
          value={staff.length}
          sub="with dashboard access"
          icon="users"
          tone="brand"
        />
        <StatTile
          label="Active admins"
          value={data?.activeAdmins ?? 0}
          sub={
            (data?.activeAdmins ?? 0) > 1
              ? 'safe to change one'
              : 'the last one cannot be removed'
          }
          icon="settings"
          tone={(data?.activeAdmins ?? 0) > 1 ? 'leaf' : 'mustard'}
        />
        <StatTile
          label="Staff"
          value={staff.filter((member) => member.role === 'staff').length}
          sub="no settings access"
          icon="user"
          tone="ink"
        />
      </div>

      <div className="card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="hidden md:table-cell">
                Contact
              </th>
              <th scope="col">Role</th>
              <th scope="col" className="hidden lg:table-cell">
                Last signed in
              </th>
              <th scope="col" className="sr-only">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {staff.map((member) => {
              const isSelf = String(member._id) === String(user?._id ?? user?.id);
              return (
                <tr key={member._id}>
                  <td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium">{member.name}</span>
                      {isSelf ? (
                        <span className="badge border-cream-400 bg-cream-100 text-ink-500 border">
                          You
                        </span>
                      ) : null}
                      {!member.isActive ? (
                        <span className="badge border-red-200 bg-red-50 text-red-700 border">
                          Deactivated
                        </span>
                      ) : null}
                    </div>
                    <p className="text-ink-400 text-xs md:hidden">{member.email}</p>
                  </td>

                  <td className="hidden text-xs md:table-cell">
                    <p className="text-ink-600 break-all">{member.email}</p>
                    <p className="text-ink-400 tnum">{member.phone}</p>
                  </td>

                  <td>
                    <span
                      className={`badge border capitalize ${
                        ROLE_STYLES[member.role] ?? ROLE_STYLES.staff
                      }`}
                    >
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  </td>

                  <td className="text-ink-500 hidden text-xs whitespace-nowrap lg:table-cell">
                    {member.lastLoginAt ? (
                      <span title={formatDateTime(member.lastLoginAt)}>
                        {formatRelative(member.lastLoginAt)}
                      </span>
                    ) : (
                      <span className="text-ink-400">Never</span>
                    )}
                  </td>

                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...member,
                            phone: member.phone ?? '',
                            password: '',
                          })
                        }
                        className="btn-ghost btn-sm size-8 px-0"
                        title="Edit"
                      >
                        <Icon name="edit" className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetting({ ...member, password: '' })}
                        className="btn-ghost btn-sm"
                        title="Set a new password and sign them out everywhere"
                      >
                        Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setActive(member)}
                        disabled={busy || isSelf}
                        className="btn-outline btn-sm"
                        title={
                          isSelf
                            ? 'You cannot deactivate your own account'
                            : member.isActive
                              ? 'Block sign-in without removing the account'
                              : 'Allow sign-in again'
                        }
                      >
                        {member.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRevoke(member)}
                        disabled={isSelf}
                        className="btn-ghost btn-sm size-8 px-0 text-red-600"
                        title={
                          isSelf ? 'You cannot revoke your own access' : 'Revoke dashboard access'
                        }
                      >
                        <Icon name="logout" className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <StaffModal
        value={editing}
        roles={roles}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      <PasswordModal
        value={resetting}
        onChange={setResetting}
        onClose={() => setResetting(null)}
        onSaved={() => {
          setResetting(null);
          refetch();
        }}
      />

      <Modal
        open={Boolean(pendingRevoke)}
        onClose={() => setPendingRevoke(null)}
        title="Revoke dashboard access?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingRevoke(null)}
              className="btn-outline btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={revoke}
              disabled={busy}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Spinner className="size-4" /> : null}
              Revoke access
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900">{pendingRevoke?.name}</strong> becomes an ordinary
          customer account. They are signed out everywhere immediately and can no longer reach
          any admin screen.
        </p>
        <p className="text-ink-500 mt-2 text-sm">
          The account is kept rather than deleted, so orders and notes that name them still make
          sense.
        </p>
      </Modal>
    </>
  );
}

/**
 * Create and edit share this modal, but they send different bodies: creating needs a password
 * and an email, editing sends neither. Email is the sign-in identifier and changing it is an
 * account transfer, not an edit, so the field is read-only once the account exists.
 */
function StaffModal({ value, roles, onClose, onSaved }) {
  const isEdit = Boolean(value?._id);
  const [form, setForm] = useState(BLANK);
  const [seeded, setSeeded] = useState(null);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const toast = useToast();

  // Seeded from props without an effect: comparing the id we last seeded against the current
  // one is the same guard an effect would apply, one render earlier.
  const key = value?._id ?? (value ? 'new' : null);
  if (value && key !== seeded) {
    setSeeded(key);
    setForm({ ...BLANK, ...value });
    setFieldErrors({});
  }

  const field = (patchValues) => setForm((current) => ({ ...current, ...patchValues }));

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFieldErrors({});
    try {
      if (isEdit) {
        await patch(`/admin/staff/${value._id}`, {
          name: form.name,
          phone: form.phone,
          role: form.role,
        });
        toast.success('Account saved');
      } else {
        await post('/admin/staff', {
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password,
          role: form.role,
        });
        toast.success(`${form.name} can now sign in`);
      }
      onSaved();
    } catch (error) {
      const normalised = error?.normalised;
      // No react-hook-form here, so `applyFieldErrors` gets a setter shaped like its own.
      const collected = {};
      const captured = applyFieldErrors(normalised, (name, { message }) => {
        collected[name] = message;
      });
      if (captured) setFieldErrors(collected);
      else toast.error(normalised?.message ?? 'Could not save the account');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isEdit ? `Edit ${value?.name}` : 'New staff account'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button type="submit" form="staff-form" disabled={busy} className="btn-primary btn-sm">
            {busy ? <Spinner className="size-4" /> : null}
            {isEdit ? 'Save changes' : 'Create account'}
          </button>
        </>
      }
    >
      <form id="staff-form" onSubmit={submit} className="space-y-3">
        <div>
          <label htmlFor="staff-name" className="field-label">
            Full name
          </label>
          <input
            id="staff-name"
            required
            maxLength={80}
            value={form.name}
            onChange={(event) => field({ name: event.target.value })}
            className="field-input"
          />
          {fieldErrors.name ? <p className="field-error">{fieldErrors.name}</p> : null}
        </div>

        <div>
          <label htmlFor="staff-email" className="field-label">
            Email
          </label>
          <input
            id="staff-email"
            type="email"
            required
            disabled={isEdit}
            value={form.email}
            onChange={(event) => field({ email: event.target.value })}
            className="field-input disabled:bg-cream-100 disabled:text-ink-500"
          />
          <p className="field-hint">
            {isEdit
              ? 'The sign-in address cannot be changed. Create a new account instead.'
              : 'This is how they sign in at /admin/login.'}
          </p>
          {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
        </div>

        <div>
          <label htmlFor="staff-phone" className="field-label">
            Phone
          </label>
          <input
            id="staff-phone"
            required
            inputMode="numeric"
            value={form.phone}
            onChange={(event) => field({ phone: event.target.value })}
            className="field-input tnum"
            placeholder="98XXXXXXXX"
          />
          {fieldErrors.phone ? <p className="field-error">{fieldErrors.phone}</p> : null}
        </div>

        {!isEdit ? (
          <div>
            <label htmlFor="staff-password" className="field-label">
              Temporary password
            </label>
            <input
              id="staff-password"
              type="text"
              required
              minLength={10}
              maxLength={128}
              value={form.password}
              onChange={(event) => field({ password: event.target.value })}
              className="field-input font-mono text-sm"
              autoComplete="new-password"
            />
            <p className="field-hint">
              At least 10 characters. Shown in plain text so you can copy it — hand it over in
              person or by phone, not by email, and have them change it on first sign-in.
            </p>
            {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="staff-role" className="field-label">
            Role
          </label>
          <select
            id="staff-role"
            value={form.role}
            onChange={(event) => field({ role: event.target.value })}
            className="field-input"
          >
            {roles.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role] ?? role}
              </option>
            ))}
          </select>
          <p className="field-hint">
            Staff can run products, orders, inventory and the inbox. Admin adds site settings,
            staff accounts and the repair tools.
          </p>
          {fieldErrors.role ? <p className="field-error">{fieldErrors.role}</p> : null}
        </div>
      </form>
    </Modal>
  );
}

function PasswordModal({ value, onChange, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await patch(`/admin/staff/${value._id}/password`, { password: value.password });
      toast.success(`Password reset. ${value.name} has been signed out everywhere.`);
      onSaved();
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not reset the password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Set a new password"
      size="sm"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="password-form"
            disabled={busy || (value?.password ?? '').length < 10}
            className="btn-primary btn-sm"
          >
            {busy ? <Spinner className="size-4" /> : null}
            Reset password
          </button>
        </>
      }
    >
      {value ? (
        <form id="password-form" onSubmit={submit}>
          <p className="text-ink-600 mb-3 text-sm">
            <strong className="text-ink-900">{value.name}</strong> will be signed out of every
            device and will need this password to get back in.
          </p>

          <label htmlFor="staff-new-password" className="field-label">
            New password
          </label>
          <input
            id="staff-new-password"
            type="text"
            required
            minLength={10}
            maxLength={128}
            value={value.password}
            onChange={(event) => onChange({ ...value, password: event.target.value })}
            className="field-input font-mono text-sm"
            autoComplete="new-password"
          />
          <p className="field-hint">At least 10 characters.</p>
        </form>
      ) : null}
    </Modal>
  );
}
