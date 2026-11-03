import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { PublicBrand } from '../../components/PublicChrome';
import { PublicThemeToggle } from '../../components/PublicThemeToggle';
import { authErrorMessage } from './auth-errors';
import { redirectFromSearch } from './auth-routing';
import { useAuth } from './useAuth';
import { LoginForm } from './LoginForm';
import { LoginStory, SessionRestorationStatus } from './LoginStory';
import './login.css';

function LoginInitialization() {
  return (
    <main className="cc-login-page cc-login-page--initializing">
      <LoginStory condensed />
      <section className="cc-login-panel">
        <div className="cc-login-panel-top">
          <span className="cc-login-mobile-brand">
            <PublicBrand />
          </span>
          <PublicThemeToggle />
        </div>
        <SessionRestorationStatus />
      </section>
    </main>
  );
}

export function LoginPage() {
  const { error: providerError, isAuthenticated, isLoading, login, signInWithGoogle } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [initialSessionResolved, setInitialSessionResolved] = useState(!isLoading);
  const operationActive = useRef(false);
  const destination = redirectFromSearch(location.search);

  useEffect(() => {
    if (isLoading) return;
    const timer = window.setTimeout(() => setInitialSessionResolved(true), 0);
    return () => window.clearTimeout(timer);
  }, [isLoading]);

  if (isAuthenticated) return <Navigate replace to={destination} />;
  if (!initialSessionResolved) return <LoginInitialization />;

  const submitEmail = async (email: string, password: string) => {
    if (operationActive.current) return;
    operationActive.current = true;
    setEmailSubmitting(true);
    setLocalError(null);
    try {
      await login({ email, password });
      void navigate(destination, { replace: true });
    } catch (caught) {
      setLocalError(authErrorMessage(caught, 'Sign in failed.'));
    } finally {
      operationActive.current = false;
      setEmailSubmitting(false);
    }
  };
  const submitGoogle = async () => {
    if (operationActive.current) return;
    operationActive.current = true;
    setGoogleSubmitting(true);
    setLocalError(null);
    try {
      await signInWithGoogle(destination);
    } catch (caught) {
      operationActive.current = false;
      setLocalError(authErrorMessage(caught, 'Google sign-in could not be started.'));
      setGoogleSubmitting(false);
    }
  };

  return (
    <main className="cc-login-page">
      <a className="cc-skip-link" href="#login-form">
        Skip to sign in
      </a>
      <LoginStory />
      <section aria-labelledby="login-title" className="cc-login-panel" id="login-form">
        <div className="cc-login-panel-top">
          <span className="cc-login-mobile-brand">
            <PublicBrand />
          </span>
          <PublicThemeToggle />
        </div>
        <div className="cc-login-form-wrap">
          <p className="cc-login-kicker">Student access</p>
          <h1 id="login-title">Welcome back.</h1>
          <p className="cc-login-intro">Sign in to continue your CampusConnect experience.</p>
          <div className="cc-login-form-body">
            <LoginForm
              authError={localError ?? providerError}
              emailSubmitting={emailSubmitting}
              googleSubmitting={googleSubmitting}
              onEmailSubmit={submitEmail}
              onGoogleSubmit={submitGoogle}
            />
          </div>
          <p className="cc-login-register">
            New to CampusConnect? <Link to="/register">Create an account</Link>
          </p>
        </div>
        <p className="cc-login-security">
          <Icon className="size-4" name="shield" /> Secure account access
        </p>
      </section>
    </main>
  );
}
