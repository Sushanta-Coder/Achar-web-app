import { useState } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '../../components/ui/Icon';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/admin/AdminPage';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useApi';
import { apiError, del, patch, post } from '../../lib/apiClient';
import { addressLine, formatPhone } from '../../lib/format';

/**
 * Saved delivery addresses.
 *
 * Two details drove the shape of this page.
 *
 * `PATCH /users/me/addresses/:id` validates against the *whole* `addressInput` schema,
 * not a partial one, so the form always submits every field including the untouched
 * optional ones. Sending a diff would fail validation on the fields it left out, which is
 * a confusing 422 to debug from the outside.
 *
 * And the server cross-checks that the district actually sits in the chosen province, so
 * changing the province clears the district. Without that, editing "Bagmati / Lalitpur"
 * to Gandaki keeps Lalitpur selected and the save is rejected on a field the customer
 * never touched.
 *
 * Which address is the default is the server's business too - it clears the others in the
 * same write. This page re-renders from the `addresses` array every response returns
 * rather than toggling a flag locally, so two rows can never both look default.
 */

const BLANK = {
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
  isDefault: false,
};

export default function Addresses() {
  const toast = useToast();
  const { data, error, loading, refetch, setData } = useFetch('/users/me/addresses');
  const locations = useFetch('/settings/locations');

  const [editing, setEditing] = useState(null); // BLANK-ish for new, the address for edit
  const [removing, setRemoving] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const addresses = data?.addresses ?? [];
  const provinces = locations.data?.provinces ?? [];

  /** Every mutating response returns the full list, so the page can trust it wholesale. */
  const applyList = (result) => setData({ addresses: result.addresses });

  const makeDefault = async (address) => {
    setBusyId(address._id);
    try {
      applyList(await post(`/users/me/addresses/${address._id}/default`));
      toast.success('Default address updated');
    } catch (caught) {
      toast.error(apiError(caught).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async () => {
    setBusyId(removing._id);
    try {
      applyList(await del(`/users/me/addresses/${removing._id}`));
      setRemoving(null);
      toast.success('Address removed');
    } catch (caught) {
      toast.error(apiError(caught).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl">Delivery addresses</h1>
          <p className="text-ink-500 mt-1 text-sm">
            Save up to ten. The default one is filled in for you at checkout.
          </p>
        </div>
        {addresses.length ? (
          <button
            type="button"
            onClick={() => setEditing(BLANK)}
            className="btn-primary btn-sm"
            disabled={addresses.length >= 10}
          >
            <Icon name="plus" className="size-4" />
            Add an address
          </button>
        ) : null}
      </div>

      {addresses.length >= 10 ? (
        <p className="border-mustard-200 bg-mustard-50 text-mustard-900 mt-4 rounded-lg border px-3 py-2 text-sm">
          That is all ten. Remove one you no longer use to add another.
        </p>
      ) : null}

      {error ? (
        <div className="card mt-5 p-5">
          <ErrorState error={error} onRetry={refetch} />
        </div>
      ) : loading ? (
        <div className="card mt-5 p-4">
          <SkeletonRows rows={3} columns={3} />
        </div>
      ) : addresses.length ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {addresses.map((address) => (
            <AddressCard
              key={address._id}
              address={address}
              busy={busyId === address._id}
              onEdit={() => setEditing(address)}
              onDefault={() => makeDefault(address)}
              onRemove={() => setRemoving(address)}
            />
          ))}
        </ul>
      ) : (
        <div className="card mt-5">
          <EmptyState
            icon="pin"
            title="No saved addresses"
            description="Save the places you order to and checkout becomes two taps instead of a form."
            action={
              <button type="button" onClick={() => setEditing(BLANK)} className="btn-primary">
                <Icon name="plus" className="size-4" />
                Add your first address
              </button>
            }
          />
        </div>
      )}

      {/*
        Keyed on the address id so React discards the form when the customer switches
        from editing one address to another - `useForm` reads its defaults once, and a
        reused instance would show the previous address's values.
      */}
      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?._id ? 'Edit address' : 'New address'}
        size="lg"
      >
        {editing ? (
          <AddressForm
            key={editing._id ?? 'new'}
            address={editing}
            provinces={provinces}
            locationsLoading={locations.loading}
            onDone={(result, message) => {
              applyList(result);
              setEditing(null);
              toast.success(message);
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this address?"
        footer={
          <>
            <button type="button" onClick={() => setRemoving(null)} className="btn-outline">
              Keep it
            </button>
            <button type="button" onClick={remove} className="btn-danger" disabled={Boolean(busyId)}>
              {busyId ? <Spinner className="size-4" /> : null}
              Remove
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          {removing ? addressLine(removing) : ''}
        </p>
        <p className="text-ink-400 mt-2 text-xs">
          Orders already placed to this address keep their own copy of it — removing it here
          changes nothing that has already shipped.
        </p>
      </Modal>
    </div>
  );
}

function AddressCard({ address, busy, onEdit, onDefault, onRemove }) {
  return (
    <li
      className={`card flex flex-col p-4 ${address.isDefault ? 'border-brand-300 bg-brand-50/40' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            {address.fullName}
            {address.label ? (
              <span className="badge bg-cream-200 text-ink-600">{address.label}</span>
            ) : null}
          </p>
          <p className="text-ink-500 tnum text-xs">{formatPhone(address.phone)}</p>
        </div>
        {address.isDefault ? (
          <span className="badge bg-brand-100 text-brand-800 shrink-0">Default</span>
        ) : null}
      </div>

      <p className="text-ink-600 mt-2 flex-1 text-sm">{addressLine(address)}</p>

      {address.landmark ? (
        <p className="text-ink-400 mt-1 text-xs">Landmark: {address.landmark}</p>
      ) : null}
      {address.deliveryInstructions ? (
        <p className="text-ink-400 mt-1 text-xs italic">“{address.deliveryInstructions}”</p>
      ) : null}

      <div className="border-cream-200 mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
        <button type="button" onClick={onEdit} className="btn-ghost btn-sm">
          <Icon name="edit" className="size-3.5" />
          Edit
        </button>
        {!address.isDefault ? (
          <button type="button" onClick={onDefault} className="btn-ghost btn-sm" disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Icon name="check" className="size-3.5" />}
            Make default
          </button>
        ) : null}
        <button
          type="button"
          onClick={onRemove}
          className="btn-ghost btn-sm ml-auto text-red-700"
          disabled={busy}
        >
          <Icon name="trash" className="size-3.5" />
          Remove
        </button>
      </div>
    </li>
  );
}

function AddressForm({ address, provinces, locationsLoading, onDone }) {
  const editingId = address._id;
  const { register, handleSubmit, watch, setValue, setError, formState } = useForm({
    defaultValues: { ...BLANK, ...pickFields(address) },
  });
  const [formError, setFormError] = useState('');

  const province = watch('province');
  const districts = provinces.find((entry) => entry.name === province)?.districts ?? [];

  const submit = handleSubmit(async (values) => {
    setFormError('');
    // Always the full object: PATCH validates the whole schema, not a diff.
    const body = { ...values, wardNo: Number(values.wardNo) };

    try {
      const result = editingId
        ? await patch(`/users/me/addresses/${editingId}`, body)
        : await post('/users/me/addresses', body);
      onDone(result, editingId ? 'Address updated' : 'Address saved');
    } catch (caught) {
      const normalised = apiError(caught);
      let matched = false;
      for (const [field, message] of Object.entries(normalised.errors ?? {})) {
        if (field in BLANK) {
          setError(field, { type: 'server', message });
          matched = true;
        }
      }
      if (!matched) setFormError(normalised.message);
    }
  });

  const errors = formState.errors;

  return (
    <form onSubmit={submit} noValidate>
      {formError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Full name" error={errors.fullName?.message} className="sm:col-span-2">
          <input
            {...register('fullName', { required: 'Who is receiving this?' })}
            className="field-input"
            autoComplete="name"
          />
        </Field>

        <Field label="Mobile" error={errors.phone?.message} hint="98XXXXXXXX">
          <input
            {...register('phone', { required: 'A mobile number is required' })}
            className="field-input tnum"
            inputMode="numeric"
            autoComplete="tel"
          />
        </Field>

        <Field
          label="Alternate mobile"
          error={errors.altPhone?.message}
          hint="Optional — for when the first does not answer"
        >
          <input {...register('altPhone')} className="field-input tnum" inputMode="numeric" />
        </Field>

        <Field label="Province" error={errors.province?.message}>
          <select
            {...register('province', {
              required: 'Select a province',
              // The server rejects a district that is not in the province; clearing it
              // here means the customer never sees that error for a field they left alone.
              onChange: () => setValue('district', ''),
            })}
            className="field-input"
          >
            <option value="">{locationsLoading ? 'Loading…' : 'Choose…'}</option>
            {provinces.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="District" error={errors.district?.message}>
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

        <Field label="Municipality / VDC" error={errors.municipality?.message}>
          <input {...register('municipality', { required: 'Municipality is required' })} className="field-input" />
        </Field>

        <Field label="Ward no." error={errors.wardNo?.message}>
          <input
            {...register('wardNo', {
              required: 'Ward number is required',
              min: { value: 1, message: 'Ward numbers start at 1' },
              max: { value: 35, message: 'Ward numbers go up to 35' },
            })}
            type="number"
            min="1"
            max="35"
            className="field-input tnum"
          />
        </Field>

        <Field
          label="Tole / area"
          error={errors.tole?.message}
          className="sm:col-span-2"
          hint="The bit a courier actually uses to find you"
        >
          <input {...register('tole', { required: 'Tole or area is required' })} className="field-input" />
        </Field>

        <Field label="Street" error={errors.street?.message} hint="Optional">
          <input {...register('street')} className="field-input" />
        </Field>

        <Field label="Nearest landmark" error={errors.landmark?.message} hint="Optional">
          <input {...register('landmark')} className="field-input" placeholder="Opposite the school" />
        </Field>

        <Field
          label="Notes for the courier"
          error={errors.deliveryInstructions?.message}
          className="sm:col-span-2"
          hint="Optional — gate code, best time to call"
        >
          <textarea {...register('deliveryInstructions')} rows={2} className="field-input" />
        </Field>

        <Field label="Label" error={errors.label?.message} hint="Optional — Home, Office…">
          <input {...register('label')} className="field-input" maxLength={30} />
        </Field>
      </div>

      <label className="mt-3 flex items-start gap-2.5 text-sm">
        <input type="checkbox" {...register('isDefault')} className="mt-0.5 size-4 shrink-0" />
        <span className="text-ink-600">Use this as my default delivery address</span>
      </label>

      <div className="border-cream-300 mt-5 flex justify-end gap-2 border-t pt-4">
        <button type="submit" className="btn-primary" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? <Spinner className="size-4" /> : null}
          {editingId ? 'Save changes' : 'Save address'}
        </button>
      </div>
    </form>
  );
}

/** Only the schema's own keys, so a Mongo `_id` never rides along into the request body. */
function pickFields(source) {
  const out = {};
  for (const key of Object.keys(BLANK)) {
    if (source[key] !== undefined && source[key] !== null) out[key] = source[key];
  }
  return out;
}

function Field({ label, error, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
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
