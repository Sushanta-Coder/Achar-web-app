import User from '../models/User.js';
import Order from '../models/Order.js';
import Review from '../models/Review.js';
import Wishlist from '../models/Wishlist.js';
import Cart from '../models/Cart.js';
import ApiError from '../utils/ApiError.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess, sendCreated } from '../utils/ApiResponse.js';
import { clearAuthCookies } from '../utils/tokens.js';
import { publicUser } from './authController.js';
import { RESERVING_STATUSES, COMMITTED_STATUSES } from '../utils/constants.js';

/**
 * The customer's own account: profile, saved addresses and account closure.
 *
 * Every handler here is scoped to `req.user._id`. No endpoint in this file accepts
 * a user id from the request, so there is no object-reference to tamper with.
 */

const findAddress = (user, addressId) => {
  const address = user.addresses.id(addressId);
  if (!address) throw ApiError.notFound('That address is not saved to your account');
  return address;
};

export const getProfile = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { user: publicUser(req.user) } })
);

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, phone, marketingOptIn, locale } = req.body;
  const user = await User.findById(req.user._id);

  if (phone && phone !== user.phone) {
    const taken = await User.exists({ phone, _id: { $ne: user._id } });
    if (taken) throw ApiError.conflict('That phone number is already used by another account');
    user.phone = phone;
  }
  if (name !== undefined) user.name = name;
  if (marketingOptIn !== undefined) user.marketingOptIn = marketingOptIn;
  if (locale !== undefined) user.locale = locale;

  await user.save();
  return sendSuccess(res, { message: 'Profile updated', data: { user: publicUser(user) } });
});

// --- Saved addresses ---------------------------------------------------------

export const listAddresses = asyncHandler(async (req, res) =>
  sendSuccess(res, { data: { addresses: publicUser(req.user).addresses } })
);

export const addAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (user.addresses.length >= 10) {
    throw ApiError.badRequest('You can save up to 10 addresses');
  }

  // The first address saved is the default whether or not the box was ticked.
  const makeDefault = req.body.isDefault || user.addresses.length === 0;
  if (makeDefault) user.addresses.forEach((address) => { address.isDefault = false; });

  user.addresses.push({ ...req.body, isDefault: makeDefault });
  await user.save();

  const created = user.addresses[user.addresses.length - 1];
  return sendCreated(res, {
    message: 'Address saved',
    data: { address: created.toObject({ virtuals: true }), addresses: publicUser(user).addresses },
  });
});

export const updateAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = findAddress(user, req.params.addressId);

  if (req.body.isDefault) {
    user.addresses.forEach((other) => { other.isDefault = false; });
  }
  address.set(req.body);
  await user.save();

  return sendSuccess(res, {
    message: 'Address updated',
    data: { address: address.toObject({ virtuals: true }), addresses: publicUser(user).addresses },
  });
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = findAddress(user, req.params.addressId);
  user.addresses.forEach((other) => { other.isDefault = false; });
  address.isDefault = true;
  await user.save();
  return sendSuccess(res, { message: 'Default address updated', data: { addresses: publicUser(user).addresses } });
});

export const deleteAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  const address = findAddress(user, req.params.addressId);
  const wasDefault = address.isDefault;

  user.addresses.pull({ _id: address._id });
  // Never leave the account without a default.
  if (wasDefault && user.addresses.length) user.addresses[0].isDefault = true;
  await user.save();

  return sendSuccess(res, { message: 'Address removed', data: { addresses: publicUser(user).addresses } });
});

// --- Account overview --------------------------------------------------------

/** Everything the account dashboard shows above the fold, in one request. */
export const getAccountSummary = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [orderStats, recentOrders, openOrders, reviewCount, wishlist] = await Promise.all([
    Order.aggregate([
      { $match: { user: userId, paymentStatus: 'paid', status: { $nin: ['cancelled', 'refunded'] } } },
      { $group: { _id: null, orders: { $sum: 1 }, spent: { $sum: '$pricing.total' } } },
    ]),
    Order.find({ user: userId })
      .select('orderNumber status paymentStatus paymentMethod pricing.total createdAt items')
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
    Order.countDocuments({
      user: userId,
      status: { $in: [...RESERVING_STATUSES, ...COMMITTED_STATUSES.filter((s) => s !== 'delivered')] },
    }),
    Review.countDocuments({ user: userId }),
    Wishlist.findOne({ user: userId }).select('items').lean(),
  ]);

  return sendSuccess(res, {
    data: {
      user: publicUser(req.user),
      stats: {
        totalOrders: orderStats[0]?.orders ?? 0,
        totalSpent: orderStats[0]?.spent ?? 0,
        openOrders,
        reviews: reviewCount,
        wishlistItems: wishlist?.items?.length ?? 0,
      },
      recentOrders: recentOrders.map((order) => ({
        ...order,
        itemCount: (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0),
        items: undefined,
      })),
    },
  });
});

/**
 * Account closure.
 *
 * The user document is anonymised rather than deleted: orders must keep a valid
 * reference for accounting, and a hard delete would break historical revenue
 * reports. Personal data is overwritten, so nothing identifying remains.
 */
export const deleteAccount = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select('+password +tokenVersion');
  if (!(await user.comparePassword(req.body.password))) {
    throw ApiError.badRequest('Password is incorrect', { details: { password: 'Password is incorrect' } });
  }

  const openOrders = await Order.countDocuments({
    user: user._id,
    status: { $in: ['pending', 'payment_pending', 'paid', 'processing', 'packed', 'shipped', 'out_for_delivery'] },
  });
  if (openOrders > 0) {
    throw ApiError.conflict(
      'You have orders in progress. Please wait until they are delivered or cancelled before closing your account.'
    );
  }

  const stamp = Date.now();
  user.set({
    name: 'Deleted account',
    email: `deleted-${stamp}-${user._id}@removed.invalid`,
    phone: undefined,
    addresses: [],
    isActive: false,
    marketingOptIn: false,
    emailVerified: false,
    tokenVersion: (user.tokenVersion ?? 0) + 1,
  });
  await user.save({ validateBeforeSave: false });

  await Promise.all([
    Cart.deleteOne({ user: user._id }),
    Wishlist.deleteOne({ user: user._id }),
  ]);

  clearAuthCookies(res);
  return sendSuccess(res, { message: 'Your account has been closed' });
});

export default {
  getProfile,
  updateProfile,
  listAddresses,
  addAddress,
  updateAddress,
  setDefaultAddress,
  deleteAddress,
  getAccountSummary,
  deleteAccount,
};
