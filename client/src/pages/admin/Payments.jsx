import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import { PaymentBadge } from '../../components/admin/StatusBadge';
import { FilterBar, Modal, PageHeader, Pagination, StatTile, TabBar } from '../../components/admin/AdminPage';
import { useDebounced, useFetch } from '../../hooks/useApi';
import { post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDateTime, formatNumber, formatPrice } from '../../lib/format';

/**
 * Payments.
 *
 * Two things are actionable here and both are read-only from the browser's point of view -
 * a payment's status is never typed in, only re-fetched from the gateway:
 *
 *  - **Re-check** runs `POST /payments/admin/:id/reconcile`, which walks the identical
 *    verification path a browser callback would. That matters: a customer who paid and then
 *    closed the tab before redirecting leaves a pending payment against a real transaction,
 *    and asking Khalti again is the only honest way to resolve it. Nothing here can mark a
 *    payment successful on an admin's word.
 *
 *  - **Attention** lists stale pending payments and any order with more than one successful
 *    payment against it. A double charge is the one payment bug that costs a customer money,
 *    so it gets its own panel rather than a filter someone has to think to apply.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'paid', label: 'Settled' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'refunded', label: 'Refunded' },
];

export default function AdminPayments() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [reconciling, setReconciling] = useState(null);
  const [refunding, setRefunding] = useState(null);
  const toast = useToast();

  useSeo({ title: 'Payments · Admin', noIndex: true });

  const status = params.get('status') ?? 'all';
  const gateway = params.get('gateway') ?? '';
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
    if (gateway) built.gateway = gateway;
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, status, gateway, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/payments/admin/list', { params: query });
  const attention = useFetch('/payments/admin/attention');

  const payments = data?.payments ?? [];
  const summary = data?.summary ?? {};
  const needsAttention =
    (attention.data?.stalePending?.length ?? 0) + (attention.data?.doubleCharges?.length ?? 0);

  const recheck = async (payment) => {
    setReconciling(payment._id);
    try {
      const result = await post(`/payments/admin/${payment._id}/reconcile`);
      const line = `Gateway reports this as ${result.status}`;
      if (result.requiresRefund) toast.warning(`${line}. The amount does not match — a refund is needed.`);
      else if (result.status === 'paid') toast.success(line);
      else toast.info(line);
      refetch();
      attention.refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not reach the gateway');
    } finally {
      setReconciling(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every gateway attempt, successful or not. Status always comes from the gateway — it is never set by hand."
        actions={
          needsAttention ? (
            <button
              type="button"
              onClick={() => setAttentionOpen(true)}
              className="btn btn-sm bg-mustard-100 text-mustard-900 border-mustard-300 border hover:bg-mustard-200"
            >
              <Icon name="alert" className="size-4" />
              {needsAttention} need{needsAttention === 1 ? 's' : ''} attention
            </button>
          ) : null
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Collected"
          value={formatPrice(summary.paid?.value ?? 0)}
          sub={`${formatNumber(summary.paid?.count ?? 0)} settled`}
          icon="wallet"
          tone="leaf"
        />
        <StatTile
          label="Pending"
          value={formatNumber(summary.pending?.count ?? 0)}
          sub={formatPrice(summary.pending?.value ?? 0)}
          icon="clock"
          tone="mustard"
        />
        <StatTile
          label="Failed"
          value={formatNumber(summary.failed?.count ?? 0)}
          sub="abandoned or declined"
          icon="close"
          tone="red"
        />
        <StatTile
          label="Refunded"
          value={formatPrice(summary.refunded?.value ?? 0)}
          sub={`${formatNumber(summary.refunded?.count ?? 0)} refund(s)`}
          icon="refresh"
          tone="ink"
        />
      </div>

      <TabBar tabs={STATUS_TABS} active={status} onChange={(value) => setFilter({ status: value })} />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Order number or transaction id…"
        onReset={search || gateway ? () => { setSearch(''); setFilter({ q: '', gateway: '' }); } : undefined}
      >
        <select
          aria-label="Gateway"
          value={gateway}
          onChange={(event) => setFilter({ gateway: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">All gateways</option>
          <option value="khalti">Khalti</option>
          <option value="esewa">eSewa</option>
          <option value="cod">Cash on delivery</option>
        </select>
      </FilterBar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={8} columns={6} />
        </div>
      ) : null}

      {!error && !loading && !payments.length ? (
        <div className="card">
          <EmptyState
            icon="wallet"
            title="No payments here"
            description="Nothing matches these filters yet. Cash on delivery orders appear once they are collected."
          />
        </div>
      ) : null}

      {!error && !loading && payments.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Order</th>
                  <th scope="col">Gateway</th>
                  <th scope="col" className="text-right">
                    Amount
                  </th>
                  <th scope="col" className="hidden lg:table-cell">
                    Transaction
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    When
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment._id}>
                    <td>
                      {payment.order ? (
                        <Link
                          to={`/admin/orders/${payment.order}`}
                          className="text-ink-900 hover:text-brand-700 font-mono text-sm font-medium"
                        >
                          {payment.orderNumber}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm">{payment.orderNumber ?? '—'}</span>
                      )}
                      {payment.failureReason ? (
                        <p className="max-w-56 truncate text-xs text-red-600">
                          {payment.failureReason}
                        </p>
                      ) : null}
                    </td>

                    <td className="text-sm capitalize">{payment.gateway}</td>

                    <td className="tnum text-right text-sm font-semibold whitespace-nowrap">
                      {formatPrice(payment.amount)}
                    </td>

                    <td className="text-ink-500 hidden max-w-40 truncate font-mono text-xs lg:table-cell">
                      {payment.transactionId ?? '—'}
                    </td>

                    <td className="text-ink-500 hidden text-xs whitespace-nowrap sm:table-cell">
                      {formatDateTime(payment.createdAt)}
                    </td>

                    <td>
                      <PaymentBadge status={payment.status} />
                    </td>

                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        {payment.gateway !== 'cod' ? (
                          <button
                            type="button"
                            onClick={() => recheck(payment)}
                            disabled={reconciling === payment._id}
                            className="btn-outline btn-sm"
                            title="Ask the gateway what happened to this payment"
                          >
                            {reconciling === payment._id ? (
                              <Spinner className="size-4" />
                            ) : (
                              <Icon name="refresh" className="size-4" />
                            )}
                            Re-check
                          </button>
                        ) : null}
                        {payment.status === 'paid' ? (
                          <button
                            type="button"
                            onClick={() =>
                              setRefunding({ ...payment, amount: payment.amount, reference: '', note: '' })
                            }
                            className="btn-ghost btn-sm"
                            title="Record a refund issued through the gateway dashboard"
                          >
                            Refund
                          </button>
                        ) : null}
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

      <Modal
        open={attentionOpen}
        onClose={() => setAttentionOpen(false)}
        title="Payments needing attention"
        size="lg"
      >
        <section>
          <h3 className="text-sm font-semibold">Stuck pending</h3>
          <p className="text-ink-500 mt-0.5 text-sm">
            A payment left open for a long time. Usually the customer closed the tab — re-check
            asks the gateway whether the money actually moved.
          </p>
          {attention.data?.stalePending?.length ? (
            <ul className="divide-cream-200 mt-2 divide-y">
              {attention.data.stalePending.map((payment) => (
                <li key={payment._id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium">{payment.orderNumber}</p>
                    <p className="text-ink-400 text-xs">
                      {payment.gateway} · {formatPrice(payment.amount)} ·{' '}
                      {formatDateTime(payment.createdAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => recheck(payment)}
                    disabled={reconciling === payment._id}
                    className="btn-outline btn-sm shrink-0"
                  >
                    {reconciling === payment._id ? <Spinner className="size-4" /> : null}
                    Re-check
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-400 mt-2 text-sm">Nothing stuck.</p>
          )}
        </section>

        <section className="border-cream-300 mt-4 border-t pt-4">
          <h3 className="text-sm font-semibold">Possible double charges</h3>
          <p className="text-ink-500 mt-0.5 text-sm">
            More than one successful payment against a single order. Refund the extra through the
            gateway dashboard, then record it against the payment.
          </p>
          {attention.data?.doubleCharges?.length ? (
            <ul className="divide-cream-200 mt-2 divide-y">
              {attention.data.doubleCharges.map((row) => (
                <li key={row.orderId} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/admin/orders/${row.orderId}`}
                      className="hover:text-brand-700 font-mono text-sm font-medium"
                    >
                      {row.orderNumber}
                    </Link>
                    <p className="text-xs text-red-600">
                      {row.successfulPayments} successful payments totalling{' '}
                      {formatPrice(row.totalCollected)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-leaf-700 mt-2 text-sm">No order has been charged twice.</p>
          )}
        </section>
      </Modal>

      <RefundModal
        value={refunding}
        onChange={setRefunding}
        onClose={() => setRefunding(null)}
        onSaved={() => {
          setRefunding(null);
          refetch();
          attention.refetch();
        }}
      />
    </>
  );
}

/**
 * Records a refund that was issued elsewhere. Khalti and eSewa both refund out-of-band for
 * standard merchant accounts, so this deliberately does not claim to move money - it books a
 * refund that has already happened in the gateway dashboard, and the wording says so. The
 * reference field is what makes the two records reconcilable later.
 */
function RefundModal({ value, onChange, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const submit = async () => {
    setBusy(true);
    try {
      await post(`/payments/admin/${value._id}/refund`, {
        amount: Number(value.amount),
        reference: value.reference || undefined,
        note: value.note || undefined,
      });
      toast.success('Refund recorded');
      onSaved();
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not record the refund');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Record a refund"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !value?.amount}
            className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
          >
            {busy ? <Spinner className="size-4" /> : null}
            Record refund
          </button>
        </>
      }
    >
      {value ? (
        <div className="space-y-3">
          <div className="border-mustard-200 bg-mustard-50 rounded-xl border p-3">
            <p className="text-mustard-900 flex items-center gap-1.5 text-sm font-medium">
              <Icon name="info" className="size-4 shrink-0" />
              This does not send money
            </p>
            <p className="text-mustard-800 mt-1 text-sm">
              Issue the refund in the {value.gateway} merchant dashboard first, then record it here
              so the order and the books agree.
            </p>
          </div>

          <p className="text-ink-600 text-sm">
            Order <strong className="font-mono">{value.orderNumber}</strong> · collected{' '}
            <strong>{formatPrice(value.amount)}</strong>
          </p>

          <div>
            <label htmlFor="refund-amount" className="field-label">
              Amount refunded
            </label>
            <input
              id="refund-amount"
              type="number"
              min={1}
              max={value.amount}
              step={1}
              value={value.amount}
              onChange={(event) => onChange({ ...value, amount: event.target.value })}
              className="field-input tnum"
            />
            <p className="field-hint">A partial refund is allowed, up to what was collected.</p>
          </div>

          <div>
            <label htmlFor="refund-reference" className="field-label">
              Gateway reference
            </label>
            <input
              id="refund-reference"
              maxLength={120}
              value={value.reference}
              onChange={(event) => onChange({ ...value, reference: event.target.value })}
              className="field-input font-mono text-sm"
              placeholder="The refund id from the dashboard"
            />
          </div>

          <div>
            <label htmlFor="refund-note" className="field-label">
              Reason
            </label>
            <input
              id="refund-note"
              maxLength={300}
              value={value.note}
              onChange={(event) => onChange({ ...value, note: event.target.value })}
              className="field-input"
              placeholder="Jar arrived cracked"
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
