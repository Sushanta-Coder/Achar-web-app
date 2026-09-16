import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import Spinner, { Skeleton } from '../components/ui/Spinner';
import EmptyState, { ErrorState } from '../components/ui/EmptyState';
import { Pagination } from '../components/admin/AdminPage';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { apiError, post } from '../lib/apiClient';
import { formatDate, localised } from '../lib/format';
import { breadcrumbJsonLd } from '../lib/seo';

/**
 * The journal - recipes, ingredients, and what we are pickling this season.
 *
 * Filters live in the query string for the same reason the shop's do: a category or tag
 * page has to be shareable and has to survive the back button. The taxonomy sidebar comes
 * from `/blog/taxonomy`, which counts only published posts whose date has passed, so a
 * scheduled article is invisible here including in the counts.
 *
 * The newsletter box posts to `/contact/subscribe`, which answers with the same success
 * message whether or not the address was already on the list. That is on purpose upstream -
 * a different reply would turn this form into a way to test whether someone is subscribed -
 * so the copy here never claims to know which of the two happened.
 */
export default function Blog() {
  const { locale } = useSettings();
  const [params, setParams] = useSearchParams();

  const page = Number(params.get('page') ?? 1);
  const category = params.get('category') ?? '';
  const tag = params.get('tag') ?? '';

  const list = useFetch('/blog', {
    params: {
      page,
      limit: 9,
      ...(category ? { category } : {}),
      ...(tag ? { tag } : {}),
    },
  });
  const taxonomy = useFetch('/blog/taxonomy');

  const posts = list.data?.posts ?? [];
  const categories = (taxonomy.data?.categories ?? []).filter((entry) => entry.count > 0);
  const tags = taxonomy.data?.tags ?? [];

  const setFilter = (patchValues) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patchValues)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in patchValues)) next.delete('page');
    setParams(next);
  };

  const heading = category || (tag ? `#${tag}` : 'From our kitchen');

  useSeo({
    title: category ? `${category} — Journal` : 'Journal',
    description:
      'Recipes, ingredients and stories from a Nepali pickle kitchen — how achar is made, what goes in it, and what to eat it with.',
    canonical: '/blog',
    // Filtered and deeper pages are thin on their own; only the front page is worth indexing.
    noIndex: page > 1 || Boolean(category || tag),
    structuredData: breadcrumbJsonLd([
      { name: 'Home', url: '/' },
      { name: 'Journal', url: '/blog' },
    ]),
  });

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600">Journal</span>
      </nav>

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl">{heading}</h1>
        <p className="text-ink-500 mt-1 max-w-prose text-sm">
          {category || tag
            ? 'Everything we have written under this heading.'
            : 'How achar is actually made, which chilli does what, and what to do with the last spoon in the jar.'}
        </p>
        {category || tag ? (
          <button
            type="button"
            onClick={() => setFilter({ category: '', tag: '' })}
            className="btn-ghost btn-sm mt-2"
          >
            <Icon name="close" className="size-3.5" />
            Show everything
          </button>
        ) : null}
      </header>

      <div className="lg:grid lg:grid-cols-[1fr_15rem] lg:gap-8">
        <div className="min-w-0">
          {list.error ? <ErrorState error={list.error} onRetry={list.refetch} /> : null}

          {!list.error && list.loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-72 rounded-xl" />
              ))}
            </div>
          ) : null}

          {!list.error && !list.loading && !posts.length ? (
            <div className="card">
              <EmptyState
                icon="note"
                title="Nothing here yet"
                description={
                  category || tag
                    ? 'No articles under this heading at the moment.'
                    : 'We are still writing the first one. In the meantime, the pickles are ready.'
                }
                action="Shop the pickles"
                actionTo="/shop"
              />
            </div>
          ) : null}

          {!list.error && !list.loading && posts.length ? (
            <>
              <ul className="grid gap-4 sm:grid-cols-2">
                {posts.map((article) => (
                  <PostCard key={article._id} article={article} locale={locale} />
                ))}
              </ul>
              <Pagination
                meta={list.data?.meta}
                onPage={(next) => setFilter({ page: next })}
                className="mt-6"
              />
            </>
          ) : null}
        </div>

        <aside className="mt-8 space-y-4 lg:mt-0">
          {categories.length ? (
            <section className="border-cream-300 rounded-xl border bg-white p-4">
              <h2 className="text-ink-800 mb-2 text-sm font-semibold">Subjects</h2>
              <ul className="space-y-1">
                {categories.map((entry) => (
                  <li key={entry.category}>
                    <button
                      type="button"
                      onClick={() => setFilter({ category: entry.category, tag: '' })}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-sm ${
                        category === entry.category ? 'text-brand-700 font-medium' : 'text-ink-600'
                      }`}
                    >
                      <span className="flex-1">{entry.category}</span>
                      <span className="text-ink-400 tnum text-xs">{entry.count}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {tags.length ? (
            <section className="border-cream-300 rounded-xl border bg-white p-4">
              <h2 className="text-ink-800 mb-2 text-sm font-semibold">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((entry) => (
                  <button
                    key={entry.tag}
                    type="button"
                    onClick={() => setFilter({ tag: entry.tag, category: '' })}
                    className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs ${
                      tag === entry.tag
                        ? 'border-brand-300 bg-brand-50 text-brand-800'
                        : 'border-cream-300 hover:border-brand-300 bg-white'
                    }`}
                  >
                    {entry.tag}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <NewsletterBox />
        </aside>
      </div>
    </div>
  );
}

function PostCard({ article, locale }) {
  const title = localised(article, 'title', locale);
  const excerpt = localised(article, 'excerpt', locale);

  return (
    <li className="card group relative flex flex-col overflow-hidden">
      <div className="bg-cream-200 aspect-[16/9] overflow-hidden">
        {article.featuredImage?.url ? (
          <img
            src={article.featuredImage.url}
            alt={article.featuredImage.alt ?? ''}
            loading="lazy"
            decoding="async"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="text-cream-400 flex size-full items-center justify-center">
            <Icon name="image" className="size-8" />
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4">
        <p className="text-brand-700 text-xs font-medium">{article.category}</p>
        <h2 className="mt-1 text-base leading-snug font-semibold">
          <Link
            to={`/blog/${article.slug}`}
            className="hover:text-brand-700 after:absolute after:inset-0 after:content-['']"
          >
            {title}
          </Link>
        </h2>
        <p className="text-ink-500 mt-1.5 line-clamp-3 text-sm">{excerpt}</p>
        <p className="text-ink-400 mt-auto pt-3 text-xs">
          {formatDate(article.publishedAt)} · {article.readingMinutes} min read
        </p>
      </div>
    </li>
  );
}

/**
 * Newsletter signup. Kept here rather than in the footer because this is where someone is
 * already reading, and it is the one page where "more like this by email" means something.
 */
function NewsletterBox() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState('idle'); // idle | pending | done
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setState('pending');
    try {
      await post('/contact/subscribe', { email: email.trim(), source: 'blog' });
      setState('done');
    } catch (caught) {
      setError(apiError(caught).message);
      setState('idle');
    }
  };

  if (state === 'done') {
    return (
      <section className="border-leaf-200 bg-leaf-50 rounded-xl border p-4">
        <h2 className="text-leaf-800 flex items-center gap-1.5 text-sm font-semibold">
          <Icon name="checkCircle" className="size-4" />
          You are on the list
        </h2>
        <p className="text-leaf-800 mt-1 text-sm">
          We write when there is something worth writing about — a few times a month, not
          weekly.
        </p>
      </section>
    );
  }

  return (
    <section className="border-cream-300 bg-cream-100 rounded-xl border p-4">
      <h2 className="text-ink-800 text-sm font-semibold">New recipes by email</h2>
      <p className="text-ink-500 mt-1 text-xs">
        Occasional. Unsubscribe from the bottom of any of them.
      </p>
      <form onSubmit={submit} className="mt-3" noValidate>
        <label htmlFor="blog-newsletter" className="sr-only">
          Email address
        </label>
        <input
          id="blog-newsletter"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          placeholder="you@example.com"
          className="field-input"
        />
        {error ? <p className="field-error">{error}</p> : null}
        <button
          type="submit"
          className="btn-primary btn-sm mt-2 w-full justify-center"
          disabled={state === 'pending' || !email.trim()}
        >
          {state === 'pending' ? <Spinner className="size-4" /> : null}
          Sign me up
        </button>
      </form>
    </section>
  );
}
