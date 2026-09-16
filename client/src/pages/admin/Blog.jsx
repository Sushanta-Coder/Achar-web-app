import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import { FilterBar, Modal, PageHeader, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useDebounced, useFetch } from '../../hooks/useApi';
import { del, patch } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDate, formatNumber } from '../../lib/format';

/**
 * Blog list.
 *
 * Unpublishing sends `keepPublishedAt: true`. Without it, pulling a post back to draft and
 * republishing it later would stamp it with today's date and shove it to the top of the blog as
 * if it were new - which is wrong for a recipe that has been up for a year and was briefly
 * edited.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'published', label: 'Published' },
  { value: 'draft', label: 'Drafts' },
];

export default function AdminBlog() {
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Blog · Admin', noIndex: true });

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
    if (params.get('category')) built.category = params.get('category');
    if (debouncedSearch.trim()) built.q = debouncedSearch.trim();
    return built;
  }, [page, status, params, debouncedSearch]);

  const { data, loading, error, refetch } = useFetch('/blog/admin/list', { params: query });
  const taxonomy = useFetch('/blog/taxonomy');

  const posts = data?.posts ?? [];

  const toggleStatus = async (post) => {
    const nextStatus = post.status === 'published' ? 'draft' : 'published';
    setBusy(true);
    try {
      await patch(`/blog/admin/${post._id}/status`, {
        status: nextStatus,
        // Preserve the original publication date so re-publishing does not re-date the post.
        keepPublishedAt: nextStatus === 'draft',
      });
      toast.success(nextStatus === 'published' ? 'Article published' : 'Moved back to draft');
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not change the status');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await del(`/blog/admin/${pendingDelete._id}`);
      toast.success('Article deleted');
      setPendingDelete(null);
      refetch();
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not delete the article');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Blog"
        description="Recipes and food writing. Every published article is in the sitemap, so it is a real SEO surface."
        actions={
          <Link to="/admin/blog/new" className="btn-primary btn-sm">
            <Icon name="plus" className="size-4" />
            New article
          </Link>
        }
      />

      <TabBar
        tabs={STATUS_TABS}
        active={status}
        onChange={(value) => setFilter({ status: value })}
        counts={data?.counts}
      />

      <FilterBar
        value={search}
        onChange={setSearch}
        placeholder="Title or excerpt…"
        onReset={
          search || params.get('category')
            ? () => {
                setSearch('');
                setFilter({ q: '', category: '' });
              }
            : undefined
        }
      >
        <select
          aria-label="Category"
          value={params.get('category') ?? ''}
          onChange={(event) => setFilter({ category: event.target.value })}
          className="field-input min-h-10 w-auto text-sm"
        >
          <option value="">All categories</option>
          {(taxonomy.data?.categories ?? []).map((row) => (
            <option key={row.category} value={row.category}>
              {row.category} ({row.count})
            </option>
          ))}
        </select>
      </FilterBar>

      {error ? <ErrorState error={error} onRetry={refetch} /> : null}

      {!error && loading ? (
        <div className="card p-4">
          <SkeletonRows rows={6} columns={5} />
        </div>
      ) : null}

      {!error && !loading && !posts.length ? (
        <div className="card">
          <EmptyState
            icon="note"
            title={search ? 'Nothing matched that' : 'No articles yet'}
            description={
              search
                ? 'Try fewer words, or check the Drafts tab.'
                : 'A recipe post is the cheapest way to earn search traffic for a food shop.'
            }
            action={search ? undefined : 'Write the first one'}
            actionTo={search ? undefined : '/admin/blog/new'}
          />
        </div>
      ) : null}

      {!error && !loading && posts.length ? (
        <>
          <div className="card overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Article</th>
                  <th scope="col" className="hidden md:table-cell">
                    Category
                  </th>
                  <th scope="col" className="hidden lg:table-cell text-right">
                    Views
                  </th>
                  <th scope="col" className="hidden sm:table-cell">
                    Published
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="sr-only">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post._id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        {post.featuredImage?.url ? (
                          <img
                            src={post.featuredImage.url}
                            alt=""
                            loading="lazy"
                            className="bg-cream-200 size-10 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="bg-cream-200 text-ink-400 grid size-10 shrink-0 place-items-center rounded-lg">
                            <Icon name="note" className="size-5" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <Link
                            to={`/admin/blog/${post._id}/edit`}
                            className="text-ink-900 hover:text-brand-700 block max-w-72 truncate font-medium"
                          >
                            {post.title}
                          </Link>
                          <p className="text-ink-400 truncate text-xs">
                            {post.readingMinutes ? `${post.readingMinutes} min read · ` : ''}
                            {post.slug}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="text-ink-500 hidden text-xs md:table-cell">{post.category}</td>

                    <td className="tnum text-ink-500 hidden text-right text-sm lg:table-cell">
                      {formatNumber(post.viewCount ?? 0)}
                    </td>

                    <td className="text-ink-500 hidden text-xs whitespace-nowrap sm:table-cell">
                      {post.publishedAt ? formatDate(post.publishedAt) : '—'}
                    </td>

                    <td>
                      {post.status === 'published' ? (
                        <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                          Published
                        </span>
                      ) : (
                        <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                          Draft
                        </span>
                      )}
                    </td>

                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          type="button"
                          onClick={() => toggleStatus(post)}
                          disabled={busy}
                          className="btn-outline btn-sm"
                        >
                          {post.status === 'published' ? 'Unpublish' : 'Publish'}
                        </button>
                        {post.status === 'published' ? (
                          <Link
                            to={`/blog/${post.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost btn-sm size-8 px-0"
                            title="View on the blog"
                          >
                            <Icon name="external" className="size-4" />
                          </Link>
                        ) : null}
                        <Link
                          to={`/admin/blog/${post._id}/edit`}
                          className="btn-ghost btn-sm size-8 px-0"
                          title="Edit"
                        >
                          <Icon name="edit" className="size-4" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(post)}
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

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete this article?"
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
          <strong className="text-ink-900">{pendingDelete?.title}</strong> will be removed
          permanently.
        </p>
        {pendingDelete?.status === 'published' ? (
          <p className="text-mustard-800 bg-mustard-50 border-mustard-200 mt-2 rounded-lg border p-2.5 text-sm">
            It is live and indexed. Anyone following a link to it will get a 404 — unpublishing
            instead keeps the option of bringing it back.
          </p>
        ) : null}
      </Modal>
    </>
  );
}
