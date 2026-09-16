import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Icon, { Stars } from '../components/ui/Icon';
import { ErrorState } from '../components/ui/EmptyState';
import Spinner, { PageLoader } from '../components/ui/Spinner';
import ProductCard, { PriceTag } from '../components/shop/ProductCard';
import { useFetch } from '../hooks/useApi';
import { post } from '../lib/apiClient';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../context/WishlistContext';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import useSeo from '../hooks/useSeo';
import { formatDate, formatPrice, localised } from '../lib/format';
import { breadcrumbJsonLd, productJsonLd } from '../lib/seo';

/**
 * Product detail.
 *
 * `GET /products/:slug` returns the product, its approved reviews, the star breakdown and
 * four related items in one response, so this page is one request.
 *
 * The variant selector is the only real state here. Price, stock and the SKU all follow
 * from the selected variant, and every one of those numbers comes from the server — the
 * page reads `variant.effectivePrice`, it never computes a discount. Add-to-bag sends
 * `{ productId, variantId, quantity }` and nothing else; the price is looked up again
 * server-side when the cart is quoted, so a tampered payload cannot change what is charged.
 *
 * Stock is per variant, not per product: a 250 g jar being sold out must not grey out the
 * 1 kg one.
 */

const SPICE_META = {
  mild: { label: 'Mild', flames: 1 },
  medium: { label: 'Medium', flames: 2 },
  hot: { label: 'Hot', flames: 3 },
  'extra-hot': { label: 'Extra hot', flames: 4 },
};

export default function ProductDetail() {
  const { slug } = useParams();
  const { settings, locale } = useSettings();
  const { addItem } = useCart();
  const wishlist = useWishlist();
  const toast = useToast();

  const [variantId, setVariantId] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [imageIndex, setImageIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState('description');

  const { data, loading, error, refetch } = useFetch(`/products/${slug}`, { deps: [slug] });

  const product = data?.product;
  const reviews = data?.reviews ?? [];
  const breakdown = data?.ratingBreakdown ?? { counts: {}, total: 0 };
  const related = data?.related ?? [];

  const variants = useMemo(
    () => (product?.variants ?? []).filter((entry) => entry.isActive !== false),
    [product]
  );

  // Selection is derived rather than synced by an effect: whatever the URL loaded, the
  // chosen id either matches a variant or we fall back to the default. No effect means no
  // render where `selected` is stale against `product`.
  const selected =
    variants.find((entry) => String(entry._id) === String(variantId)) ??
    variants.find((entry) => entry.isDefault) ??
    variants[0] ??
    null;

  const images = product?.images?.length
    ? product.images
    : product?.thumbnail
      ? [product.thumbnail]
      : [];
  const activeImage = images[Math.min(imageIndex, Math.max(images.length - 1, 0))];

  const name = product ? localised(product, 'name', locale) : '';
  const spice = SPICE_META[product?.spiceLevel] ?? null;
  const saved = product ? wishlist.has(product._id) : false;
  const available = selected?.availableStock ?? 0;
  const canBuy = Boolean(selected) && available > 0;
  const maxQty = Math.min(available || 1, 20);

  useSeo(
    product
      ? {
          title: product.seo?.metaTitle || name,
          description: product.seo?.metaDescription || product.shortDescription,
          canonical: `/product/${product.slug}`,
          image: product.thumbnail?.url ?? images[0]?.url,
          type: 'product',
          keywords: product.keywords,
          locale,
          structuredData: [
            productJsonLd(product, { locale }),
            breadcrumbJsonLd([
              { name: 'Home', url: '/' },
              { name: 'Shop', url: '/shop' },
              ...(product.category
                ? [{ name: product.category.name, url: `/category/${product.category.slug}` }]
                : []),
              { name: name, url: `/product/${product.slug}` },
            ]),
          ],
        }
      : { title: 'Loading…', noIndex: true }
  );

  const add = async () => {
    if (!selected) return;
    setAdding(true);
    try {
      await addItem({ productId: product._id, variantId: selected._id, quantity });
      toast.success(`${quantity} × ${name} (${selected.size}) added to your bag`);
    } catch (requestError) {
      toast.error(requestError?.normalised?.message ?? 'Could not add that to your bag');
    } finally {
      setAdding(false);
    }
  };

  if (loading && !data) return <PageLoader label="Loading" />;
  if (error) return <ErrorState error={error} onRetry={refetch} className="py-20" />;
  if (!product) return null;

  return (
    <div className="container-page py-6 sm:py-8">
      <nav aria-label="Breadcrumb" className="text-ink-400 mb-4 flex flex-wrap items-center gap-1 text-xs">
        <Link to="/" className="hover:text-brand-700">
          Home
        </Link>
        <Icon name="chevronRight" className="size-3" />
        <Link to="/shop" className="hover:text-brand-700">
          Shop
        </Link>
        {product.category ? (
          <>
            <Icon name="chevronRight" className="size-3" />
            <Link to={`/category/${product.category.slug}`} className="hover:text-brand-700">
              {localised(product.category, 'name', locale)}
            </Link>
          </>
        ) : null}
        <Icon name="chevronRight" className="size-3" />
        <span className="text-ink-600 truncate">{name}</span>
      </nav>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
        {/* --- Gallery ------------------------------------------------------- */}
        <div>
          <div className="card bg-cream-200 relative aspect-square overflow-hidden">
            {activeImage ? (
              <img
                src={activeImage.url}
                alt={activeImage.alt ?? name}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="size-full object-cover"
              />
            ) : (
              <span className="text-cream-400 grid size-full place-items-center">
                <Icon name="image" className="size-16" />
              </span>
            )}

            {product.maxDiscountPercentage > 0 ? (
              <span className="badge bg-brand-600 absolute top-3 left-3 text-white">
                {product.maxDiscountPercentage}% off
              </span>
            ) : null}
          </div>

          {images.length > 1 ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={image.url ?? index}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  aria-label={`Show image ${index + 1} of ${images.length}`}
                  aria-current={index === imageIndex ? 'true' : undefined}
                  className={`size-16 shrink-0 cursor-pointer overflow-hidden rounded-lg border-2 transition ${
                    index === imageIndex ? 'border-brand-600' : 'border-cream-300 hover:border-cream-400'
                  }`}
                >
                  <img src={image.url} alt="" loading="lazy" className="size-full object-cover" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* --- Buy box ------------------------------------------------------- */}
        <div>
          <h1 className="text-2xl sm:text-3xl">{name}</h1>
          {product.nameNp && locale !== 'np' ? (
            <p className="text-ink-500 font-np mt-1 text-lg">{product.nameNp}</p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            {product.ratingCount > 0 ? (
              <a href="#reviews" className="hover:opacity-80">
                <Stars value={product.ratingAverage} count={product.ratingCount} showValue />
              </a>
            ) : (
              <span className="text-ink-400 text-sm">No reviews yet</span>
            )}
            {product.soldCount > 50 ? (
              <span className="text-ink-500 text-sm">{product.soldCount}+ sold</span>
            ) : null}
            <span className="text-ink-400 font-mono text-xs">{selected?.sku ?? product.sku}</span>
          </div>

          <p className="text-ink-600 mt-3 text-sm sm:text-base">{product.shortDescription}</p>

          <div className="border-cream-300 mt-4 border-y py-4">
            <PriceTag
              price={selected?.effectivePrice ?? product.minPrice}
              listPrice={selected?.price}
              size="lg"
            />
            <p className="text-ink-400 mt-1 text-xs">
              Price for one {selected?.size ?? 'jar'}
              {settings?.commerce?.pricesIncludeTax
                ? ` · ${settings.commerce.taxLabel ?? 'tax'} included`
                : ''}
            </p>
          </div>

          {/* Variant picker. Sold-out sizes stay selectable so the stock message is
              visible rather than the option silently vanishing. */}
          {variants.length ? (
            <fieldset className="mt-4">
              <legend className="field-label">Size</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((variant) => {
                  const isSelected = String(variant._id) === String(selected?._id);
                  const out = (variant.availableStock ?? 0) <= 0;
                  return (
                    <button
                      key={variant._id}
                      type="button"
                      onClick={() => {
                        setVariantId(variant._id);
                        setQuantity(1);
                      }}
                      aria-pressed={isSelected}
                      className={`cursor-pointer rounded-xl border px-3 py-2 text-left transition ${
                        isSelected
                          ? 'border-brand-600 bg-brand-50'
                          : 'border-cream-300 bg-white hover:border-cream-400'
                      } ${out ? 'opacity-60' : ''}`}
                    >
                      <span className="block text-sm font-medium">{variant.size}</span>
                      <span className="text-ink-500 tnum block text-xs">
                        {formatPrice(variant.effectivePrice ?? variant.price)}
                      </span>
                      {out ? (
                        <span className="block text-xs text-red-600">Sold out</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          {/* Stock line. A specific low number is more persuasive than "limited stock",
              and it is honest — it is the reservable count, not a marketing figure. */}
          <p className="mt-3 text-sm">
            {available > 10 ? (
              <span className="text-leaf-700 inline-flex items-center gap-1">
                <Icon name="checkCircle" className="size-4" />
                In stock, ships within a day
              </span>
            ) : available > 0 ? (
              <span className="text-mustard-800 inline-flex items-center gap-1">
                <Icon name="alert" className="size-4" />
                Only {available} left of this size
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-red-700">
                <Icon name="close" className="size-4" />
                This size is sold out
              </span>
            )}
          </p>

          <div className="mt-4 flex flex-wrap items-stretch gap-2">
            <div className="border-cream-300 flex items-center rounded-xl border bg-white">
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.max(1, current - 1))}
                disabled={quantity <= 1}
                className="text-ink-600 hover:bg-cream-100 grid size-11 cursor-pointer place-items-center rounded-l-xl disabled:opacity-40"
                aria-label="One fewer"
              >
                <Icon name="minus" className="size-4" />
              </button>
              <span className="tnum w-10 text-center text-sm font-medium" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((current) => Math.min(maxQty, current + 1))}
                disabled={quantity >= maxQty}
                className="text-ink-600 hover:bg-cream-100 grid size-11 cursor-pointer place-items-center rounded-r-xl disabled:opacity-40"
                aria-label="One more"
              >
                <Icon name="plus" className="size-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={add}
              disabled={!canBuy || adding}
              className="btn-primary btn-lg flex-1 justify-center"
            >
              {adding ? <Spinner className="size-5" /> : <Icon name="cart" className="size-5" />}
              {canBuy ? 'Add to bag' : 'Sold out'}
            </button>

            <button
              type="button"
              onClick={() => wishlist.toggle(product._id)}
              aria-pressed={saved}
              className="btn-outline btn-lg size-12 shrink-0 justify-center px-0"
              title={saved ? 'Saved' : 'Save for later'}
            >
              <Icon
                name="heart"
                className={`size-5 ${saved ? 'text-brand-600' : ''}`}
                fill={saved ? 'currentColor' : 'none'}
              />
              <span className="sr-only">{saved ? 'Saved for later' : 'Save for later'}</span>
            </button>
          </div>

          <dl className="border-cream-300 text-ink-600 mt-5 grid gap-2 border-t pt-4 text-sm sm:grid-cols-2">
            {spice ? (
              <Row icon="flame" label="Heat">
                <span className="inline-flex items-center gap-0.5">
                  {spice.label}
                  <span className="ml-1 flex" aria-hidden="true">
                    {Array.from({ length: 4 }, (_, index) => (
                      <Icon
                        key={index}
                        name="flame"
                        className={`size-3.5 ${
                          index < spice.flames ? 'text-brand-600' : 'text-cream-400'
                        }`}
                      />
                    ))}
                  </span>
                </span>
              </Row>
            ) : null}
            {product.isVegetarian ? (
              <Row icon="leaf" label="Diet">
                Vegetarian
              </Row>
            ) : null}
            {selected?.weightGrams ? (
              <Row icon="box" label="Net weight">
                {selected.weightGrams} g
              </Row>
            ) : null}
            {product.shelfLife ? (
              <Row icon="clock" label="Best before">
                {product.shelfLife}
              </Row>
            ) : null}
            {product.origin ? (
              <Row icon="pin" label="Made in">
                {product.origin}
              </Row>
            ) : null}
            <Row icon="truck" label="Delivery">
              <Link to="/shipping-policy" className="text-brand-700 underline">
                Charges by district
              </Link>
            </Row>
          </dl>
        </div>
      </div>

      {/* --- Tabs ------------------------------------------------------------ */}
      <div className="mt-10">
        <div className="border-cream-300 flex gap-1 overflow-x-auto border-b" role="tablist">
          {[
            { value: 'description', label: 'Description' },
            { value: 'details', label: 'Ingredients & nutrition' },
            { value: 'reviews', label: `Reviews (${product.ratingCount ?? 0})` },
          ].map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="tab"
              aria-selected={tab === entry.value}
              onClick={() => setTab(entry.value)}
              className={`-mb-px cursor-pointer border-b-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition ${
                tab === entry.value
                  ? 'border-brand-600 text-brand-800'
                  : 'text-ink-500 hover:text-ink-800 border-transparent'
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="py-5">
          {tab === 'description' ? (
            <div className="rich-text max-w-prose text-sm">
              {(locale === 'np' && product.descriptionNp ? product.descriptionNp : product.description)
                .split('\n')
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}

              {product.storageInstructions ? (
                <>
                  <h3>Keeping it</h3>
                  <p>{product.storageInstructions}</p>
                </>
              ) : null}
            </div>
          ) : null}

          {tab === 'details' ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-base">What is in it</h3>
                {product.ingredients?.length ? (
                  <ul className="text-ink-600 list-inside list-disc space-y-1 text-sm">
                    {(locale === 'np' && product.ingredientsNp?.length
                      ? product.ingredientsNp
                      : product.ingredients
                    ).map((entry) => (
                      <li key={entry}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-400 text-sm">Not listed yet.</p>
                )}

                {product.allergens?.length ? (
                  <div className="border-mustard-200 bg-mustard-50 mt-3 rounded-xl border p-3">
                    <p className="text-mustard-900 flex items-center gap-1.5 text-sm font-medium">
                      <Icon name="alert" className="size-4" />
                      Contains
                    </p>
                    <p className="text-mustard-800 mt-0.5 text-sm">
                      {product.allergens.join(', ')}
                    </p>
                  </div>
                ) : null}
              </div>

              {product.nutrition && Object.values(product.nutrition).some(Boolean) ? (
                <div>
                  <h3 className="mb-2 text-base">Nutrition</h3>
                  <table className="w-full text-sm">
                    <caption className="text-ink-400 mb-1 text-left text-xs">
                      Per {product.nutrition.servingSize ?? '15 g'} serving
                    </caption>
                    <tbody className="divide-cream-200 divide-y">
                      {[
                        ['Calories', product.nutrition.calories, 'kcal'],
                        ['Protein', product.nutrition.protein, 'g'],
                        ['Carbohydrates', product.nutrition.carbohydrates, 'g'],
                        ['of which sugar', product.nutrition.sugar, 'g'],
                        ['Fat', product.nutrition.fat, 'g'],
                        ['Sodium', product.nutrition.sodium, 'mg'],
                      ]
                        .filter(([, value]) => value != null)
                        .map(([label, value, unit]) => (
                          <tr key={label}>
                            <th scope="row" className="text-ink-600 py-1.5 text-left font-normal">
                              {label}
                            </th>
                            <td className="tnum py-1.5 text-right font-medium">
                              {value} {unit}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === 'reviews' ? (
            <ReviewSection product={product} reviews={reviews} breakdown={breakdown} />
          ) : null}
        </div>
      </div>

      {related.length ? (
        <section className="mt-6">
          <h2 className="mb-4 text-xl">You might also like</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {related.map((entry) => (
              <ProductCard key={entry._id} product={entry} locale={locale} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Row({ icon, label, children }) {
  return (
    <div className="flex items-center gap-2">
      <Icon name={icon} className="text-ink-400 size-4 shrink-0" />
      <dt className="text-ink-400">{label}:</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/**
 * Reviews.
 *
 * Only approved reviews are ever returned by the API, so there is no moderation state to
 * represent here. Writing one requires a signed-in account with a delivered order for the
 * product — the server decides that, and it is surfaced by `GET /reviews/reviewable`
 * rather than guessed at from the order history. That is why this section is read-only and
 * takes no change callback: the form lives at /account/reviews, where the eligible orders are.
 */
function ReviewSection({ product, reviews, breakdown }) {
  const { isAuthenticated } = useAuth();
  const toast = useToast();
  const [helpful, setHelpful] = useState(new Set());

  const total = breakdown.total || 0;

  const markHelpful = async (reviewId) => {
    if (!isAuthenticated) {
      toast.info('Sign in to mark a review as helpful');
      return;
    }
    try {
      await post(`/reviews/${reviewId}/helpful`);
      setHelpful((current) => new Set(current).add(String(reviewId)));
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not record that');
    }
  };

  return (
    <div id="reviews" className="grid gap-6 lg:grid-cols-[16rem_1fr]">
      <div>
        <div className="card p-4 text-center">
          <p className="text-ink-900 font-display text-4xl font-semibold">
            {(product.ratingAverage ?? 0).toFixed(1)}
          </p>
          <Stars value={product.ratingAverage} className="mx-auto mt-1 size-4" />
          <p className="text-ink-500 mt-1 text-xs">
            {total} {total === 1 ? 'review' : 'reviews'}
          </p>
        </div>

        {total > 0 ? (
          <ul className="mt-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = breakdown.counts?.[stars] ?? 0;
              const share = total ? Math.round((count / total) * 100) : 0;
              return (
                <li key={stars} className="flex items-center gap-2 text-xs">
                  <span className="tnum text-ink-500 w-8 shrink-0">{stars}★</span>
                  <span className="bg-cream-200 h-2 flex-1 overflow-hidden rounded-full">
                    <span
                      className="bg-mustard-400 block h-full rounded-full"
                      style={{ width: `${share}%` }}
                    />
                  </span>
                  <span className="tnum text-ink-400 w-8 shrink-0 text-right">{count}</span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <p className="text-ink-500 mt-4 text-sm">
          {isAuthenticated ? (
            <>
              Bought this? Write a review from{' '}
              <Link to="/account/reviews" className="text-brand-700 underline">
                your account
              </Link>
              .
            </>
          ) : (
            <>
              <Link to="/login" className="text-brand-700 underline">
                Sign in
              </Link>{' '}
              to review something you have received.
            </>
          )}
        </p>
      </div>

      <div>
        {!reviews.length ? (
          <p className="text-ink-500 text-sm">
            No reviews yet. Reviews come only from people who have actually received the jar, so
            they take a little while to appear on a new product.
          </p>
        ) : (
          <ul className="divide-cream-200 divide-y">
            {reviews.map((review) => (
              <li key={review._id} className="py-4 first:pt-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={review.rating} className="size-3.5" />
                  <span className="text-sm font-medium">{review.author}</span>
                  {review.isVerifiedPurchase ? (
                    <span className="badge border-leaf-200 bg-leaf-50 text-leaf-800 border">
                      Verified purchase
                    </span>
                  ) : null}
                  <span className="text-ink-400 ml-auto text-xs">
                    {formatDate(review.createdAt)}
                  </span>
                </div>

                {review.title ? <p className="mt-1.5 text-sm font-semibold">{review.title}</p> : null}
                <p className="text-ink-600 mt-1 text-sm">{review.comment}</p>

                {review.images?.length ? (
                  <div className="mt-2 flex gap-2">
                    {review.images.slice(0, 4).map((image) => (
                      <img
                        key={image.url}
                        src={image.url}
                        alt={image.alt ?? ''}
                        loading="lazy"
                        className="size-16 rounded-lg object-cover"
                      />
                    ))}
                  </div>
                ) : null}

                {/* The shop's reply, when there is one. Visibly attributed so it does not
                    read as another customer agreeing. */}
                {review.adminResponse?.message ? (
                  <div className="border-brand-200 bg-brand-50 mt-2 rounded-xl border p-3">
                    <p className="text-brand-900 text-xs font-semibold">Reply from the shop</p>
                    <p className="text-brand-800 mt-0.5 text-sm">{review.adminResponse.message}</p>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => markHelpful(review._id)}
                  disabled={helpful.has(String(review._id))}
                  className="text-ink-500 hover:text-ink-800 mt-2 cursor-pointer text-xs disabled:opacity-60"
                >
                  Helpful
                  {review.helpfulCount || helpful.has(String(review._id))
                    ? ` (${(review.helpfulCount ?? 0) + (helpful.has(String(review._id)) ? 1 : 0)})`
                    : ''}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
