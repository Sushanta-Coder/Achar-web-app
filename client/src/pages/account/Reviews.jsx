import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon, { Stars } from '../../components/ui/Icon';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import { Modal, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useToast } from '../../context/ToastContext';
import { useFetch } from '../../hooks/useApi';
import { apiError, del, patch, post } from '../../lib/apiClient';
import { formatDate } from '../../lib/format';

/**
 * The customer's reviews, plus the jars they have received and not yet written about.
 *
 * Two endpoints, two tabs, and a deliberate omission: no photo upload. `POST /reviews`
 * accepts image URLs, but the upload route is staff-only, so there is no honest way for a
 * customer to produce one. A file picker that could not actually upload anything would be
 * worse than not offering it.
 *
 * The important thing this page has to communicate is moderation. A new review is
 * `pending` until a moderator approves it (unless the shop has turned on auto-approve),
 * and *editing an approved review returns it to pending* - the server does that so an
 * approved review cannot be quietly rewritten afterwards. Both facts are stated where
 * they apply, because a customer who cannot find their review on the product page
 * otherwise assumes it was lost.
 */

const TABS = [
  { value: 'pending', label: 'To review' },
  { value: 'mine', label: 'Your reviews' },
];

const STATUS_LABELS = {
  pending: 'Being checked',
  approved: 'Published',
  rejected: 'Not published',
};

const STATUS_TONES = {
  pending: 'bg-mustard-100 text-mustard-900 border-mustard-200',
  approved: 'bg-leaf-100 text-leaf-800 border-leaf-200',
  rejected: 'bg-red-100 text-red-800 border-red-200',
};

export default function Reviews() {
  const toast = useToast();
  const [tab, setTab] = useState('pending');
  const [page, setPage] = useState(1);

  /** `composing` holds either a reviewable product (new) or an existing review (edit). */
  const [composing, setComposing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [removePending, setRemovePending] = useState(false);

  const waiting = useFetch('/reviews/reviewable');
  const mine = useFetch('/reviews/mine', { params: { page, limit: 10 } });

  const products = waiting.data?.products ?? [];
  const reviews = mine.data?.reviews ?? [];

  const refreshBoth = () => {
    waiting.refetch();
    mine.refetch();
  };

  const remove = async () => {
    setRemovePending(true);
    try {
      await del(`/reviews/${removing._id}`);
      setRemoving(null);
      toast.success('Your review has been removed');
      refreshBoth();
    } catch (caught) {
      toast.error(apiError(caught).message);
    } finally {
      setRemovePending(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl sm:text-3xl">Reviews</h1>
      <p className="text-ink-500 mt-1 text-sm">
        Tell other customers what an achar is actually like. It helps more than you think.
      </p>

      <div className="mt-5">
        <TabBar
          tabs={TABS}
          active={tab}
          onChange={setTab}
          counts={{ pending: products.length, mine: mine.data?.meta?.total ?? 0 }}
        />
      </div>

      {tab === 'pending' ? (
        waiting.error ? (
          <div className="card p-5">
            <ErrorState error={waiting.error} onRetry={waiting.refetch} />
          </div>
        ) : waiting.loading ? (
          <div className="card p-4">
            <SkeletonRows rows={3} columns={2} />
          </div>
        ) : products.length ? (
          <ul className="space-y-3">
            {products.map((product) => (
              <li key={product.productId} className="card flex flex-wrap items-center gap-3 p-4">
                <Thumb image={product.image} />
                <div className="min-w-0 flex-1">
                  <Link to={`/product/${product.slug}`} className="font-medium hover:underline">
                    {product.name}
                  </Link>
                  <p className="text-ink-400 text-xs">
                    Delivered {formatDate(product.deliveredAt)} · {product.orderNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setComposing({ kind: 'new', product })}
                  className="btn-primary btn-sm"
                >
                  <Icon name="star" className="size-4" />
                  Write a review
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="card">
            <EmptyState
              icon="star"
              title="Nothing waiting"
              description="Once an order has been delivered, the jars in it turn up here to review."
              action="Browse the pickles"
              actionTo="/shop"
            />
          </div>
        )
      ) : mine.error ? (
        <div className="card p-5">
          <ErrorState error={mine.error} onRetry={mine.refetch} />
        </div>
      ) : mine.loading ? (
        <div className="card p-4">
          <SkeletonRows rows={4} columns={3} />
        </div>
      ) : reviews.length ? (
        <>
          <ul className="space-y-3">
            {reviews.map((review) => (
              <ReviewCard
                key={review._id}
                review={review}
                onEdit={() => setComposing({ kind: 'edit', review })}
                onRemove={() => setRemoving(review)}
              />
            ))}
          </ul>
          <Pagination meta={mine.data.meta} onPage={setPage} className="mt-5" />
        </>
      ) : (
        <div className="card">
          <EmptyState
            icon="star"
            title="You have not reviewed anything yet"
            description="Anything you have had delivered is waiting on the other tab."
            action={
              <button type="button" onClick={() => setTab('pending')} className="btn-primary">
                See what you can review
              </button>
            }
          />
        </div>
      )}

      <Modal
        open={Boolean(composing)}
        onClose={() => setComposing(null)}
        title={composing?.kind === 'edit' ? 'Edit your review' : 'Write a review'}
        size="lg"
      >
        {composing ? (
          <ReviewForm
            key={composing.review?._id ?? composing.product?.productId}
            composing={composing}
            onDone={(message) => {
              setComposing(null);
              toast.success(message);
              refreshBoth();
            }}
          />
        ) : null}
      </Modal>

      <Modal
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this review?"
        footer={
          <>
            <button type="button" onClick={() => setRemoving(null)} className="btn-outline">
              Keep it
            </button>
            <button type="button" onClick={remove} className="btn-danger" disabled={removePending}>
              {removePending ? <Spinner className="size-4" /> : null}
              Remove
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          Your review of{' '}
          <span className="font-medium">{removing?.product?.name ?? 'this product'}</span> will be
          deleted and the product&apos;s average rating recalculated. You can write a new one
          afterwards.
        </p>
      </Modal>
    </div>
  );
}

function ReviewCard({ review, onEdit, onRemove }) {
  const product = review.product;

  return (
    <li className="card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Thumb image={product?.thumbnail} />
        <div className="min-w-0 flex-1">
          {product ? (
            <Link to={`/product/${product.slug}`} className="font-medium hover:underline">
              {product.name}
            </Link>
          ) : (
            <span className="text-ink-500 font-medium italic">Product no longer listed</span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Stars value={review.rating} className="size-3.5" />
            <span
              className={`badge border ${STATUS_TONES[review.status] ?? 'bg-cream-200 text-ink-700 border-cream-400'}`}
            >
              {STATUS_LABELS[review.status] ?? review.status}
            </span>
            <span className="text-ink-400 text-xs">{formatDate(review.createdAt)}</span>
          </div>
        </div>
      </div>

      {review.title ? <p className="mt-3 font-medium">{review.title}</p> : null}
      <p className="text-ink-600 mt-1 text-sm whitespace-pre-line">{review.comment}</p>

      {review.status === 'pending' ? (
        <p className="text-ink-400 mt-2 text-xs">
          Waiting to be checked. It appears on the product page once approved.
        </p>
      ) : null}

      {/* The moderator's note is the only useful thing to say about a rejection. */}
      {review.status === 'rejected' && review.moderationNote ? (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {review.moderationNote}
        </p>
      ) : null}

      {review.adminResponse ? (
        <div className="border-cream-300 bg-cream-100 mt-3 rounded-lg border p-3">
          <p className="text-ink-500 text-xs font-semibold tracking-wide uppercase">
            Deeva Achar replied
          </p>
          <p className="text-ink-700 mt-1 text-sm">{review.adminResponse}</p>
        </div>
      ) : null}

      <div className="border-cream-200 mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
        {review.helpfulCount > 0 ? (
          <span className="text-ink-400 mr-2 text-xs">
            {review.helpfulCount} {review.helpfulCount === 1 ? 'person' : 'people'} found this
            helpful
          </span>
        ) : null}
        <button type="button" onClick={onEdit} className="btn-ghost btn-sm ml-auto">
          <Icon name="edit" className="size-3.5" />
          Edit
        </button>
        <button type="button" onClick={onRemove} className="btn-ghost btn-sm text-red-700">
          <Icon name="trash" className="size-3.5" />
          Remove
        </button>
      </div>
    </li>
  );
}

function ReviewForm({ composing, onDone }) {
  const editing = composing.kind === 'edit';
  const existing = composing.review;

  const [rating, setRating] = useState(editing ? existing.rating : 0);
  const [title, setTitle] = useState(editing ? (existing.title ?? '') : '');
  const [comment, setComment] = useState(editing ? existing.comment : '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const name = editing ? (existing.product?.name ?? 'this product') : composing.product.name;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldErrors({});

    const problems = {};
    if (!rating) problems.rating = 'Choose a rating';
    // The model requires at least four characters; catching it here beats a 500 from
    // Mongoose for a two-letter review.
    if (comment.trim().length < 4) problems.comment = 'A few words, at least';
    if (Object.keys(problems).length) {
      setFieldErrors(problems);
      return;
    }

    setPending(true);
    try {
      if (editing) {
        await patch(`/reviews/${existing._id}`, {
          rating,
          title: title.trim(),
          comment: comment.trim(),
        });
        onDone('Updated — it will reappear once it has been checked');
      } else {
        await post('/reviews', {
          productId: composing.product.productId,
          // Naming the order is what earns the "verified purchase" badge.
          orderId: composing.product.orderId,
          rating,
          title: title.trim(),
          comment: comment.trim(),
        });
        onDone('Thank you — your review has been submitted');
      }
    } catch (caught) {
      const normalised = apiError(caught);
      setFieldErrors(normalised.errors ?? {});
      if (!normalised.errors || !Object.keys(normalised.errors).length) {
        setError(normalised.message);
      }
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <p className="text-ink-500 text-sm">
        {editing ? 'Your review of' : 'How was'} <span className="text-ink-800 font-medium">{name}</span>
        {editing ? '' : '?'}
      </p>

      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <fieldset className="mt-4">
        <legend className="field-label">Your rating</legend>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              className="cursor-pointer rounded p-0.5"
              aria-label={`${value} ${value === 1 ? 'star' : 'stars'}`}
              aria-pressed={rating === value}
            >
              <Icon
                name="star"
                className={`size-7 ${value <= rating ? 'text-mustard-400' : 'text-cream-400'}`}
                fill="currentColor"
                strokeWidth={0}
              />
            </button>
          ))}
          {rating ? (
            <span className="text-ink-500 ml-2 text-sm">
              {['', 'Not for me', 'Just alright', 'Good', 'Really good', 'Would buy again'][rating]}
            </span>
          ) : null}
        </div>
        {fieldErrors.rating ? <p className="field-error">{fieldErrors.rating}</p> : null}
      </fieldset>

      <label className="mt-4 block">
        <span className="field-label">Headline</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          className="field-input"
          placeholder="Just the right amount of heat"
        />
        {fieldErrors.title ? (
          <span className="field-error">{fieldErrors.title}</span>
        ) : (
          <span className="field-hint">Optional</span>
        )}
      </label>

      <label className="mt-3 block">
        <span className="field-label">Your review</span>
        <textarea
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          rows={5}
          maxLength={1500}
          className="field-input"
          placeholder="Heat, texture, how you ate it, whether you would buy it again…"
        />
        {fieldErrors.comment ? (
          <span className="field-error">{fieldErrors.comment}</span>
        ) : (
          <span className="field-hint tnum">{1500 - comment.length} characters left</span>
        )}
      </label>

      <p className="text-ink-400 mt-3 text-xs">
        {editing
          ? 'Edited reviews go back for a quick check before they reappear.'
          : 'We read every review before it goes live, so give it a day or so.'}
      </p>

      <div className="border-cream-300 mt-5 flex justify-end gap-2 border-t pt-4">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? <Spinner className="size-4" /> : null}
          {editing ? 'Save changes' : 'Submit review'}
        </button>
      </div>
    </form>
  );
}

function Thumb({ image }) {
  return (
    <span className="bg-cream-200 size-14 shrink-0 overflow-hidden rounded-lg">
      {image?.url ? (
        <img
          src={image.url}
          alt={image.alt ?? ''}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : null}
    </span>
  );
}
