/**
 * Barrel module. Importing this once (from `app.js` and the test setup) guarantees
 * every schema is registered before any `populate()` call runs, which avoids the
 * classic "MissingSchemaError" when a model is only reachable through a ref.
 */
export { default as AnalyticsEvent } from './AnalyticsEvent.js';
export { default as Banner } from './Banner.js';
export { default as BlogPost } from './BlogPost.js';
export { default as Cart } from './Cart.js';
export { default as Category } from './Category.js';
export { default as ContactMessage } from './ContactMessage.js';
export { default as Counter } from './Counter.js';
export { default as Coupon } from './Coupon.js';
export { default as CouponRedemption } from './CouponRedemption.js';
export { default as DeliveryZone } from './DeliveryZone.js';
export { default as Order } from './Order.js';
export { default as Payment } from './Payment.js';
export { default as Product } from './Product.js';
export { default as Review } from './Review.js';
export { default as SiteSettings } from './SiteSettings.js';
export { default as Subscriber } from './Subscriber.js';
export { default as User } from './User.js';
export { default as Wishlist } from './Wishlist.js';
