import { useState, type FormEvent, type InvalidEvent } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';

function GoogleMark() {
  return (
    <svg aria-hidden="true" className="size-5" viewBox="0 0 24 24">
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

function PasswordVisibilityIcon({ visible }: { readonly visible: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {visible ? (
        <>
          <path d="M3 3l18 18" />
          <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 4.2A10.5 10.5 0 0 1 12 4c5.5 0 9 5.1 9 8a10.8 10.8 0 0 1-2 3.8M6.6 6.6C4.3 8.1 3 10.4 3 12c0 2.9 3.5 8 9 8 1.4 0 2.7-.3 3.8-.8" />
        </>
      ) : (
        <>
          <path d="M3 12c0-2.9 3.5-8 9-8s9 5.1 9 8-3.5 8-9 8-9-5.1-9-8Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

interface LoginFormProps {
  readonly authError: string | null;
  readonly emailSubmitting: boolean;
  readonly googleSubmitting: boolean;
  readonly onEmailSubmit: (email: string, password: string) => Promise<void>;
  readonly onGoogleSubmit: () => Promise<void>;
}

export function LoginForm({
  authError,
  emailSubmitting,
  googleSubmitting,
  onEmailSubmit,
  onGoogleSubmit,
}: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const busy = emailSubmitting || googleSubmitting;

  const reportEmailValidity = (input: HTMLInputElement) => {
    const message = input.validity.valueMissing
      ? 'Enter your email address.'
      : input.validity.typeMismatch
        ? 'Enter a valid email address.'
        : null;
    setEmailError(message);
  };
  const reportPasswordValidity = (input: HTMLInputElement) => {
    const message = input.validity.valueMissing
      ? 'Enter your password.'
      : input.validity.tooShort
        ? 'Password must contain at least 8 characters.'
        : null;
    setPasswordError(message);
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    await onEmailSubmit(email, password);
  };

  return (
    <>
      {authError ? (
        <div aria-live="assertive" className="cc-login-alert" id="login-auth-error" role="alert">
          <Icon className="size-4 shrink-0" name="warning" />
          <span>{authError}</span>
        </div>
      ) : null}
      <Button
        className="cc-login-action cc-login-google"
        disabled={busy}
        loading={googleSubmitting}
        onClick={() => void onGoogleSubmit()}
        type="button"
        variant="secondary"
      >
        {!googleSubmitting ? <GoogleMark /> : null}
        <span>{googleSubmitting ? 'Connecting to Google…' : 'Continue with Google'}</span>
      </Button>
      <div className="cc-login-divider" role="separator">
        <span />
        <small>or continue with email</small>
        <span />
      </div>
      <form
        aria-describedby={authError ? 'login-auth-error' : undefined}
        onSubmit={(event) => void submit(event)}
      >
        <div className="cc-login-field-group">
          <label htmlFor="login-email">Email address</label>
          <input
            aria-describedby={emailError ? 'login-email-error' : undefined}
            aria-invalid={emailError !== null}
            autoComplete="email"
            id="login-email"
            onBlur={(event) => reportEmailValidity(event.currentTarget)}
            onChange={(event) => {
              setEmail(event.target.value);
              if (emailError) setEmailError(null);
            }}
            onInvalid={(event: InvalidEvent<HTMLInputElement>) =>
              reportEmailValidity(event.currentTarget)
            }
            placeholder="you@example.com"
            required
            type="email"
            value={email}
          />
          {emailError ? (
            <span className="cc-login-field-error" id="login-email-error" role="alert">
              {emailError}
            </span>
          ) : null}
        </div>
        <div className="cc-login-field-group">
          <div className="cc-login-label-row">
            <label htmlFor="login-password">Password</label>
            <Link to="/forgot-password">Forgot password?</Link>
          </div>
          <div className="cc-login-password-field">
            <input
              aria-describedby={passwordError ? 'login-password-error' : undefined}
              aria-invalid={passwordError !== null}
              autoComplete="current-password"
              id="login-password"
              minLength={8}
              onBlur={(event) => reportPasswordValidity(event.currentTarget)}
              onChange={(event) => {
                setPassword(event.target.value);
                if (passwordError) setPasswordError(null);
              }}
              onInvalid={(event: InvalidEvent<HTMLInputElement>) =>
                reportPasswordValidity(event.currentTarget)
              }
              required
              type={showPassword ? 'text' : 'password'}
              value={password}
            />
            <button
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
              className="cc-login-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              <PasswordVisibilityIcon visible={showPassword} />
            </button>
          </div>
          {passwordError ? (
            <span className="cc-login-field-error" id="login-password-error" role="alert">
              {passwordError}
            </span>
          ) : null}
        </div>
        <Button
          className="cc-login-action cc-login-submit"
          disabled={busy}
          loading={emailSubmitting}
          type="submit"
        >
          <span>{emailSubmitting ? 'Signing in…' : 'Sign in'}</span>
        </Button>
      </form>
    </>
  );
}
