/**
 * Single source of truth for domain enums. Mongoose schemas, validators and the
 * admin UI all derive from these lists so a new status never has to be added twice.
 */

export const ROLES = {
  CUSTOMER: 'customer',
  STAFF: 'staff',
  ADMIN: 'admin',
};
export const ROLE_VALUES = Object.values(ROLES);
export const STAFF_ROLES = [ROLES.STAFF, ROLES.ADMIN];

export const ORDER_STATUS = {
  PENDING: 'pending',
  PAYMENT_PENDING: 'payment_pending',
  PAID: 'paid',
  PROCESSING: 'processing',
  PACKED: 'packed',
  SHIPPED: 'shipped',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};
export const ORDER_STATUS_VALUES = Object.values(ORDER_STATUS);

export const ORDER_STATUS_LABELS = {
  pending: 'Pending',
  payment_pending: 'Payment Pending',
  paid: 'Paid',
  processing: 'Processing',
  packed: 'Packed',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

/** Statuses an admin may move an order into, keyed by current status. */
export const ORDER_STATUS_TRANSITIONS = {
  pending: ['processing', 'paid', 'cancelled'],
  payment_pending: ['paid', 'cancelled'],
  paid: ['processing', 'cancelled', 'refunded'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['refunded'],
  cancelled: [],
  refunded: [],
};

/** Orders in these states still hold reserved (not yet deducted) stock. */
export const RESERVING_STATUSES = [ORDER_STATUS.PENDING, ORDER_STATUS.PAYMENT_PENDING];

/** Orders in these states have had stock deducted from on-hand quantity. */
export const COMMITTED_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.PROCESSING,
  ORDER_STATUS.PACKED,
  ORDER_STATUS.SHIPPED,
  ORDER_STATUS.OUT_FOR_DELIVERY,
  ORDER_STATUS.DELIVERED,
];

export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
};
export const PAYMENT_STATUS_VALUES = Object.values(PAYMENT_STATUS);

export const PAYMENT_METHODS = {
  KHALTI: 'khalti',
  ESEWA: 'esewa',
  COD: 'cod',
};
export const PAYMENT_METHOD_VALUES = Object.values(PAYMENT_METHODS);
export const ONLINE_PAYMENT_METHODS = [PAYMENT_METHODS.KHALTI, PAYMENT_METHODS.ESEWA];

export const PAYMENT_METHOD_LABELS = {
  khalti: 'Khalti',
  esewa: 'eSewa',
  cod: 'Cash on Delivery',
};

export const DISCOUNT_TYPES = {
  PERCENTAGE: 'percentage',
  FIXED: 'fixed',
};
export const DISCOUNT_TYPE_VALUES = Object.values(DISCOUNT_TYPES);

export const REVIEW_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
export const REVIEW_STATUS_VALUES = Object.values(REVIEW_STATUS);

export const CONTACT_STATUS = {
  NEW: 'new',
  READ: 'read',
  REPLIED: 'replied',
  ARCHIVED: 'archived',
};
export const CONTACT_STATUS_VALUES = Object.values(CONTACT_STATUS);

export const SPICE_LEVELS = ['mild', 'medium', 'hot', 'extra-hot'];

export const BLOG_STATUS = { DRAFT: 'draft', PUBLISHED: 'published' };
export const BLOG_STATUS_VALUES = Object.values(BLOG_STATUS);

export const BLOG_CATEGORIES = [
  'Pickle Recipes',
  'Nepali Food',
  'Food Culture',
  'Health & Ingredients',
  'Company News',
  'Cooking Tips',
];

export const BANNER_POSITIONS = ['hero', 'promo', 'category', 'sidebar'];

export const CURRENCY = 'NPR';
export const CURRENCY_SYMBOL = 'Rs.';

export const SORT_OPTIONS = {
  popularity: { soldCount: -1, ratingAverage: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  'price-low': { minPrice: 1 },
  'price-high': { minPrice: -1 },
  rating: { ratingAverage: -1, ratingCount: -1 },
  name: { name: 1 },
};

export const DEFAULT_PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 60;

/** Maximum units of a single variant a customer may buy in one order. */
export const MAX_QTY_PER_ITEM = 20;
