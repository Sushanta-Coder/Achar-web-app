import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/ui/Icon';
import EmptyState, { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { SkeletonRows } from '../../components/ui/Spinner';
import { DetailRow, FilterBar, Modal, PageHeader, Pagination, TabBar } from '../../components/admin/AdminPage';
import { useDebounced, useFetch } from '../../hooks/useApi';
import { del, patch } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { formatDateTime, formatNumber, formatRelative } from '../../lib/format';

/**
 * Contact messages and newsletter subscribers.
 *
 * Two things on one screen because they are the same job - the inbox - and neither is big
 * enough to earn a page. The subscriber list is behind a tab rather than a separate route so
 * an export is one click from where the messages are.
 *
 * Opening a message does not mark it read. Marking something read is a decision ("I have dealt
 * with this"), and having it happen as a side effect of a glance is how replies get missed.
 */

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'read', label: 'Read' },
  { value: 'replied', label: 'Replied' },
  { value: 'archived', label: 'Archived' },
];

const STATUS_STYLES = {
  new: 'border-brand-200 bg-brand-50 text-brand-800',
  read: 'border-cream-400 bg-cream-200 text-ink-600',
  replied: 'border-leaf-200 bg-leaf-100 text-leaf-800',
  archived: 'border-cream-400 bg-cream-100 text-ink-400',
};

export default function AdminMessages() {
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('messages');
  const [search, setSearch] = useState(params.get('q') ?? '');
  const debouncedSearch = useDebounced(search);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useSeo({ title: 'Messages · Admin', noIndex: true });

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

  const messages = useFetch('/contact/admin/messages', {
    params: query,
    skip: view !== 'messages',
    deps: [view],
  });

  const subscribers = useFetch('/contact/admin/subscribers', {
    params: { page, limit: 50, ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}) },
    skip: view !== 'subscribers',
    deps: [view],
  });

  const rows = messages.data?.messages ?? [];

  const openMessage = (message) => {
    setOpen(message);
    setNote(message.adminNote ?? '');
  };

  const update = async (id, body, successMessage) => {
    setBusy(true);
    try {
      await patch(`/contact/admin/messages/${id}`, body);
      toast.success(successMessage);
      messages.refetch();
      setOpen(null);
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not update the message');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id) => {
    setBusy(true);
    try {
      await del(`/contact/admin/messages/${id}`);
      toast.success('Message deleted');
      setOpen(null);
      messages.refetch();
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not delete the message');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Messages"
        description="The contact form inbox and the newsletter list."
        actions={
          <div className="border-cream-300 flex overflow-hidden rounded-lg border bg-white">
            {[
              { value: 'messages', label: 'Inbox' },
              { value: 'subscribers', label: 'Subscribers' },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setView(option.value)}
                aria-current={view === option.value ? 'true' : undefined}
                className={`cursor-pointer px-3 py-2 text-xs font-medium transition ${
                  view === option.value ? 'bg-ink-800 text-white' : 'text-ink-600 hover:bg-cream-100'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      {view === 'messages' ? (
        <>
          <TabBar
            tabs={STATUS_TABS}
            active={status}
            onChange={(value) => setFilter({ status: value })}
            counts={messages.data?.counts}
          />

          <FilterBar
            value={search}
            onChange={setSearch}
            placeholder="Name, email or subject…"
            onReset={search ? () => { setSearch(''); setFilter({ q: '' }); } : undefined}
          />

          {messages.error ? <ErrorState error={messages.error} onRetry={messages.refetch} /> : null}

          {!messages.error && messages.loading ? (
            <div className="card p-4">
              <SkeletonRows rows={6} columns={4} />
            </div>
          ) : null}

          {!messages.error && !messages.loading && !rows.length ? (
            <div className="card">
              <EmptyState
                icon="mail"
                title={search ? 'Nothing matched that' : 'Nothing in the inbox'}
                description={
                  search
                    ? 'Try a shorter search or a different tab.'
                    : 'Messages from the Contact page arrive here.'
                }
              />
            </div>
          ) : null}

          {!messages.error && !messages.loading && rows.length ? (
            <>
              <ul className="divide-cream-200 card divide-y overflow-hidden">
                {rows.map((message) => (
                  <li key={message._id}>
                    <button
                      type="button"
                      onClick={() => openMessage(message)}
                      className="hover:bg-cream-50 flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition"
                    >
                      <span
                        className={`badge shrink-0 border capitalize ${
                          STATUS_STYLES[message.status] ?? STATUS_STYLES.read
                        }`}
                      >
                        {message.status}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-baseline gap-x-2">
                          <span
                            className={`truncate text-sm ${
                              message.status === 'new' ? 'font-semibold' : 'font-medium'
                            }`}
                          >
                            {message.subject}
                          </span>
                          <span className="text-ink-400 text-xs">
                            {message.name} · {message.email}
                          </span>
                        </span>
                        <span className="text-ink-500 mt-0.5 line-clamp-1 block text-sm">
                          {message.message}
                        </span>
                      </span>

                      <span className="text-ink-400 shrink-0 text-xs whitespace-nowrap">
                        {formatRelative(message.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              <Pagination
                meta={messages.data.meta}
                onPage={(next) => setFilter({ page: next }, { keepPage: true })}
                className="mt-4"
              />
            </>
          ) : null}
        </>
      ) : (
        <>
          <FilterBar
            value={search}
            onChange={setSearch}
            placeholder="Email…"
            onReset={search ? () => setSearch('') : undefined}
          >
            <a href="/api/contact/admin/subscribers/export" className="btn-outline btn-sm">
              <Icon name="download" className="size-4" />
              Export CSV
            </a>
          </FilterBar>

          {subscribers.error ? (
            <ErrorState error={subscribers.error} onRetry={subscribers.refetch} />
          ) : null}

          {!subscribers.error && subscribers.loading ? (
            <div className="card p-4">
              <SkeletonRows rows={8} columns={3} />
            </div>
          ) : null}

          {!subscribers.error && !subscribers.loading ? (
            <>
              <p className="text-ink-500 mb-3 text-sm">
                <span className="text-ink-800 font-semibold">
                  {formatNumber(subscribers.data?.activeTotal ?? 0)}
                </span>{' '}
                active subscriber(s).
              </p>

              {subscribers.data?.subscribers?.length ? (
                <>
                  <div className="card overflow-x-auto">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th scope="col">Email</th>
                          <th scope="col" className="hidden sm:table-cell">
                            Name
                          </th>
                          <th scope="col" className="hidden md:table-cell">
                            Source
                          </th>
                          <th scope="col">Subscribed</th>
                          <th scope="col">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subscribers.data.subscribers.map((subscriber) => (
                          <tr key={subscriber._id}>
                            <td className="text-sm break-all">{subscriber.email}</td>
                            <td className="text-ink-500 hidden text-sm sm:table-cell">
                              {subscriber.name || '—'}
                            </td>
                            <td className="text-ink-400 hidden text-xs md:table-cell">
                              {subscriber.source || '—'}
                            </td>
                            <td className="text-ink-500 text-xs whitespace-nowrap">
                              {formatDateTime(subscriber.createdAt)}
                            </td>
                            <td>
                              {subscriber.isActive ? (
                                <span className="badge border-leaf-200 bg-leaf-100 text-leaf-800 border">
                                  Active
                                </span>
                              ) : (
                                <span className="badge border-cream-400 bg-cream-200 text-ink-600 border">
                                  Unsubscribed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <Pagination
                    meta={subscribers.data.meta}
                    onPage={(next) => setFilter({ page: next }, { keepPage: true })}
                    className="mt-4"
                  />
                </>
              ) : (
                <div className="card">
                  <EmptyState
                    icon="mail"
                    title="No subscribers yet"
                    description="The footer sign-up form adds people here."
                  />
                </div>
              )}
            </>
          ) : null}
        </>
      )}

      <Modal
        open={Boolean(open)}
        onClose={() => setOpen(null)}
        title={open?.subject ?? 'Message'}
        size="lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => remove(open._id)}
              disabled={busy}
              className="btn-ghost btn-sm mr-auto text-red-600"
            >
              <Icon name="trash" className="size-4" />
              Delete
            </button>
            <button
              type="button"
              onClick={() => update(open._id, { status: 'archived', adminNote: note }, 'Archived')}
              disabled={busy}
              className="btn-outline btn-sm"
            >
              Archive
            </button>
            <button
              type="button"
              onClick={() =>
                update(
                  open._id,
                  { status: open.status === 'replied' ? 'read' : 'replied', adminNote: note },
                  open.status === 'replied' ? 'Marked as read' : 'Marked as replied'
                )
              }
              disabled={busy}
              className="btn-primary btn-sm"
            >
              {busy ? <Spinner className="size-4" /> : null}
              {open?.status === 'replied' ? 'Mark unreplied' : 'Mark replied'}
            </button>
          </>
        }
      >
        {open ? (
          <div className="space-y-3">
            <dl className="border-cream-300 bg-cream-50 rounded-xl border px-3 py-1.5">
              <DetailRow label="From">{open.name}</DetailRow>
              <DetailRow label="Email">
                <a href={`mailto:${open.email}`} className="hover:text-brand-700 break-all">
                  {open.email}
                </a>
              </DetailRow>
              {open.phone ? (
                <DetailRow label="Phone">
                  <a href={`tel:${open.phone}`} className="tnum hover:text-brand-700">
                    {open.phone}
                  </a>
                </DetailRow>
              ) : null}
              <DetailRow label="Received">{formatDateTime(open.createdAt)}</DetailRow>
            </dl>

            <div>
              <p className="field-label">Message</p>
              <p className="text-ink-700 text-sm whitespace-pre-line">{open.message}</p>
            </div>

            <div>
              <label htmlFor="message-note" className="field-label">
                Internal note
              </label>
              <textarea
                id="message-note"
                rows={3}
                maxLength={1000}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="field-input"
                placeholder="Called back on Tuesday, wants 5 jars for a wedding."
              />
              <p className="field-hint">Saved with whichever button you press. Never sent out.</p>
            </div>

            <a href={`mailto:${open.email}?subject=Re: ${encodeURIComponent(open.subject)}`} className="btn-outline btn-sm">
              <Icon name="mail" className="size-4" />
              Reply by email
            </a>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
