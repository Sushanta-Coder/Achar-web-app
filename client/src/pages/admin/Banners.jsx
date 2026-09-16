import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { Modal, PageHeader, TabBar } from '../../components/admin/AdminPage';
import ImageUploader from '../../components/admin/ImageUploader';
import { useFetch, useMutation } from '../../hooks/useApi';
import { applyFieldErrors, del, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDate, toDateInputValue } from '../../lib/format';

/**
 * Banners.
 *
 * `isLive` is computed by the model, not by comparing dates here: a banner can be active and
 * still not showing because its window has not opened yet, and that distinction is the whole
 * point of scheduling a Dashain promo in advance. The badge reports the model's answer.
 *
 * Reorder is up/down buttons rather than drag-and-drop. A hero carousel has three slides; a
 * drag library to move three things is not a trade worth making.
 *
 * A separate mobile image is optional. When it is absent the desktop one is used, which is
 * why the field is not required - a square-ish photo often works at both sizes.
 */

const POSITION_TABS = [
  { value: 'hero', label: 'Hero' },
  { value: 'promo', label: 'Promo' },
  { value: 'category', label: 'Category' },
  { value: 'sidebar', label: 'Sidebar' },
];

const BLANK = {
  title: '',
  titleNp: '',
  subtitle: '',
  link: '',
  ctaLabel: '',
  position: 'hero',
  order: 0,
  isActive: true,
  startsAt: '',
  endsAt: '',
};

export default function AdminBanners() {
  const [position, setPosition] = useState('hero');
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();

  useSeo({ title: 'Banners · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/banners/admin/list', {
    params: { position },
    deps: [position],
  });

  const banners = data?.banners ?? [];

  const remove = useMutation((id) => del(`/banners/admin/${id}`), {
    onSuccess: () => {
      toast.success('Banner deleted');
      setPendingDelete(null);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const toggle = useMutation((id) => patch(`/banners/admin/${id}/toggle`), {
    onSuccess: (result) => {
      toast.success(result.isActive ? 'Banner switched on' : 'Banner switched off');
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const reorder = useMutation((ids) => patch('/banners/admin/reorder', { position, ids }), {
    onSuccess: () => refetch(),
    onError: (normalised) => toast.error(normalised.message),
  });

  /** Swaps two neighbours and sends the whole order, so the server never has to infer intent. */
  const move = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= banners.length) return;
    const ids = banners.map((banner) => banner._id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.run(ids);
  };

  if (loading && !data) return <PageLoader label="Loading banners" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Banners"
        description="Homepage artwork. A banner shows only when it is switched on and inside its date window."
        actions={
          <button
            type="button"
            onClick={() => setEditing({ ...BLANK, position })}
            className="btn-primary btn-sm"
          >
            <Icon name="plus" className="size-4" />
            New banner
          </button>
        }
      />

      <TabBar tabs={POSITION_TABS} active={position} onChange={setPosition} />

      {banners.length ? (
        <ul className="space-y-3">
          {banners.map((banner, index) => (
            <li key={banner._id} className="card overflow-hidden">
              <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <img
                  src={banner.image?.desktop?.url}
                  alt={banner.image?.alt ?? ''}
                  loading="lazy"
                  className="bg-cream-200 h-24 w-full shrink-0 rounded-lg object-cover sm:w-44"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{banner.title}</p>
                    {banner.isLive ? (
                      <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                        Showing now
                      </span>
                    ) : banner.isActive ? (
                      <span className="badge border-mustard-200 bg-mustard-50 text-mustard-800 border">
                        Scheduled / expired
                      </span>
                    ) : (
                      <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                        Off
                      </span>
                    )}
                  </div>

                  {banner.subtitle ? (
                    <p className="text-ink-500 mt-0.5 line-clamp-2 text-sm">{banner.subtitle}</p>
                  ) : null}

                  <p className="text-ink-400 mt-1 text-xs">
                    {banner.link ? `→ ${banner.link}` : 'No link'}
                    {banner.startsAt || banner.endsAt ? (
                      <>
                        {' · '}
                        {banner.startsAt ? formatDate(banner.startsAt) : 'now'} →{' '}
                        {banner.endsAt ? formatDate(banner.endsAt) : 'no end'}
                      </>
                    ) : null}
                    {banner.image?.mobile?.url ? ' · has a mobile image' : ''}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0 || reorder.pending}
                    className="btn-ghost btn-sm size-8 px-0"
                    aria-label={`Move ${banner.title} up`}
                  >
                    <Icon name="arrowRight" className="size-4 -rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === banners.length - 1 || reorder.pending}
                    className="btn-ghost btn-sm size-8 px-0"
                    aria-label={`Move ${banner.title} down`}
                  >
                    <Icon name="arrowRight" className="size-4 rotate-90" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle.run(banner._id)}
                    disabled={toggle.pending}
                    className="btn-outline btn-sm"
                  >
                    {banner.isActive ? 'Switch off' : 'Switch on'}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditing({
                        ...banner,
                        subtitle: banner.subtitle ?? '',
                        titleNp: banner.titleNp ?? '',
                        link: banner.link ?? '',
                        ctaLabel: banner.ctaLabel ?? '',
                        startsAt: banner.startsAt ? toDateInputValue(banner.startsAt) : '',
                        endsAt: banner.endsAt ? toDateInputValue(banner.endsAt) : '',
                      })
                    }
                    className="btn-ghost btn-sm size-8 px-0"
                    title="Edit"
                  >
                    <Icon name="edit" className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(banner)}
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
      ) : (
        <div className="card">
          <EmptyState
            icon="image"
            title={`No ${position} banners`}
            description="The homepage falls back to the hero text in Site settings when there is nothing here."
            action="Add a banner"
            onAction={() => setEditing({ ...BLANK, position })}
          />
        </div>
      )}

      <BannerModal
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
        title="Delete this banner?"
        size="sm"
        footer={
          <>
            <button type="button" onClick={() => setPendingDelete(null)} className="btn-outline btn-sm">
              Keep it
            </button>
            <button
              type="button"
              onClick={() => remove.run(pendingDelete._id)}
              disabled={remove.pending}
              className="btn btn-sm bg-red-600 text-white hover:bg-red-700"
            >
              {remove.pending ? <Spinner className="size-4" /> : null}
              Delete
            </button>
          </>
        }
      >
        <p className="text-ink-600 text-sm">
          <strong className="text-ink-900">{pendingDelete?.title}</strong> will be removed. Switching
          it off instead keeps it for next season.
        </p>
      </Modal>
    </>
  );
}

function BannerModal({ value, onClose, onSaved }) {
  const isEdit = Boolean(value?._id);
  const toast = useToast();
  const [desktop, setDesktop] = useState([]);
  const [mobile, setMobile] = useState([]);
  const [imageError, setImageError] = useState('');

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: BLANK });

  useEffect(() => {
    if (!value) return;
    reset({ ...BLANK, ...value });
    setImageError('');
    setDesktop(
      value.image?.desktop?.url
        ? [{ ...value.image.desktop, alt: value.image.alt ?? '' }]
        : []
    );
    setMobile(
      value.image?.mobile?.url ? [{ ...value.image.mobile, alt: value.image.alt ?? '' }] : []
    );
  }, [value, reset]);

  const onSubmit = async (form) => {
    if (!desktop.length) {
      setImageError('A banner needs at least a desktop image.');
      return;
    }
    if (!desktop[0].alt?.trim()) {
      setImageError('Write alt text — it is read out when the image cannot be seen.');
      return;
    }
    setImageError('');

    const body = {
      title: form.title,
      titleNp: form.titleNp || undefined,
      subtitle: form.subtitle || undefined,
      link: form.link || undefined,
      ctaLabel: form.ctaLabel || undefined,
      position: form.position,
      order: Number(form.order) || 0,
      isActive: Boolean(form.isActive),
      // Alt text lives on the image object, shared by both sizes — the same picture at two
      // crops does not need two descriptions.
      image: {
        desktop: {
          url: desktop[0].url,
          ...(desktop[0].publicId ? { publicId: desktop[0].publicId } : {}),
        },
        ...(mobile.length
          ? {
              mobile: {
                url: mobile[0].url,
                ...(mobile[0].publicId ? { publicId: mobile[0].publicId } : {}),
              },
            }
          : {}),
        alt: desktop[0].alt,
      },
      startsAt: form.startsAt || (isEdit ? null : undefined),
      endsAt: form.endsAt || (isEdit ? null : undefined),
    };

    try {
      if (isEdit) await patch(`/banners/admin/${value._id}`, body);
      else await post('/banners/admin', body);
      toast.success(isEdit ? 'Banner saved' : `Banner "${form.title}" created`);
      onSaved();
    } catch (error) {
      const normalised = error?.normalised;
      if (!applyFieldErrors(normalised, setError)) {
        toast.error(normalised?.message ?? 'Could not save the banner');
      }
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isEdit ? `Edit ${value?.title}` : 'New banner'}
      size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="banner-form"
            disabled={isSubmitting}
            className="btn-primary btn-sm"
          >
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isEdit ? 'Save changes' : 'Create banner'}
          </button>
        </>
      }
    >
      <form id="banner-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="banner-title" className="field-label">
              Headline
            </label>
            <input
              id="banner-title"
              maxLength={120}
              {...register('title', { required: 'Give the banner a headline' })}
              className="field-input"
            />
            {errors.title ? <p className="field-error">{errors.title.message}</p> : null}
          </div>

          <div>
            <label htmlFor="banner-titleNp" className="field-label">
              Headline in Nepali <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input
              id="banner-titleNp"
              maxLength={120}
              {...register('titleNp')}
              className="field-input"
              lang="ne"
            />
          </div>
        </div>

        <div>
          <label htmlFor="banner-subtitle" className="field-label">
            Sub-heading
          </label>
          <input
            id="banner-subtitle"
            maxLength={200}
            {...register('subtitle')}
            className="field-input"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="banner-link" className="field-label">
              Link
            </label>
            <input
              id="banner-link"
              maxLength={300}
              {...register('link')}
              className="field-input"
              placeholder="/shop?category=achar"
            />
            <p className="field-hint">A path on this site, or a full URL.</p>
          </div>

          <div>
            <label htmlFor="banner-cta" className="field-label">
              Button label
            </label>
            <input
              id="banner-cta"
              maxLength={40}
              {...register('ctaLabel')}
              className="field-input"
              placeholder="Shop the range"
            />
          </div>
        </div>

        <div>
          <p className="field-label">Desktop image</p>
          <ImageUploader images={desktop} onChange={setDesktop} folder="banners" max={1} />
          {imageError ? <p className="field-error mt-1">{imageError}</p> : null}
        </div>

        <div>
          <p className="field-label">
            Mobile image <span className="text-ink-400 font-normal">(optional)</span>
          </p>
          <ImageUploader images={mobile} onChange={setMobile} folder="banners" max={1} />
          <p className="field-hint">
            Leave this empty to use the desktop image on phones. Add one when a wide crop loses
            the subject.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="banner-starts" className="field-label">
              Starts showing
            </label>
            <input
              id="banner-starts"
              type="date"
              {...register('startsAt')}
              className="field-input"
            />
            <p className="field-hint">Blank means immediately.</p>
          </div>

          <div>
            <label htmlFor="banner-ends" className="field-label">
              Stops showing
            </label>
            <input id="banner-ends" type="date" {...register('endsAt')} className="field-input" />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="banner-position" className="field-label">
              Position
            </label>
            <select id="banner-position" {...register('position')} className="field-input">
              {POSITION_TABS.map((tab) => (
                <option key={tab.value} value={tab.value}>
                  {tab.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="banner-order" className="field-label">
              Order
            </label>
            <input
              id="banner-order"
              type="number"
              min={0}
              max={999}
              step={1}
              {...register('order')}
              className="field-input tnum"
            />
          </div>
        </div>

        <label className="border-cream-300 flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-sm">
          <input type="checkbox" {...register('isActive')} className="size-4 cursor-pointer" />
          Switched on
        </label>
      </form>
    </Modal>
  );
}
