import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { Modal, PageHeader } from '../../components/admin/AdminPage';
import { useFetch, useMutation } from '../../hooks/useApi';
import { applyFieldErrors, del, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';

/**
 * Categories.
 *
 * A flat list rather than a drag-and-drop tree. Nesting is supported by the model
 * (`parent`), so the form offers a parent select, but an achar catalogue has perhaps a
 * dozen categories and a sortable tree would be more machinery than the problem needs.
 *
 * `order` is a plain number field for the same reason: typing 20 is faster than dragging
 * a row past nineteen others.
 */

const BLANK = {
  name: '',
  nameNp: '',
  slug: '',
  description: '',
  icon: '',
  parent: '',
  order: 0,
  isActive: true,
  isFeatured: false,
};

export default function AdminCategories() {
  const [editing, setEditing] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const toast = useToast();

  useSeo({ title: 'Categories · Admin', noIndex: true });

  const { data, loading, error, refetch } = useFetch('/categories', {
    params: { includeInactive: true },
  });

  const categories = data?.categories ?? [];

  const remove = useMutation((id) => del(`/categories/${id}`), {
    onSuccess: () => {
      toast.success('Category deleted');
      setPendingDelete(null);
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  const recount = useMutation(() => post('/categories/recount'), {
    onSuccess: () => {
      toast.success('Product counts recalculated');
      refetch();
    },
    onError: (normalised) => toast.error(normalised.message),
  });

  if (loading && !data) return <PageLoader label="Loading categories" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader
        title="Categories"
        description="How the shop is grouped. A category with products cannot be deleted until they are moved."
        actions={
          <>
            <button
              type="button"
              onClick={() => recount.run()}
              disabled={recount.pending}
              className="btn-outline btn-sm"
              title="Recalculate how many products sit in each category"
            >
              {recount.pending ? <Spinner className="size-4" /> : <Icon name="refresh" className="size-4" />}
              Recount
            </button>
            <button type="button" onClick={() => setEditing(BLANK)} className="btn-primary btn-sm">
              <Icon name="plus" className="size-4" />
              New category
            </button>
          </>
        }
      />

      {categories.length ? (
        <div className="card overflow-x-auto">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" className="hidden sm:table-cell">
                  Slug
                </th>
                <th scope="col">Products</th>
                <th scope="col" className="hidden md:table-cell">
                  Order
                </th>
                <th scope="col">Status</th>
                <th scope="col" className="sr-only">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((category) => (
                <tr key={category._id}>
                  <td>
                    <div className="flex items-center gap-2.5">
                      {category.image?.url ? (
                        <img
                          src={category.image.url}
                          alt=""
                          loading="lazy"
                          className="bg-cream-200 size-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="bg-cream-200 grid size-9 shrink-0 place-items-center rounded-lg text-base">
                          {category.icon || <Icon name="tag" className="text-ink-400 size-4" />}
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-ink-900 truncate font-medium">{category.name}</p>
                        {category.nameNp ? (
                          <p className="text-ink-400 truncate text-xs">{category.nameNp}</p>
                        ) : null}
                      </div>
                    </div>
                  </td>

                  <td className="text-ink-500 hidden font-mono text-xs sm:table-cell">
                    {category.slug}
                  </td>

                  <td className="tnum text-sm">{category.productCount ?? 0}</td>

                  <td className="tnum text-ink-500 hidden text-sm md:table-cell">
                    {category.order ?? 0}
                  </td>

                  <td>
                    <div className="flex flex-wrap gap-1">
                      {category.isActive ? (
                        <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                          Live
                        </span>
                      ) : (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                          Hidden
                        </span>
                      )}
                      {category.isFeatured ? (
                        <span className="badge border-mustard-200 bg-mustard-50 text-mustard-800 border">
                          Featured
                        </span>
                      ) : null}
                    </div>
                  </td>

                  <td>
                    <div className="flex items-center justify-end gap-0.5">
                      <button
                        type="button"
                        onClick={() =>
                          setEditing({
                            ...category,
                            parent: category.parent ? String(category.parent) : '',
                            description: category.description ?? '',
                            nameNp: category.nameNp ?? '',
                            icon: category.icon ?? '',
                          })
                        }
                        className="btn-ghost btn-sm size-8 px-0"
                        title="Edit"
                      >
                        <Icon name="edit" className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(category)}
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
      ) : (
        <div className="card">
          <EmptyState
            icon="tag"
            title="No categories yet"
            description="Group your products so the shop can be browsed - Achar, Chutney, Gundruk, and so on."
            action="Add a category"
            onAction={() => setEditing(BLANK)}
          />
        </div>
      )}

      <CategoryModal
        value={editing}
        siblings={categories}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          refetch();
        }}
      />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this category?"
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
          <strong className="text-ink-900">{pendingDelete?.name}</strong> will be removed.
        </p>
        {pendingDelete?.productCount ? (
          <p className="text-mustard-800 bg-mustard-50 border-mustard-200 mt-2 rounded-lg border p-2.5 text-sm">
            It still holds {pendingDelete.productCount} product
            {pendingDelete.productCount === 1 ? '' : 's'}. Move them to another category first —
            the server will refuse this otherwise.
          </p>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * Create and edit share one dialog. `slug` is left blank on create so the server derives
 * it from the name; on edit it is shown, because changing a live slug breaks inbound
 * links and that should be a deliberate act rather than a side effect of a rename.
 */
function CategoryModal({ value, siblings, onClose, onSaved }) {
  const isEdit = Boolean(value?._id);
  const toast = useToast();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: BLANK });

  useEffect(() => {
    if (value) reset({ ...BLANK, ...value });
  }, [value, reset]);

  const onSubmit = async (form) => {
    const body = {
      ...form,
      order: Number(form.order) || 0,
      // An empty select means "top level", which the schema expects as null - not ''.
      parent: form.parent || null,
    };
    if (!body.slug) delete body.slug;

    try {
      if (isEdit) await patch(`/categories/${value._id}`, body);
      else await post('/categories', body);
      toast.success(isEdit ? 'Category updated' : 'Category created');
      onSaved();
    } catch (error) {
      const normalised = error?.normalised;
      if (!applyFieldErrors(normalised, setError)) {
        toast.error(normalised?.message ?? 'Could not save the category');
      }
    }
  };

  return (
    <Modal
      open={Boolean(value)}
      onClose={onClose}
      title={isEdit ? `Edit ${value?.name}` : 'New category'}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-outline btn-sm">
            Cancel
          </button>
          <button
            type="submit"
            form="category-form"
            disabled={isSubmitting}
            className="btn-primary btn-sm"
          >
            {isSubmitting ? <Spinner className="size-4" /> : null}
            {isEdit ? 'Save changes' : 'Create category'}
          </button>
        </>
      }
    >
      <form id="category-form" onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="cat-name" className="field-label">
              Name
            </label>
            <input
              id="cat-name"
              {...register('name', { required: 'Give the category a name' })}
              className="field-input"
              autoComplete="off"
            />
            {errors.name ? <p className="field-error">{errors.name.message}</p> : null}
          </div>

          <div>
            <label htmlFor="cat-nameNp" className="field-label">
              Name in Nepali <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input id="cat-nameNp" {...register('nameNp')} className="field-input" lang="ne" />
          </div>
        </div>

        {isEdit ? (
          <div>
            <label htmlFor="cat-slug" className="field-label">
              URL slug
            </label>
            <input id="cat-slug" {...register('slug')} className="field-input font-mono text-sm" />
            <p className="field-hint">
              Changing this breaks any existing link to /category/{value?.slug}.
            </p>
            {errors.slug ? <p className="field-error">{errors.slug.message}</p> : null}
          </div>
        ) : null}

        <div>
          <label htmlFor="cat-description" className="field-label">
            Description
          </label>
          <textarea
            id="cat-description"
            rows={3}
            maxLength={600}
            {...register('description')}
            className="field-input"
            placeholder="Shown at the top of the category page and used for its meta description."
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="cat-icon" className="field-label">
              Icon
            </label>
            <input
              id="cat-icon"
              maxLength={8}
              {...register('icon')}
              className="field-input"
              placeholder="🥒"
            />
            <p className="field-hint">One emoji.</p>
          </div>

          <div>
            <label htmlFor="cat-parent" className="field-label">
              Parent
            </label>
            <select id="cat-parent" {...register('parent')} className="field-input">
              <option value="">Top level</option>
              {siblings
                .filter((option) => option._id !== value?._id)
                .map((option) => (
                  <option key={option._id} value={option._id}>
                    {option.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label htmlFor="cat-order" className="field-label">
              Sort order
            </label>
            <input
              id="cat-order"
              type="number"
              min={0}
              max={999}
              step={1}
              {...register('order')}
              className="field-input tnum"
            />
            <p className="field-hint">Lower shows first.</p>
          </div>
        </div>

        <div className="border-cream-300 space-y-2 rounded-xl border p-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" {...register('isActive')} className="size-4 cursor-pointer" />
            Show on the shop
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" {...register('isFeatured')} className="size-4 cursor-pointer" />
            Feature on the homepage
          </label>
        </div>
      </form>
    </Modal>
  );
}
