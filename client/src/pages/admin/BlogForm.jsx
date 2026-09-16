import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import Icon from '../../components/ui/Icon';
import { ErrorState } from '../../components/ui/EmptyState';
import Spinner, { PageLoader } from '../../components/ui/Spinner';
import { PageHeader, Panel } from '../../components/admin/AdminPage';
import ImageUploader from '../../components/admin/ImageUploader';
import { useFetch } from '../../hooks/useApi';
import { applyFieldErrors, patch, post } from '../../lib/apiClient';
import { useToast } from '../../context/ToastContext';
import useSeo from '../../hooks/useSeo';
import { toDateInputValue } from '../../lib/format';

/**
 * Blog editor. One component for new and edit, keyed off the `:id` param.
 *
 * The body is Markdown in a textarea rather than a rich text editor. A WYSIWYG that produces
 * HTML has to be sanitised on the way in and on the way out, and Markdown that renders to a
 * fixed set of tags avoids that class of problem entirely. It is also what a recipe actually
 * needs: headings, a list, some bold.
 *
 * The featured image reuses `ImageUploader` with a max of one, so alt text is required here for
 * the same reason it is on a product photo.
 */

const CATEGORIES = [
  'Pickle Recipes',
  'Nepali Food',
  'Food Culture',
  'Health & Ingredients',
  'Company News',
  'Cooking Tips',
];

const BLANK = {
  title: '',
  titleNp: '',
  slug: '',
  excerpt: '',
  content: '',
  category: 'Pickle Recipes',
  tags: '',
  status: 'draft',
  publishedAt: '',
  seo: { title: '', description: '', keywords: '' },
};

const toList = (value) =>
  String(value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

export default function AdminBlogForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [image, setImage] = useState([]);
  const [imageError, setImageError] = useState('');

  useSeo({ title: isEdit ? 'Edit article · Admin' : 'New article · Admin', noIndex: true });

  const existing = useFetch(`/blog/admin/${id}`, { skip: !isEdit, deps: [id] });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: BLANK });

  // One `reset` rather than a dozen `setValue` calls, so the form's dirty state starts clean
  // and "unsaved changes" means something.
  useEffect(() => {
    const post_ = existing.data?.post;
    if (!post_) return;

    reset({
      title: post_.title ?? '',
      titleNp: post_.titleNp ?? '',
      slug: post_.slug ?? '',
      excerpt: post_.excerpt ?? '',
      content: post_.content ?? '',
      category: post_.category ?? CATEGORIES[0],
      tags: (post_.tags ?? []).join(', '),
      status: post_.status ?? 'draft',
      publishedAt: post_.publishedAt ? toDateInputValue(post_.publishedAt) : '',
      seo: {
        title: post_.seo?.title ?? '',
        description: post_.seo?.description ?? '',
        keywords: (post_.seo?.keywords ?? []).join(', '),
      },
    });

    if (post_.featuredImage?.url) setImage([post_.featuredImage]);
  }, [existing.data, reset]);

  const status = watch('status');
  const title = watch('title');

  const onSubmit = async (form) => {
    if (!image.length) {
      setImageError('Every article needs a featured image — it is what shows in a shared link.');
      return;
    }
    if (!image[0].alt?.trim()) {
      setImageError('Write alt text for the featured image.');
      return;
    }
    setImageError('');

    const body = {
      title: form.title,
      titleNp: form.titleNp || undefined,
      excerpt: form.excerpt,
      content: form.content,
      category: form.category,
      tags: toList(form.tags),
      status: form.status,
      featuredImage: {
        url: image[0].url,
        alt: image[0].alt,
        ...(image[0].publicId ? { publicId: image[0].publicId } : {}),
      },
      seo: {
        title: form.seo.title || undefined,
        description: form.seo.description || undefined,
        keywords: toList(form.seo.keywords),
      },
    };

    // Only sent when the admin actually typed one; otherwise the server decides, which is what
    // publishing for the first time should do.
    if (form.publishedAt) body.publishedAt = form.publishedAt;
    if (form.slug) body.slug = form.slug;

    try {
      if (isEdit) {
        await patch(`/blog/admin/${id}`, body);
        toast.success('Article saved');
      } else {
        const result = await post('/blog/admin', body);
        toast.success(`"${result.post.title}" created`);
        navigate(`/admin/blog/${result.post._id}/edit`, { replace: true });
        return;
      }
    } catch (error) {
      const normalised = error?.normalised;
      if (!applyFieldErrors(normalised, setError)) {
        toast.error(normalised?.message ?? 'Could not save the article');
      }
    }
  };

  if (isEdit && existing.loading && !existing.data) return <PageLoader label="Loading article" />;
  if (isEdit && existing.error) {
    return <ErrorState error={existing.error} onRetry={existing.refetch} />;
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <PageHeader
        breadcrumb={[{ label: 'Blog', to: '/admin/blog' }, { label: isEdit ? 'Edit' : 'New' }]}
        title={isEdit ? title || 'Edit article' : 'New article'}
        description="Markdown. Headings, lists, bold and links render; nothing else is allowed through."
        actions={
          <>
            <Link to="/admin/blog" className="btn-outline btn-sm">
              Cancel
            </Link>
            <button type="submit" disabled={isSubmitting} className="btn-primary btn-sm">
              {isSubmitting ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
              {status === 'published' ? 'Save & publish' : 'Save draft'}
            </button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel title="Article">
            <div className="space-y-3">
              <div>
                <label htmlFor="post-title" className="field-label">
                  Title
                </label>
                <input
                  id="post-title"
                  {...register('title', { required: 'Give the article a title' })}
                  maxLength={160}
                  className="field-input"
                />
                {errors.title ? <p className="field-error">{errors.title.message}</p> : null}
              </div>

              <div>
                <label htmlFor="post-titleNp" className="field-label">
                  Title in Nepali <span className="text-ink-400 font-normal">(optional)</span>
                </label>
                <input
                  id="post-titleNp"
                  {...register('titleNp')}
                  maxLength={160}
                  className="field-input"
                  lang="ne"
                />
              </div>

              {isEdit ? (
                <div>
                  <label htmlFor="post-slug" className="field-label">
                    URL slug
                  </label>
                  <input
                    id="post-slug"
                    {...register('slug')}
                    className="field-input font-mono text-sm"
                  />
                  <p className="field-hint">
                    Changing this breaks links to the old address and loses its search ranking.
                  </p>
                </div>
              ) : null}

              <div>
                <label htmlFor="post-excerpt" className="field-label">
                  Excerpt
                </label>
                <textarea
                  id="post-excerpt"
                  rows={2}
                  maxLength={300}
                  {...register('excerpt', { required: 'Write a short summary' })}
                  className="field-input"
                  placeholder="One or two sentences. Used on the blog index and as the fallback meta description."
                />
                {errors.excerpt ? <p className="field-error">{errors.excerpt.message}</p> : null}
              </div>

              <div>
                <label htmlFor="post-content" className="field-label">
                  Content
                </label>
                <textarea
                  id="post-content"
                  rows={18}
                  {...register('content', { required: 'The article needs a body' })}
                  className="field-input font-mono text-sm leading-relaxed"
                  placeholder={'## Ingredients\n\n- 1 kg mula\n- 2 tbsp sesame\n\n## Method\n\n1. Wash and dry the mula…'}
                />
                <p className="field-hint">
                  Markdown: <code>##</code> for a heading, <code>-</code> for a list,{' '}
                  <code>**bold**</code>, <code>[text](url)</code>.
                </p>
                {errors.content ? <p className="field-error">{errors.content.message}</p> : null}
              </div>
            </div>
          </Panel>

          <Panel title="Featured image">
            <ImageUploader images={image} onChange={setImage} folder="blog" max={1} />
            {imageError ? <p className="field-error mt-2">{imageError}</p> : null}
          </Panel>

          <Panel title="Search engines">
            <div className="space-y-3">
              <div>
                <label htmlFor="post-seo-title" className="field-label">
                  Meta title
                </label>
                <input
                  id="post-seo-title"
                  {...register('seo.title')}
                  maxLength={70}
                  className="field-input"
                  placeholder="Falls back to the article title"
                />
                <p className="field-hint">Around 60 characters shows in full on Google.</p>
              </div>

              <div>
                <label htmlFor="post-seo-description" className="field-label">
                  Meta description
                </label>
                <textarea
                  id="post-seo-description"
                  rows={2}
                  maxLength={180}
                  {...register('seo.description')}
                  className="field-input"
                  placeholder="Falls back to the excerpt"
                />
              </div>

              <div>
                <label htmlFor="post-seo-keywords" className="field-label">
                  Keywords
                </label>
                <input
                  id="post-seo-keywords"
                  {...register('seo.keywords')}
                  className="field-input"
                  placeholder="mula ko achar, nepali pickle recipe"
                />
                <p className="field-hint">Comma separated.</p>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Publishing">
            <div className="space-y-3">
              <div>
                <label htmlFor="post-status" className="field-label">
                  Status
                </label>
                <select id="post-status" {...register('status')} className="field-input">
                  <option value="draft">Draft — only visible here</option>
                  <option value="published">Published — live on the blog</option>
                </select>
              </div>

              <div>
                <label htmlFor="post-published" className="field-label">
                  Publication date
                </label>
                <input
                  id="post-published"
                  type="date"
                  {...register('publishedAt')}
                  className="field-input"
                />
                <p className="field-hint">
                  Blank means now, on first publish. Set it to keep the original date after an
                  edit.
                </p>
              </div>

              <div>
                <label htmlFor="post-category" className="field-label">
                  Category
                </label>
                <select id="post-category" {...register('category')} className="field-input">
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="post-tags" className="field-label">
                  Tags
                </label>
                <input
                  id="post-tags"
                  {...register('tags')}
                  className="field-input"
                  placeholder="mula, sesame, winter"
                />
                <p className="field-hint">Comma separated, up to 15.</p>
              </div>
            </div>
          </Panel>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
            {isSubmitting ? <Spinner className="size-4" /> : <Icon name="check" className="size-4" />}
            {isEdit ? 'Save changes' : 'Create article'}
          </button>
        </div>
      </div>
    </form>
  );
}
