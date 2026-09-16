import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { addressSchema } from './Address.js';
import { ROLES, ROLE_VALUES } from '../utils/constants.js';
import { NEPAL_MOBILE_REGEX, normalizePhone } from '../utils/nepal.js';

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address'],
    },
    phone: {
      type: String,
      trim: true,
      set: (value) => (value ? normalizePhone(value) : undefined),
      match: [NEPAL_MOBILE_REGEX, 'Enter a valid Nepali mobile number'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false,
    },
    role: { type: String, enum: ROLE_VALUES, default: ROLES.CUSTOMER, index: true },
    isActive: { type: Boolean, default: true },
    addresses: { type: [addressSchema], default: [] },

    emailVerified: { type: Boolean, default: false },
    emailVerificationToken: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },

    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    passwordChangedAt: { type: Date, select: false },

    /**
     * Bumped on password change / "log out everywhere". Refresh tokens carry the
     * version they were minted with, so old tokens stop working immediately.
     */
    tokenVersion: { type: Number, default: 0, select: false },

    marketingOptIn: { type: Boolean, default: false },
    locale: { type: String, enum: ['en', 'np'], default: 'en' },
    lastLoginAt: Date,

    // Denormalised customer metrics; kept current by the order service so the
    // admin customer list does not need an aggregation on every page view.
    orderCount: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        delete ret.password;
        delete ret.passwordResetToken;
        delete ret.passwordResetExpires;
        delete ret.emailVerificationToken;
        delete ret.emailVerificationExpires;
        delete ret.tokenVersion;
        delete ret.__v;
        return ret;
      },
    },
  }
);

userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ createdAt: -1 });
userSchema.index({ name: 'text', email: 'text' }, { name: 'user_search' });

/**
 * No `next` parameter: Mongoose 9 passes one only to callback-style (non-async)
 * hooks, so an `async` hook that calls `next()` throws "next is not a function" on
 * every save. Returning from the promise is the signal instead.
 *
 * `passwordChangedAt` is backdated a second because a JWT issued in the same tick
 * would otherwise carry an `iat` at or before this timestamp, and the "token older
 * than the last password change" check would reject the token the user was just
 * given.
 */
userSchema.pre('save', async function hashPassword() {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
  if (!this.isNew) this.passwordChangedAt = new Date(Date.now() - 1000);
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  if (!this.password) return Promise.resolve(false);
  return bcrypt.compare(String(candidate), this.password);
};

userSchema.methods.isStaff = function isStaff() {
  return this.role === ROLES.ADMIN || this.role === ROLES.STAFF;
};

userSchema.virtual('defaultAddress').get(function defaultAddress() {
  if (!this.addresses?.length) return null;
  return this.addresses.find((address) => address.isDefault) || this.addresses[0];
});

export default mongoose.models.User || mongoose.model('User', userSchema);
