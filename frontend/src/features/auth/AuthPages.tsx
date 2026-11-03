import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { PublicBrand } from '../../components/PublicChrome';
import { Icon } from '../../components/Icon';
import { PublicThemeToggle } from '../../components/PublicThemeToggle';
import { authErrorMessage } from './auth-errors';
import { oauthCallbackError, passwordConfirmationError, redirectFromSearch } from './auth-routing';
import { hasRecoverySession } from './auth-service';
import { useAuth } from './useAuth';
import { LoginStory } from './LoginStory';
import './login.css';

function PremiumAuthLayout({
  children,
  description,
  storyDescription,
  storyTitle,
  title,
  variant,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly storyDescription: string;
  readonly storyTitle: string;
  readonly title: string;
  readonly variant: 'register' | 'recovery' | 'callback';
}) {
  return (
    <main className={`cc-login-page cc-auth-premium-page cc-auth-premium-page--${variant}`}>
      <a className="cc-skip-link" href="#auth-form">
        Skip to form
      </a>
      <LoginStory description={storyDescription} title={storyTitle} />
      <section
        aria-labelledby="auth-page-title"
        className="cc-login-panel cc-auth-premium-panel"
        id="auth-form"
      >
        <div className="cc-login-panel-top">
          <span className="cc-login-mobile-brand">
            <PublicBrand />
          </span>
          <PublicThemeToggle />
        </div>
        <div className="cc-login-form-wrap cc-auth-premium-form">
          <p className="cc-login-kicker">Student access</p>
          <h1 id="auth-page-title">{title}</h1>
          <p className="cc-login-intro">{description}</p>
          <div className="cc-login-form-body">{children}</div>
        </div>
        <p className="cc-login-security">
          <Icon className="size-4" name="shield" /> Secure account access
        </p>
      </section>
    </main>
  );
}

function AuthError({ message }: { readonly message: string | null }) {
  return message ? (
    <div aria-live="polite" className="cc-alert cc-alert--danger mb-5" role="alert">
      <Icon className="size-4 shrink-0" name="warning" />
      {message}
    </div>
  ) : null;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-4" viewBox="0 0 24 24">
      <path
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.41Z"
        fill="#4285F4"
      />
      <path
        d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
        fill="#34A853"
      />
      <path
        d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.63.39 3.17 1.04 4.55l3.35-2.62Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.94c1.47 0 2.79.5 3.82 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
        fill="#EA4335"
      />
    </svg>
  );
}

function GoogleAuthButton({
  busy,
  onClick,
}: {
  readonly busy: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button className="w-full" disabled={busy} loading={busy} onClick={onClick} variant="secondary">
      {!busy ? <GoogleMark /> : null}
      <span>{busy ? 'Connecting to Google…' : 'Continue with Google'}</span>
    </Button>
  );
}

function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3 text-xs text-[var(--cc-subtle)]" role="separator">
      <span className="h-px flex-1 bg-[var(--cc-border)]" />
      <span>or continue with email</span>
      <span className="h-px flex-1 bg-[var(--cc-border)]" />
    </div>
  );
}

export function RegisterPage() {
  const { register, signInWithGoogle } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const confirmationError = passwordConfirmationError(password, confirmPassword);
    if (confirmationError !== null) {
      setError(confirmationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await register({ displayName, email, password });
      setSent(true);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Registration failed.'));
    } finally {
      setBusy(false);
    }
  };
  const continueWithGoogle = async () => {
    setGoogleBusy(true);
    setError(null);
    try {
      await signInWithGoogle('/home');
    } catch (caught) {
      setError(authErrorMessage(caught, 'Google registration could not be started.'));
      setGoogleBusy(false);
    }
  };
  return (
    <PremiumAuthLayout
      description="Join CampusConnect and get started with your student experience."
      storyDescription="Discover new possibilities, meet the right people, and make more of your student experience."
      storyTitle="A good start leads somewhere great."
      title="Create your account."
      variant="register"
    >
      {sent ? (
        <div className="cc-alert cc-alert--success block p-5" role="status">
          <h3 className="font-semibold">Check your inbox</h3>
          <p className="mt-2 text-sm leading-6">
            We sent a verification link. Confirm your email, then return to sign in.
          </p>
          <Link className="cc-button cc-button--secondary mt-5" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          <GoogleAuthButton busy={googleBusy} onClick={() => void continueWithGoogle()} />
          <AuthDivider />
          <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <label className="cc-label">
              Full name
              <input
                autoComplete="name"
                className="cc-field"
                minLength={2}
                onChange={(event) => setDisplayName(event.target.value)}
                required
                value={displayName}
              />
            </label>
            <label className="cc-label">
              Email address
              <input
                autoComplete="email"
                className="cc-field"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <label className="cc-label">
              Password
              <div className="relative">
                <input
                  autoComplete="new-password"
                  className="cc-field pr-20"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="cc-auth-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <span className="font-normal text-[var(--cc-subtle)]">Use 8–128 characters.</span>
            </label>
            <label className="cc-label">
              Confirm password
              <input
                autoComplete="new-password"
                className="cc-field"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
              />
            </label>
            <Button disabled={busy || googleBusy} loading={busy} type="submit">
              <span>{busy ? 'Creating account…' : 'Create account'}</span>
            </Button>
          </form>
          <p className="mt-7 text-center text-sm text-[var(--cc-muted)]">
            Already registered?{' '}
            <Link className="cc-auth-link font-medium" to="/login">
              Sign in
            </Link>
          </p>
        </>
      )}
    </PremiumAuthLayout>
  );
}

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setMessage(
        "If an account is associated with that email, you'll receive password reset instructions.",
      );
    } catch (caught) {
      setError(authErrorMessage(caught, 'Request failed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PremiumAuthLayout
      description="Enter your email address and we'll send you instructions to reset your password."
      storyDescription="A simple step back in, with the same secure experience waiting on the other side."
      storyTitle="Let's get you back in."
      title="Let's get you back in."
      variant="recovery"
    >
      <AuthError message={error} />
      {message ? (
        <div className="cc-auth-recovery-confirmation" role="status">
          <span aria-hidden="true" className="cc-auth-recovery-confirmation-icon">
            <Icon className="size-5" name="check" />
          </span>
          <h2>Check your inbox</h2>
          <p>{message}</p>
          <Link className="cc-button cc-button--secondary" to="/login">
            Back to sign in
          </Link>
        </div>
      ) : (
        <>
          <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <label className="cc-label">
              Email address
              <input
                autoComplete="email"
                className="cc-field"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </label>
            <Button disabled={busy} loading={busy} type="submit">
              <span>{busy ? 'Sending…' : 'Send reset link'}</span>
            </Button>
          </form>
          <Link className="cc-auth-link mt-6 block text-center" to="/login">
            Back to sign in
          </Link>
        </>
      )}
    </PremiumAuthLayout>
  );
}

export function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [updated, setUpdated] = useState(false);

  useEffect(() => {
    let active = true;
    void hasRecoverySession()
      .then((available) => {
        if (active) setHasSession(available);
      })
      .catch(() => {
        if (active) setHasSession(false);
      })
      .finally(() => {
        if (active) setIsCheckingSession(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasSession) {
      setError('This reset link is invalid or has expired. Request a new link and try again.');
      return;
    }
    const confirmationError = passwordConfirmationError(password, confirm);
    if (confirmationError !== null) {
      setError(confirmationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      setUpdated(true);
    } catch (caught) {
      setError(authErrorMessage(caught, 'Password update failed.'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PremiumAuthLayout
      description="Set a new password to securely access your account."
      storyDescription="A secure reset, a fresh start, and everything ready when you return."
      storyTitle="Choose what comes next."
      title="Choose a new password."
      variant="recovery"
    >
      {updated ? (
        <div className="cc-alert cc-alert--success block p-5" role="status">
          <h3 className="font-semibold">Password updated</h3>
          <p className="mt-2 text-sm leading-6">
            Your password has been updated securely. You can now return to your CampusConnect
            workspace.
          </p>
          <Link className="cc-button cc-button--secondary mt-5" to="/home">
            Continue to Home
          </Link>
        </div>
      ) : (
        <>
          <AuthError message={error} />
          {!isCheckingSession && !hasSession ? (
            <div className="cc-alert cc-alert--warning mb-5" role="alert">
              This reset link is unavailable. Request a new password reset link to continue.
            </div>
          ) : null}
          <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <label className="cc-label">
              New password
              <div className="relative">
                <input
                  autoComplete="new-password"
                  className="cc-field pr-20"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="cc-auth-password-toggle"
                  onClick={() => setShowPassword((value) => !value)}
                  type="button"
                >
                  {showPassword ? 'Hide' : 'Show'}
                </button>
              </div>
            </label>
            <label className="cc-label">
              Confirm password
              <input
                className="cc-field"
                minLength={8}
                onChange={(event) => setConfirm(event.target.value)}
                required
                type={showPassword ? 'text' : 'password'}
                value={confirm}
              />
            </label>
            <Button
              disabled={busy || isCheckingSession || !hasSession}
              loading={busy}
              type="submit"
            >
              <span>{busy ? 'Updating…' : 'Update password'}</span>
            </Button>
          </form>
          <Link className="cc-auth-link mt-6 block text-center" to="/forgot-password">
            Request a new reset link
          </Link>
        </>
      )}
    </PremiumAuthLayout>
  );
}

export function AuthCallbackPage() {
  const { error, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const destination = redirectFromSearch(location.search);
  const callbackError = oauthCallbackError(location.search, location.hash);

  useEffect(() => {
    if (isAuthenticated) void navigate(destination, { replace: true });
  }, [destination, isAuthenticated, navigate]);

  const failure = callbackError ?? error;

  return (
    <PremiumAuthLayout
      description={
        failure
          ? 'We could not complete this verification safely.'
          : isAuthenticated
            ? 'Your account is verified. Continuing to CampusConnect now.'
            : 'We are securely confirming your account and restoring your session.'
      }
      storyDescription="Secure access keeps your campus identity and connected student workflows in one trusted place."
      storyTitle="One secure step back to campus."
      title={
        failure
          ? 'Verification needs attention'
          : isAuthenticated
            ? 'Account verified'
            : 'Verifying your account'
      }
      variant="callback"
    >
      <AuthError message={failure} />
      <div aria-live="polite" className="cc-auth-callback-state text-center">
        {!failure && !isAuthenticated ? (
          <>
            <span
              aria-label="Verifying account"
              className="cc-auth-callback-spinner mx-auto block size-8 animate-spin rounded-full border-2 border-t-transparent"
              role="status"
            />
            <p className="mt-4 text-sm text-[var(--cc-muted)]">
              This page will continue automatically when verification completes.
            </p>
          </>
        ) : isAuthenticated ? (
          <>
            <span aria-hidden="true" className="cc-auth-callback-icon mx-auto flex">
              <Icon className="size-5" name="check" />
            </span>
            <p className="mt-4 text-sm text-[var(--cc-muted)]">Your secure session is ready.</p>
          </>
        ) : (
          <p className="text-sm text-[var(--cc-muted)]">Return to sign in and try again.</p>
        )}
        <Link className="cc-button cc-button--secondary mt-5" to="/login">
          Return to sign in
        </Link>
      </div>
    </PremiumAuthLayout>
  );
}
