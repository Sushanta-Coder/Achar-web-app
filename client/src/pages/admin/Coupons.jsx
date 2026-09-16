import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import {
  FilterBar,
  Modal,
  PageHeader,
  Pagination,
  TabBar,
} from '../../components/admin/AdminPage';
import { useDebounced, useFetch } from '../../hooks/useApi';
import { applyFieldErrors, del, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDate, formatNumber, formatPrice, toDateInputValue } from '../../lib/format';

/**
 * Coupons.
 *
 * `state` is computed server-side (`active` / `scheduled` / `expired` / `disabled`) rather
 * than inferred here from dates, so the badge cannot disagree with whether the coupon will
 * actually be honoured at checkout - the same code decides both.
 *
 * Deleting a coupon that has been redeemed disables it instead. A redemption record points
 * at the coupon, and a report of "who used what" has to keep resolving.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'expired', label: 'Expired' },
  { value: 'disabled', label: 'Disabled' },
];

const STATE_STYLES = {
  active: 'border-leaf-200 bg-leaf-100 text-leaf-800',
  scheduled: 'border-mustard-200 bg-mustard-50 text-mustard-800',
  expired: 'border-cream-400 bg-cream-200 text-ink-600',
  disabled: 'border-red-200 bg-red-50 text-red-700',
};

const BLANK = {
  code: '',
  description: '',
  discountType: 'percentage',
  discountValue: 10,
  minOrderAmount: 0,
  maxDiscountAmount: 0,
  startsAt: '',
  expiresAt: '',
  usageLimit: 0,
  perUserLimit: 1,
  firstOrderOnly: false,
  isActive: true,
};

export default function AdminCoupons() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Coupons · Admin', noIndex: true });

  const status = params.get('status') ?? 'all';
  const page = Number(params.get('page') ?? 1);

  const setFilter = (patchValues, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchValues)) {
      if (!value || value === 'all') next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useMemo(() => {
    const built = { page, limit: 20 };
    if (status !== 'all') built.status = status;
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, status, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/coupons/admin/list', { params: query });
  const coupons = data?.coupons ?? [];

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const response = await del(`/coupons/admin/${pendingDelete._id}`);
      // The API decides which of the two happened; the toast repeats what it says.
      toast.success(
        response.disabled
          ? 'This coupon has been used before, so it was disabled instead of deleted'
          : 'Coupon deleted'
      );
      setPendingDelete(null);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not delete the coupon');
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await patch(`/coupons/admin/${coupon._id}`, { isActive: !coupon.isActive });
      toast.success(coupon.isActive ? `${coupon.code} disabled` : `${coupon.code} enabled`);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not update the coupon');
    }
  };

  return (
    <>
      <PageHeader
        title="Coupons"
        description="Discount codes. The server applies them at checkout, so a code that reads as active here is one a customer can actually use."
        actions={
          <button type="button" onClick={() => setEditing(BLANK)} className="btn-primary btn-sm">
            <Icon name="plus" className="size-4" />
            New coupon
          </button>
        }
      />

      <TabBar tabs={STATUS_TABS} active={status} onChange={(value) => setFilter({ status: value })} />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Code…"
        onReset={search ? () => { setSearch(''); setFilter({ q: '' }); } : undefined}
      />

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={6} columns={5} />
        </div>
      ) : null}

      {!error && !loading && !coupons.length ? (
        <div className="card">
          <EmptyState
            icon="tag"
            title={search ? 'No coupon matched that' : 'No coupons yet'}
            description={
              search
                ? 'Codes are stored in upper case; the search is not case sensitive.'
                : 'Create a code like DASHAIN10 and it becomes usable at checkout straight away.'
            }
            action={search ? undefined : 'Create a coupon'}
            onAction={search ? undefined : () => setEditing(BLANK)}
          />
        </div>
      ) : null}

      {!error && !loading && coupons.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Discount</th>
                  <th scope="col" className="hidden md:table-cell">
                    Minimum
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Window
                  </th>
                  <th scope="col">Used</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon._id}>
                    <td>
                      <p className="text-ink-900 font-mono text-sm font-semibold">{coupon.code}</p>
                      {coupon.description ? (
                        <p className="text-ink-400 max-w-56 truncate text-xs">
                          {coupon.description}
                        </p>
                      ) : null}
                      {coupon.firstOrderOnly ? (
                        <span className="badge border-cream-400 bg-cream-100 text-ink-600 mt-1 border text-[0.6875rem]">
                          First order only
                        </span>
                      ) : null}
                    </td>

                    <td className="tnum whitespace-nowrap text-sm font-semibold">
                      {coupon.discountType === 'percentage'
                        ? `${coupon.discountValue}%`
                        : formatPrice(coupon.discountValue)}
                      {coupon.discountType === 'percentage' && coupon.maxDiscountAmount ? (
                        <span className="text-ink-400 block text-xs font-normal">
                          up to {formatPrice(coupon.maxDiscountAmount)}
                        </span>
                      ) : null}
                    </td>

                    <td className="tnum text-ink-500 hidden text-sm md:table-cell">
                      {coupon.minOrderAmount ? formatPrice(coupon.minOrderAmount) : '—'}
                    </td>

                    <td className="text-ink-500 hidden text-xs lg:table-cell">
                      {coupon.startsAt ? formatDate(coupon.startsAt) : 'Now'} →{' '}
                      {coupon.expiresAt ? formatDate(coupon.expiresAt) : 'no end'}
                    </td>

                    <td className="tnum text-sm">
                      {formatNumber(coupon.usedCount ?? 0)}
                      {coupon.usageLimit ? (
                        <span className="text-ink-400"> / {formatNumber(coupon.usageLimit)}</span>
                      ) : null}
                    </td>

                    <td>
                      <span
                        className={`badge border capitalize ${
                          STATE_STYLES[coupon.state] ?? STATE_STYLES.disabled
                        }`}
                      >
                        {coupon.state}
                      </span>
                    </td>

                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleActive(coupon)}
                          className="btn-ghost btn-sm size-8 px-0"
                          title={coupon.isActive ? 'Disable' : 'Enable'}
                        >
                          <Icon name={coupon.isActive ? 'eye' : 'check'} className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              ...coupon,
                              description: coupon.description ?? '',
                              startsAt: coupon.startsAt ? toDateInputValue(coupon.startsAt) : '',
                              expiresAt: coupon.expiresAt ? toDateInputValue(coupon.expiresAt) : '',
                            })
                          }
                          className="btn-ghost btn-sm size-8 px-0"
                          title="Edit"
                        >
                          <Icon name="edit" className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(coupon)}
                          className="btn-ghost btn-sm size-8 px-0 text-red-600"
                          title="Delete"
                        >
                          <Icon name="trash" className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            meta={data.meta}
            onPage={(next) => setFilter({ page: next }, { keepPage: true })}
            className="mt-4"
          />
        </>
      ) : null}

      <CouponModal
        value={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this coupon?"
        size="sm"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="btn-outline btn-sm"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleting}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {deleting ? <Spinner className="size-4" /> : null}
              Delete
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900 font-mono">{pendingDelete?.code}</strong> will stop
          working at checkout.
        </p>
        <p className="text-ink-500 mt-2 text-sm">
          If it has ever been redeemed it is disabled rather than deleted, so past orders keep
          showing which discount they received.
        </p>
      </Modal>
    </>
  );
}

/**
 * One dialog for create and edit. `code` is read-only once created: it is the identifier
 * customers have been given, and renaming it would orphan every redemption record.
 */
function CouponModal({ value, onClose, onSaved }) {
  const isEdit = Boolean(value?._id);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: BLANK });

  useEffect(() => {
    if (value) reset({ ...BLANK, ...value });
  }, [value, reset]);

  const discountType = watch('discountType');

  const onSubmit = async (form) => {
    const body = {
      description: form.description || undefined,
      discountType: form.discountType,
      discountValue: Number(form.discountValue),
      minOrderAmount: Number(form.minOrderAmount) || 0,
      maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
      usageLimit: Number(form.usageLimit) || 0,
      perUserLimit: Number(form.perUserLimit) || 0,
      firstOrderOnly: Boolean(form.firstOrderOnly),
      isActive: Boolean(form.isActive),
      // A cleared date must be sent as null, not omitted, or the merge keeps the old one.
      startsAt: form.startsAt || (isEdit ? null : undefined),
      expiresAt: form.expiresAt || (isEdit ? null : undefined),
    };

    try {
      if (isEdit) await patch(`/coupons/admin/${value._id}`, body);
      else await post('/coupons/admin', { ...body, code: form.code });
      toast.success(isEdit ? 'Coupon updated' : `Coupon ${form.code.toUpperCase()} created`);
      onSaved();
    } catch (error) {
      const normalised = error?.normalised;
      if (!applyFieldErrors(normalised, setError)) {
        toast.error(normalised?.message ?? 'Could not save the coupon');
      }
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isEdit ? `Edit ${value?.code}` : 'New coupon'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="coupon-form"
            disabled={isSubmitting}
            className="btn-primary btn-sm"
          >
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isEdit ? 'Save changes' : 'Create coupon'}
          </button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div>
          <label htmlFor="coupon-code" className="field-label">
            Code
          </label>
          <input
            id="coupon-code"
            {...register('code', { required: 'Enter a code' })}
            readOnly={isEdit}
            className={`field-input font-mono uppercase ${isEdit ? 'bg-cream-100 text-ink-500' : ''}`}
            placeholder="DASHAIN10"
            autoComplete="off"
          />
          <p className="field-hint">
            {isEdit
              ? 'The code cannot be changed - customers already have it.'
              : 'Letters, numbers, dashes or underscores. Stored in upper case.'}
          </p>
          {errors.code ? <p className="field-error">{errors.code.message}</p> : null}
        </div>

        <div>
          <label htmlFor="coupon-description" className="field-label">
            Internal description
          </label>
          <input
            id="coupon-description"
            maxLength={200}
            {...register('description')}
            className="field-input"
            placeholder="Dashain campaign, Facebook post"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-type" className="field-label">
              Discount type
            </label>
            <select id="coupon-type" {...register('discountType')} className="field-input">
              <option value="percentage">Percentage off</option>
              <option value="fixed">Fixed amount off</option>
            </select>
          </div>

          <div>
            <label htmlFor="coupon-value" className="field-label">
              {discountType === 'percentage' ? 'Percent off' : 'Rupees off'}
            </label>
            <input
              id="coupon-value"
              type="number"
              min={1}
              max={discountType === 'percentage' ? 100 : undefined}
              step={1}
              {...register('discountValue', { required: 'Enter a discount' })}
              className="field-input tnum"
            />
            {errors.discountValue ? (
              <p className="field-error">{errors.discountValue.message}</p>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-min" className="field-label">
              Minimum order
            </label>
            <input
              id="coupon-min"
              type="number"
              min={0}
              step={1}
              {...register('minOrderAmount')}
              className="field-input tnum"
            />
            <p className="field-hint">0 means no minimum.</p>
          </div>

          <div>
            <label htmlFor="coupon-max" className="field-label">
              Maximum discount
            </label>
            <input
              id="coupon-max"
              type="number"
              min={0}
              step={1}
              {...register('maxDiscountAmount')}
              disabled={discountType !== 'percentage'}
              className="field-input tnum disabled:bg-cream-100 disabled:text-ink-400"
            />
            <p className="field-hint">
              {discountType === 'percentage'
                ? 'Caps a percentage discount. 0 means uncapped.'
                : 'Only applies to percentage discounts.'}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-starts" className="field-label">
              Starts
            </label>
            <input id="coupon-starts" type="date" {...register('startsAt')} className="field-input" />
            <p className="field-hint">Blank means immediately.</p>
          </div>

          <div>
            <label htmlFor="coupon-expires" className="field-label">
              Ends
            </label>
            <input
              id="coupon-expires"
              type="date"
              {...register('expiresAt')}
              className="field-input"
            />
            {errors.expiresAt ? <p className="field-error">{errors.expiresAt.message}</p> : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="coupon-limit" className="field-label">
              Total uses
            </label>
            <input
              id="coupon-limit"
              type="number"
              min={0}
              step={1}
              {...register('usageLimit')}
              className="field-input tnum"
            />
            <p className="field-hint">0 means unlimited.</p>
          </div>

          <div>
            <label htmlFor="coupon-per-user" className="field-label">
              Uses per customer
            </label>
            <input
              id="coupon-per-user"
              type="number"
              min={0}
              step={1}
              {...register('perUserLimit')}
              className="field-input tnum"
            />
          </div>
        </div>

        <div className="border-cream-300 space-y-2 rounded-xl border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              {...register('firstOrderOnly')}
              className="size-4 cursor-pointer"
            />
            First order only
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 cursor-pointer" />
            Active
          </label>
        </div>
      </form>
    </Modal>
  );
}
