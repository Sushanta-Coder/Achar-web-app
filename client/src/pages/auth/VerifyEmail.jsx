import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthCard from '../../components/auth/AuthCard';
import Spinner from '../../components/ui/Spinner';
import Icon from '../../components/ui/Icon';
import { useAuth } from '../../context/AuthContext';
import { apiError, post } from '../../lib/apiClient';
import useSeo from '../../hooks/useSeo';

/**
 * Confirms an email address from a link: `/verify-email?token=…&email=…`.
 *
 * Outside the guest-only guard, unlike the other auth pages - the customer is usually
 * signed in when they click this, and bouncing them to /account would swallow the
 * verification.
 *
 * `POST /auth/verify-email` needs no session: the token is the credential, matched
 * against a hash scoped to that address and valid for 24 hours. Verifying does not sign
 * anyone in, so the buttons below adapt to whether they already are.
 *
 * The `ran` ref matters. React's development StrictMode mounts effects twice, and the
 * token is single-use - the second call would report "invalid or expired" for a
 * verification that had *just succeeded*, which is a confusing way to greet a new
 * customer.
 */
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const { isAuthenticated, refreshUser } = useAuth();

  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [state, setState] = useState(token && email ? 'checking' : 'incomplete');
  const [message, setMessage] = useState('');
  const ran = useRef(false);

  useSeo({ title: 'Verify your email', noIndex: true });

  useEffect(() => {
    if (state !== 'checking' || ran.current) return;
    ran.current = true;

    (async () => {
      try {
        await post('/auth/verify-email', { email, token });
        setState('done');
        // The signed-in user's `emailVerified` flag is now stale; re-read it so the
        // account page stops nagging.
        if (isAuthenticated) refreshUser();
      } catch (error) {
        setMessage(apiError(error).message);
        setState('failed');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  if (state === 'checking') {
    return (
      <AuthCard title="Verifying your email">
        <div className="flex flex-col items-center py-4 text-center">
          <Spinner className="text-brand-600 size-8" />
          <p className="text-ink-500 mt-3 text-sm">One moment…</p>
        </div>
      </AuthCard>
    );
  }

  if (state === 'done') {
    return (
      <AuthCard
        title="Email confirmed"
        footer={
          <Link to="/shop" className="text-brand-700 font-medium hover:underline">
            Browse the pickles
          </Link>
        }
      >
        <div className="text-center">
          <span className="bg-leaf-100 mx-auto grid size-14 place-items-center rounded-full">
            <Icon name="checkCircle" className="text-leaf-700 size-7" />
          </span>
          <p className="text-ink-600 mt-4 text-sm">
            <span className="font-medium">{email}</span> is confirmed. Order updates and receipts
            will reach you there.
          </p>
          <Link to={isAuthenticated ? '/account' : '/login'} className="btn-primary mt-5">
            {isAuthenticated ? 'Go to my account' : 'Sign in'}
          </Link>
        </div>
      </AuthCard>
    );
  }

  /*
    Both failure shapes land here, and the copy has to cover the awkward truth: there is
    no resend endpoint in the API, so offering a "send it again" button would be a lie.
    Support can re-trigger it, and an unverified address does not block ordering - which
    is worth saying, because otherwise this screen reads like a dead end.
  */
  return (
    <AuthCard
      title={state === 'incomplete' ? 'That link is incomplete' : 'We could not verify that link'}
      footer={
        <Link to="/contact" className="text-brand-700 font-medium hover:underline">
          Get in touch
        </Link>
      }
    >
      <div className="text-center">
        <span className="bg-mustard-100 mx-auto grid size-14 place-items-center rounded-full">
          <Icon name="alert" className="text-mustard-700 size-7" />
        </span>

        <p className="text-ink-600 mt-4 text-sm">
          {state === 'incomplete'
            ? 'Some email apps split long links across lines. Copy the whole link from the email and try again.'
            : message || 'That verification link is invalid or has expired.'}
        </p>

        <p className="text-ink-400 mt-3 text-xs">
          Links last 24 hours and work once - if you have already confirmed this address, you are
          done. Either way you can keep ordering; verification only affects our emails to you.
        </p>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link to={isAuthenticated ? '/account' : '/'} className="btn-primary">
            {isAuthenticated ? 'My account' : 'Back to the shop'}
          </Link>
        </div>
      </div>
    </AuthCard>
  );
}
