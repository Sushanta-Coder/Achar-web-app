import { Link, useParams } from 'react-router-dom';
import Icon from '../components/ui/Icon';
import { PageLoader } from '../components/ui/Spinner';
import { ErrorState } from '../components/ui/EmptyState';
import { useSettings } from '../context/SettingsContext';
import { useFetch } from '../hooks/useApi';
import useSeo from '../hooks/useSeo';
import { formatDate, localised } from '../lib/format';
import { articleJsonLd, breadcrumbJsonLd } from '../lib/seo';

/**
 * One article.
 *
 * The body is admin-authored HTML, and it is written into the DOM with
 * `dangerouslySetInnerHTML`. That is safe here for a specific reason, not by assumption:
 * `blogController` runs every submitted body through `sanitizeHtml` **on write**, so the
 * value stored in Mongo is already stripped of scripts, event handlers and unknown tags.
 * Sanitising on read instead would mean every future reader of this field had to remember
 * to do it. The `.rich-text` class in index.css supplies the typography, since there is no
 * typography plugin in the build.
 *
 * `previous`/`next` are by publish date and come from the same response, so the in-article
 * navigation costs no extra request.
 */
export default function BlogPost() {
  const { slug } = useParams();
  const { locale } = useSettings();

  const { data, error, loading, refetch } = useFetch(`/blog/${slug}`, { deps: [slug] });

  const post = data?.post;
  const related = data?.related ?? [];

  useSeo(
    post
      ? {
          title: post.seo?.metaTitle || post.title,
          description: post.seo?.metaDescription || post.excerpt,
          canonical: `/blog/${post.slug}`,
          image: post.featuredImage?.url,
          type: 'article',
          keywords: post.tags,
          article: {
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            author: post.authorName,
            section: post.category,
          },
          structuredData: [
            articleJsonLd(post),
            breadcrumbJsonLd([
              { name: 'Home', url: '/' },
              { name: 'Journal', url: '/blog' },
              { name: post.title, url: `/blog/${post.slug}` },
            ]),
          ],
        }
      : { title: 'Journal' }
  );

  if (loading) return <PageLoader label="Opening the article" />;

  if (error || !post) {
    return (
      <div className="container-page py-10">
        <div className="card p-5">
          <ErrorState error={error} onRetry={refetch} />
          <p className="text-ink-500 mt-4 text-center text-sm">
            <Link to="/blog" className="text-brand-700 underline">
              Back to the journal
            </Link>
          </p>
        </div>
      </div>
    );
  }

  const title = localised(post, 'title', locale);
  // Nepali bodies are optional per post; fall back rather than render an empty article.
  const body = locale === 'np' && post.contentNp ? post.contentNp : post.content;

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-3 flex items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <Link to="/blog" className="hover:text-brand-700">
          Journal
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600 truncate">{title}</span>
      </nav>

      <article className="mx-auto max-w-3xl">
        <header>
          <Link
            to={`/blog?category=${encodeURIComponent(post.category)}`}
            className="text-brand-700 text-xs font-medium hover:underline"
          >
            {post.category}
          </Link>
          <h1 className="mt-1.5 text-2xl leading-tight sm:text-4xl">{title}</h1>
          <p className="text-ink-400 mt-2 text-sm">
            {post.authorName} · {formatDate(post.publishedAt)} · {post.readingMinutes} min read
          </p>
        </header>

        {post.featuredImage?.url ? (
          <img
            src={post.featuredImage.url}
            alt={post.featuredImage.alt ?? ''}
            className="bg-cream-200 mt-5 aspect-[16/9] w-full rounded-xl object-cover"
            decoding="async"
          />
        ) : null}

        <p className="text-ink-600 mt-5 text-lg leading-relaxed">
          {localised(post, 'excerpt', locale)}
        </p>

        {/* Sanitised on write - see the note at the top of this file. */}
        <div className="rich-text mt-5" dangerouslySetInnerHTML={{ __html: body }} />

        {post.tags?.length ? (
          <div className="border-cream-300 mt-8 flex flex-wrap items-center gap-1.5 border-t pt-5">
            <span className="text-ink-400 mr-1 text-xs">Tagged</span>
            {post.tags.map((tag) => (
              <Link
                key={tag}
                to={`/blog?tag=${encodeURIComponent(tag)}`}
                className="border-cream-300 hover:border-brand-300 rounded-full border bg-white px-2.5 py-1 text-xs"
              >
                {tag}
              </Link>
            ))}
          </div>
        ) : null}

        {/* --- Previous / next ------------------------------------------- */}
        {data.previous || data.next ? (
          <nav className="border-cream-300 mt-6 grid gap-3 border-t pt-5 sm:grid-cols-2">
            {data.previous ? (
              <Link
                to={`/blog/${data.previous.slug}`}
                className="card hover:border-brand-300 p-3 transition-colors"
              >
                <span className="text-ink-400 flex items-center gap-1 text-xs">
                  <Icon name="arrowLeft" className="size-3.5" />
                  Earlier
                </span>
                <span className="mt-1 block text-sm font-medium">{data.previous.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {data.next ? (
              <Link
                to={`/blog/${data.next.slug}`}
                className="card hover:border-brand-300 p-3 text-right transition-colors"
              >
                <span className="text-ink-400 flex items-center justify-end gap-1 text-xs">
                  Later
                  <Icon name="arrowRight" className="size-3.5" />
                </span>
                <span className="mt-1 block text-sm font-medium">{data.next.title}</span>
              </Link>
            ) : null}
          </nav>
        ) : null}

        <div className="border-brand-200 bg-brand-50 mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
          <p className="text-brand-900 text-sm">
            Rather not make it yourself? We have jars ready.
          </p>
          <Link to="/shop" className="btn-primary btn-sm">
            <Icon name="cart" className="size-4" />
            Shop the achar
          </Link>
        </div>
      </article>

      {/* --- Related --------------------------------------------------- */}
      {related.length ? (
        <section className="mx-auto mt-10 max-w-3xl">
          <h2 className="text-xl">More on {post.category}</h2>
          <ul className="mt-4 grid gap-4 sm:grid-cols-3">
            {related.map((article) => (
              <li key={article._id} className="card group relative overflow-hidden">
                <div className="bg-cream-200 aspect-[16/9] overflow-hidden">
                  {article.featuredImage?.url ? (
                    <img
                      src={article.featuredImage.url}
                      alt={article.featuredImage.alt ?? ''}
                      loading="lazy"
                      className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                    />
                  ) : null}
                </div>
                <div className="p-3">
                  <h3 className="text-sm leading-snug font-medium">
                    <Link
                      to={`/blog/${article.slug}`}
                      className="hover:text-brand-700 after:absolute after:inset-0 after:content-['']"
                    >
                      {localised(article, 'title', locale)}
                    </Link>
                  </h3>
                  <p className="text-ink-400 mt-1 text-xs">
                    {article.readingMinutes} min read
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
