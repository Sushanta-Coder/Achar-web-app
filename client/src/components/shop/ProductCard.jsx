import { Link } from 'react-router-dom';
import Icon, { Stars } from '../ui/Icon';
import { useCart } from '../../context/CartContext';
import { useWishlist } from '../../context/WishlistContext';
import { useToast } from '../../context/ToastContext';
import { formatPrice, discountPercent, localised } from '../../lib/format';

/**
 * The product card, and the small pieces every catalogue page shares.
 *
 * The price shown here is `product.price` — the cheapest active variant, computed by the
 * server in `decorateCard`. The card never multiplies, discounts or totals anything: the
 * moment a browser starts doing money arithmetic is the moment a customer can be shown one
 * number and charged another. Adding to the cart sends `{ productId, variantId, quantity }`
 * and the server replies with what it costs.
 */

export function StarRating({ value = 0, count, size = 'sm', showValue = false }) {
  const px = size === 'lg' ? 'size-5' : size === 'md' ? 'size-4' : 'size-3.5';
  return <Stars value={value} count={count} className={px} showValue={showValue} />;
}

/** Sale price beside the struck-through original, or just the price when nothing is off. */
export function PriceTag({ price, listPrice, className = '', size = 'md' }) {
  const off = discountPercent(listPrice, price);
  const main = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-sm' : 'text-base';

  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`text-ink-900 tnum font-semibold ${main}`}>{formatPrice(price)}</span>
      {off > 0 ? (
        <>
          <span className="text-ink-400 tnum text-sm line-through">{formatPrice(listPrice)}</span>
          <span className="text-leaf-700 text-xs font-medium">{off}% off</span>
        </>
      ) : null}
    </span>
  );
}

export default function ProductCard({ product, locale = 'en', className = '' }) {
  const { addItem } = useCart();
  const wishlist = useWishlist();
  const toast = useToast();

  if (!product) return null;

  const name = localised(product, 'name', locale);
  const image = product.thumbnail?.url ?? product.images?.[0]?.url;
  const alt = product.thumbnail?.alt ?? product.images?.[0]?.alt ?? name;
  const saved = wishlist.has(product._id);
  // `defaultVariant` is the cheapest active one. Without it there is nothing to add, so
  // the button becomes a link to the detail page instead of failing on click.
  const variant = product.defaultVariant;
  const canQuickAdd = Boolean(variant?._id) && product.inStock !== false;

  const quickAdd = async () => {
    try {
      await addItem({ productId: product._id, variantId: variant._id, quantity: 1 });
      toast.success(`${name} (${variant.size}) added to your bag`);
    } catch (error) {
      toast.error(error?.normalised?.message ?? 'Could not add that to your bag');
    }
  };

  return (
    <article
      className={`card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-card-hover ${className}`}
    >
      <div className="bg-cream-200 relative aspect-square overflow-hidden">
        <Link to={`/product/${product.slug}`} tabIndex={-1} aria-hidden="true">
          {image ? (
            <img
              src={image}
              alt={alt}
              loading="lazy"
              decoding="async"
              className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : (
            <span className="text-cream-400 flex size-full items-center justify-center">
              <Icon name="image" className="size-10" />
            </span>
          )}
        </Link>

        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {product.maxDiscountPercentage > 0 ? (
            <span className="badge bg-brand-600 text-white">
              {product.maxDiscountPercentage}% off
            </span>
          ) : null}
          {product.isBestSeller ? (
            <span className="badge bg-mustard-400 text-mustard-900">Best seller</span>
          ) : null}
          {product.isNewArrival ? (
            <span className="badge bg-leaf-600 text-white">New</span>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => wishlist.toggle(product._id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${name} from your wishlist` : `Save ${name} for later`}
          className="absolute top-2 right-2 grid size-9 cursor-pointer place-items-center rounded-full bg-white/90 shadow-sm backdrop-blur transition hover:bg-white"
        >
          <Icon
            name="heart"
            className={`size-4.5 ${saved ? 'text-brand-600' : 'text-ink-400'}`}
            fill={saved ? 'currentColor' : 'none'}
          />
        </button>

        {product.inStock === false ? (
          <div className="bg-ink-900/55 absolute inset-0 grid place-items-center">
            <span className="badge bg-white text-ink-800">Sold out</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.category?.name ? (
          <p className="text-ink-400 text-xs">{localised(product.category, 'name', locale)}</p>
        ) : null}

        <h3 className="text-sm leading-snug font-medium">
          {/*
            The whole card is not a link: it holds a wishlist button and an add button, and
            nesting those inside an anchor is invalid and unpredictable for keyboards. The
            title is the link, stretched over the card with a pseudo-element instead.
          */}
          <Link
            to={`/product/${product.slug}`}
            className="hover:text-brand-700 after:absolute after:inset-0 after:content-['']"
          >
            {name}
          </Link>
        </h3>

        {product.ratingCount > 0 ? (
          <StarRating value={product.ratingAverage} count={product.ratingCount} />
        ) : (
          <span className="text-ink-400 text-xs">No reviews yet</span>
        )}

        <div className="mt-auto pt-1.5">
          <PriceTag price={product.price} listPrice={product.listPrice} />
          {product.variants?.length > 1 ? (
            <p className="text-ink-400 mt-0.5 text-xs">
              {product.variants.length} sizes from {variant?.size}
            </p>
          ) : variant?.size ? (
            <p className="text-ink-400 mt-0.5 text-xs">{variant.size}</p>
          ) : null}
        </div>

        {/* `relative` lifts the button above the title's stretched hit area. */}
        {canQuickAdd ? (
          <button
            type="button"
            onClick={quickAdd}
            className="btn-outline btn-sm relative mt-2 w-full justify-center"
          >
            <Icon name="cart" className="size-4" />
            Add to bag
          </button>
        ) : (
          <Link
            to={`/product/${product.slug}`}
            className="btn-ghost btn-sm relative mt-2 w-full justify-center"
          >
            View details
          </Link>
        )}
      </div>
    </article>
  );
}

/** The grid every catalogue page uses, so column counts stay consistent. */
export function ProductGrid({ products = [], locale = 'en', className = '' }) {
  return (
    <div
      className={`grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 ${className}`}
    >
      {products.map((product) => (
        <ProductCard key={product._id} product={product} locale={locale} />
      ))}
    </div>
  );
}

/**
 * A horizontally scrolling rail for the home page.
 *
 * Scroll-snap rather than a carousel library: it is one CSS property, it works with a
 * trackpad, a touch swipe and the keyboard, and it does not ship 30 KB of JavaScript to
 * move a div sideways.
 */
export function ProductRail({ title, description, products = [], to, locale = 'en' }) {
  if (!products.length) return null;

  return (
    <section className="container-page py-8 sm:py-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl">{title}</h2>
          {description ? <p className="text-ink-500 mt-1 text-sm">{description}</p> : null}
        </div>
        {to ? (
          <Link to={to} className="btn-ghost btn-sm shrink-0">
            See all
            <Icon name="arrowRight" className="size-4" />
          </Link>
        ) : null}
      </div>

      <div className="snap-row no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:gap-4 lg:mx-0 lg:px-0">
        {products.map((product) => (
          <ProductCard
            key={product._id}
            product={product}
            locale={locale}
            className="w-[48%] shrink-0 sm:w-56 lg:w-60"
          />
        ))}
      </div>
    </section>
  );
}
