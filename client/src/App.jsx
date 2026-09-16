import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { SettingsProvider } from './context/SettingsContext';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { WishlistProvider } from './context/WishlistContext';
import { ToastProvider } from './context/ToastContext';

import ToastViewport from './components/ui/ToastViewport';
import StorefrontLayout from './components/layout/StorefrontLayout';
import AdminLayout from './components/layout/AdminLayout';
import { PageLoader } from './components/ui/Spinner';
import {
  RedirectIfAuthenticated,
  RequireAdmin,
  RequireAuth,
  RequireStaff,
} from './components/RouteGuards';

/**
 * Providers and the route tree.
 *
 * Every page is lazy. The storefront and the admin dashboard share almost no code beyond
 * the contexts and the UI primitives, and a customer buying achar should not download
 * the product editor to do it. `manualChunks` in vite.config.js splits the vendor code;
 * these boundaries split ours.
 *
 * Provider order is load-bearing:
 *   Settings  - independent; supplies branding and the delivery threshold to the header
 *   Auth      - independent; runs GET /auth/me once at boot
 *   Cart      - reads Auth, to merge the guest cart on sign-in
 *   Wishlist  - same
 *   Toast     - outermost of the four consumers so any of them can report a failure
 *
 * Toast is innermost in JSX (so it wraps the router) but last in the chain, which is the
 * same thing said two ways.
 */

// --- Storefront --------------------------------------------------------------
const Home = lazy(() => import('./pages/Home'));
const Shop = lazy(() => import('./pages/Shop'));
const ProductDetail = lazy(() => import('./pages/ProductDetail'));
const Categories = lazy(() => import('./pages/Categories'));
const Search = lazy(() => import('./pages/Search'));
const Cart = lazy(() => import('./pages/Cart'));
const Checkout = lazy(() => import('./pages/Checkout'));
const PaymentRedirect = lazy(() => import('./pages/PaymentRedirect'));
const OrderSuccess = lazy(() => import('./pages/OrderSuccess'));
const PaymentFailed = lazy(() => import('./pages/PaymentFailed'));
const TrackOrder = lazy(() => import('./pages/TrackOrder'));
const Wishlist = lazy(() => import('./pages/Wishlist'));
const Blog = lazy(() => import('./pages/Blog'));
const BlogPost = lazy(() => import('./pages/BlogPost'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const Faq = lazy(() => import('./pages/Faq'));
const Policy = lazy(() => import('./pages/Policy'));
const NotFound = lazy(() => import('./pages/NotFound'));

// --- Auth --------------------------------------------------------------------
const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail'));

// --- Account -----------------------------------------------------------------
const AccountLayout = lazy(() => import('./pages/account/AccountLayout'));
const AccountOverview = lazy(() => import('./pages/account/Overview'));
const AccountOrders = lazy(() => import('./pages/account/Orders'));
const AccountOrderDetail = lazy(() => import('./pages/account/OrderDetail'));
const AccountAddresses = lazy(() => import('./pages/account/Addresses'));
const AccountProfile = lazy(() => import('./pages/account/Profile'));
const AccountReviews = lazy(() => import('./pages/account/Reviews'));

// --- Admin -------------------------------------------------------------------
const AdminLogin = lazy(() => import('./pages/admin/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const AdminProductForm = lazy(() => import('./pages/admin/ProductForm'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminInventory = lazy(() => import('./pages/admin/Inventory'));
const AdminCoupons = lazy(() => import('./pages/admin/Coupons'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'));
const AdminPayments = lazy(() => import('./pages/admin/Payments'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers'));
const AdminCustomerDetail = lazy(() => import('./pages/admin/CustomerDetail'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminBlog = lazy(() => import('./pages/admin/Blog'));
const AdminBlogForm = lazy(() => import('./pages/admin/BlogForm'));
const AdminBanners = lazy(() => import('./pages/admin/Banners'));
const AdminMessages = lazy(() => import('./pages/admin/Messages'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminDelivery = lazy(() => import('./pages/admin/Delivery'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminStaff = lazy(() => import('./pages/admin/Staff'));

export default function App() {
  return (
    <SettingsProvider>
      <AuthProvider>
        <CartProvider>
          <WishlistProvider>
            <ToastProvider>
              <ToastViewport />

              <Routes>
                {/* --- Storefront --- */}
                <Route element={<StorefrontLayout />}>
                  <Route index element={<Home />} />
                  <Route path="shop" element={<Shop />} />
                  {/*
                    Category pages are the shop list with a category pre-applied rather
                    than a separate screen - same filters, same sort, same pagination.
                  */}
                  <Route path="categories" element={<Categories />} />
                  <Route path="category/:slug" element={<Shop />} />
                  <Route path="product/:slug" element={<ProductDetail />} />
                  <Route path="search" element={<Search />} />
                  <Route path="cart" element={<Cart />} />
                  <Route path="wishlist" element={<Wishlist />} />
                  <Route path="track-order" element={<TrackOrder />} />
                  <Route path="blog" element={<Blog />} />
                  <Route path="blog/:slug" element={<BlogPost />} />
                  <Route path="about" element={<About />} />
                  <Route path="contact" element={<Contact />} />
                  <Route path="faq" element={<Faq />} />

                  {/*
                    Policy pages all render from site settings, so they are one component
                    with the slug as its key. Khalti and eSewa both require these to be
                    live and reachable before they approve a merchant.
                  */}
                  <Route path="shipping-policy" element={<Policy slug="shipping" />} />
                  <Route path="returns-policy" element={<Policy slug="returns" />} />
                  <Route path="payment-policy" element={<Policy slug="payment" />} />
                  <Route path="privacy-policy" element={<Policy slug="privacy" />} />
                  <Route path="terms" element={<Policy slug="terms" />} />

                  {/* Checkout is inside the storefront shell but hides the chrome itself. */}
                  <Route path="checkout" element={<Checkout />} />
                  <Route path="order-success/:orderNumber" element={<OrderSuccess />} />
                  <Route path="payment-failed" element={<PaymentFailed />} />

                  {/* --- Guest-only --- */}
                  <Route element={<RedirectIfAuthenticated />}>
                    <Route path="login" element={<Login />} />
                    <Route path="register" element={<Register />} />
                    <Route path="forgot-password" element={<ForgotPassword />} />
                    <Route path="reset-password" element={<ResetPassword />} />
                  </Route>
                  <Route path="verify-email" element={<VerifyEmail />} />

                  {/* --- Signed-in customer --- */}
                  <Route element={<RequireAuth />}>
                    <Route path="account" element={<AccountLayout />}>
                      <Route index element={<AccountOverview />} />
                      <Route path="orders" element={<AccountOrders />} />
                      <Route path="orders/:orderNumber" element={<AccountOrderDetail />} />
                      <Route path="addresses" element={<AccountAddresses />} />
                      <Route path="profile" element={<AccountProfile />} />
                      <Route path="reviews" element={<AccountReviews />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFound />} />
                </Route>

                {/*
                  The eSewa hand-off is outside every layout: it renders a hidden form and
                  submits it immediately, so a header would flash for a frame and then be
                  gone. Nothing about it is a page a person reads.
                */}
                <Route path="/payment/redirect" element={<PaymentRedirect />} />

                {/* --- Admin --- */}
                <Route
                  path="/admin/login"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <AdminLogin />
                    </Suspense>
                  }
                />

                <Route element={<RequireStaff />}>
                  <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<AdminDashboard />} />

                    <Route path="products" element={<AdminProducts />} />
                    <Route path="products/new" element={<AdminProductForm />} />
                    <Route path="products/:id/edit" element={<AdminProductForm />} />
                    <Route path="categories" element={<AdminCategories />} />
                    <Route path="inventory" element={<AdminInventory />} />
                    <Route path="coupons" element={<AdminCoupons />} />

                    <Route path="orders" element={<AdminOrders />} />
                    <Route path="orders/:id" element={<AdminOrderDetail />} />
                    <Route path="payments" element={<AdminPayments />} />
                    <Route path="customers" element={<AdminCustomers />} />
                    <Route path="customers/:id" element={<AdminCustomerDetail />} />
                    <Route path="reviews" element={<AdminReviews />} />

                    <Route path="blog" element={<AdminBlog />} />
                    <Route path="blog/new" element={<AdminBlogForm />} />
                    <Route path="blog/:id/edit" element={<AdminBlogForm />} />
                    <Route path="banners" element={<AdminBanners />} />
                    <Route path="messages" element={<AdminMessages />} />

                    <Route path="reports" element={<AdminReports />} />
                    <Route path="delivery" element={<AdminDelivery />} />

                    {/* Mirrors the server: requireAdmin guards settings and staff. */}
                    <Route element={<RequireAdmin />}>
                      <Route path="settings" element={<AdminSettings />} />
                      <Route path="staff" element={<AdminStaff />} />
                    </Route>

                    <Route path="*" element={<Navigate to="/admin" replace />} />
                  </Route>
                </Route>
              </Routes>
            </ToastProvider>
          </WishlistProvider>
        </CartProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
