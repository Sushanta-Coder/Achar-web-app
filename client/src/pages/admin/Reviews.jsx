import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import { Modal, PageHeader, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useFetch } from '../../hooks/useApi';
import { del, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDateTime } from '../../lib/format';

/**
 * Review moderation.
 *
 * Pending is the default tab because an unapproved review is invisible on the shop - leaving
 * one unread is the same as deleting it, only slower.
 *
 * Approving or rejecting recalculates the product's rating server-side, so the average on the
 * storefront can never include a review that is not visible.
 *
 * An admin response is published alongside the review. The moderation note is not - it exists
 * so a colleague can see why something was rejected.
 */

const STATUS_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

export default function AdminReviews() {
  const [params, setParams] = useSearchParams();
  const [moderating, setModerating] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Reviews · Admin', noIndex: true });

  const status = params.get('status') ?? 'pending';
  const page = Number(params.get('page') ?? 1);

  const setFilter = (patchValues, { keepPage = false } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchValues)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!keepPage) next.delete('page');
    setParams(next, { replace: true });
  };

  const query = useMemo(() => ({ page, limit: 20, status }), [page, status]);

  const { data, loading, error, refetch } = useFetch('/reviews/admin/list', { params: query });
  const reviews = data?.reviews ?? [];

  const moderate = async ({ id, nextStatus, moderationNote, adminResponse }) => {
    setBusy(true);
    try {
      await patch(`/reviews/admin/${id}`, {
        status: nextStatus,
        moderationNote: moderationNote || undefined,
        adminResponse: adminResponse || undefined,
      });
      toast.success(nextStatus === 'approved' ? 'Review published' : 'Review rejected');
      setModerating(null);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not moderate the review');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await del(`/reviews/admin/${pendingDelete._id}`);
      toast.success('Review deleted');
      setPendingDelete(null);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not delete the review');
    } finally {
      setBusy(false);
    }
  };

  const recalculate = async () => {
    try {
      const result = await post('/reviews/admin/recalculate');
      toast.success(`${result.updated} product rating(s) recalculated`);
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not recalculate ratings');
    }
  };

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Nothing appears on the shop until it is approved. Ratings are recalculated on every decision."
        actions={
          <button type="button" onClick={recalculate} className="btn-outline btn-sm">
            <Icon name="refresh" className="size-4" />
            Recalculate ratings
          </button>
        }
      />

      <TabBar
        tabs={STATUS_TABS}
        active={status}
        onChange={(value) => setFilter({ status: value })}
        counts={data?.counts}
      />

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={5} columns={3} />
        </div>
      ) : null}

      {!error && !loading && !reviews.length ? (
        <div className="card">
          <EmptyState
            icon="star"
            title={status === 'pending' ? 'Nothing waiting' : `No ${status} reviews`}
            description={
              status === 'pending'
                ? 'Every review has been dealt with. New ones land here as customers write them.'
                : 'Switch tabs to see reviews in another state.'
            }
          />
        </div>
      ) : null}

      {!error && !loading && reviews.length ? (
        <>
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review._id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Stars rating={review.rating} />
                      <span className="tnum text-ink-500 text-sm">{review.rating}/5</span>
                      {review.isVerifiedPurchase ? (
                        <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border text-[0.6875rem]">
                          <Icon name="checkCircle" className="size-3" />
                          Verified buyer
                        </span>
                      ) : (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border text-[0.6875rem]">
                          Not a recorded purchase
                        </span>
                      )}
                    </div>

                    {review.title ? (
                      <p className="mt-1.5 text-sm font-semibold">{review.title}</p>
                    ) : null}

                    <p className="text-ink-700 mt-1 text-sm whitespace-pre-line">{review.comment}</p>

                    <p className="text-ink-400 mt-2 text-xs">
                      {review.userName ?? 'Anonymous'} · {formatDateTime(review.createdAt)}
                      {review.product?.slug ? (
                        <>
                          {' · '}
                          <Link
                            to={`/product/${review.product.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-brand-700 underline"
                          >
                            {review.product.name}
                          </Link>
                        </>
                      ) : null}
                    </p>

                    {review.adminResponse ? (
                      <div className="border-brand-200 bg-brand-50 mt-2.5 rounded-lg border p-2.5">
                        <p className="text-brand-800 text-xs font-semibold">Our reply</p>
                        <p className="text-ink-700 mt-0.5 text-sm">{review.adminResponse}</p>
                      </div>
                    ) : null}

                    {review.moderationNote ? (
                      <p className="text-ink-400 mt-2 text-xs italic">
                        Internal note: {review.moderationNote}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    {review.status !== 'approved' ? (
                      <button
                        type="button"
                        onClick={() => moderate({ id: review._id, nextStatus: 'approved' })}
                        disabled={busy}
                        className="btn btn-sm bg-leaf-600 text-white hover:bg-leaf-700"
                      >
                        <Icon name="check" className="size-4" />
                        Approve
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setModerating({
                          ...review,
                          moderationNote: review.moderationNote ?? '',
                          adminResponse: review.adminResponse ?? '',
                        })
                      }
                      className="btn-outline btn-sm"
                    >
                      <Icon name="note" className="size-4" />
                      Reply
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(review)}
                      className="btn-ghost btn-sm size-8 px-0 text-red-600"
                      title="Delete"
                    >
                      <Icon name="trash" className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <Pagination
            meta={data.meta}
            onPage={(next) => setFilter({ page: next }, { keepPage: true })}
            className="mt-4"
          />
        </>
      ) : null}

      <ModerateModal
        value={moderating}
        busy={busy}
        onClose={() => setModerating(null)}
        onSubmit={moderate}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this review?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)} className="btn-outline btn-sm">
              Keep it
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {busy ? <Spinner className="size-4" /> : null}
              Delete
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          This removes the review permanently and recalculates the product rating. Rejecting it
          instead keeps a record of why it was not published.
        </p>
      </Modal>
    </>
  );
}

function Stars({ rating = 0 }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Icon
          key={star}
          name="star"
          className={`size-4 ${star <= rating ? 'text-mustard-500' : 'text-cream-300'}`}
        />
      ))}
    </span>
  );
}

/** Reply and/or set a status. Both in one dialog because they are usually one decision. */
function ModerateModal({ value, busy, onClose, onSubmit }) {
  const [adminResponse, setAdminResponse] = useState('');
  const [moderationNote, setModerationNote] = useState('');
  const [nextStatus, setNextStatus] = useState('approved');

  // Seeded when the dialog opens rather than in an effect: `value` changing to a new review
  // is the only time these should reset, and keying off it here keeps that obvious.
  const key = value?._id;
  const [seeded, setSeeded] = useState(null);
  if (key && seeded !== key) {
    setSeeded(key);
    setAdminResponse(value.adminResponse ?? '');
    setModerationNote(value.moderationNote ?? '');
    setNextStatus(value.status === 'rejected' ? 'rejected' : 'approved');
  }

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title="Reply to this review"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              onSubmit({ id: value._id, nextStatus, moderationNote, adminResponse })
            }
            className="btn-primary btn-sm"
          >
            {busy ? <Spinner className="size-4" /> : null}
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label htmlFor="review-status" className="field-label">
            Decision
          </label>
          <select
            id="review-status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value)}
            className="field-input"
          >
            <option value="approved">Approve — show on the shop</option>
            <option value="rejected">Reject — keep hidden</option>
            <option value="pending">Leave pending</option>
          </select>
        </div>

        <div>
          <label htmlFor="review-response" className="field-label">
            Public reply <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <textarea
            id="review-response"
            rows={3}
            maxLength={1000}
            value={adminResponse}
            onChange={(event) => setAdminResponse(event.target.value)}
            className="field-input"
            placeholder="Thank you for the feedback — we have passed this to the kitchen."
          />
          <p className="field-hint">Shown under the review on the product page.</p>
        </div>

        <div>
          <label htmlFor="review-note" className="field-label">
            Internal note <span className="text-ink-400 font-normal">(optional)</span>
          </label>
          <input
            id="review-note"
            maxLength={300}
            value={moderationNote}
            onChange={(event) => setModerationNote(event.target.value)}
            className="field-input"
            placeholder="Rejected — names a competitor"
          />
          <p className="field-hint">Never shown to customers.</p>
        </div>
      </div>
    </Modal>
  );
}
