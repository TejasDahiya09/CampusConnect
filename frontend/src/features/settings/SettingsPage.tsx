import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../../components/ui';
import { useAuth } from '../auth/useAuth';
import { PublicThemeToggle } from '../../components/PublicThemeToggle';
import { settingsApi, validateNewPassword, type SettingsAccount } from './settings-service';

export function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState<SettingsAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [passwordState, setPasswordState] = useState<'idle' | 'saving' | 'success'>('idle');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [deactivationError, setDeactivationError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    void settingsApi
      .account()
      .then(setAccount)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    let active = true;
    void settingsApi
      .account()
      .then((value) => {
        if (active) setAccount(value);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    const validation = validateNewPassword(newPassword, confirmation);
    if (validation) {
      setPasswordError(validation);
      return;
    }
    setPasswordState('saving');
    setPasswordError(null);
    try {
      await settingsApi.changePassword(newPassword, confirmation);
      setNewPassword('');
      setConfirmation('');
      setPasswordState('success');
    } catch (error) {
      setPasswordState('idle');
      setPasswordError(
        error instanceof Error ? error.message : 'The password could not be updated.',
      );
    }
  };
  const signOut = async () => {
    setSigningOut(true);
    setLogoutError(null);
    try {
      await logout();
      void navigate('/login', { replace: true });
    } catch {
      setLogoutError('Sign out could not be completed. Please try again.');
      setSigningOut(false);
    }
  };
  const deactivate = async () => {
    setDeactivating(true);
    setDeactivationError(null);
    try {
      await settingsApi.deactivate();
      await logout();
      void navigate('/login', { replace: true });
    } catch {
      setDeactivating(false);
      setDeactivationError('Account deactivation could not be completed. Please try again.');
    }
  };

  return (
    <div className="cc-page max-w-4xl">
      <PageHeader
        description="Manage your account, password, and access to CampusConnect."
        eyebrow="Account settings"
        title="Settings"
      />
      {loading ? (
        <div aria-label="Loading settings" className="mt-6 grid gap-5">
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : loadError || !account ? (
        <Card className="mt-6">
          <EmptyState
            action={<Button onClick={load}>Retry</Button>}
            description="Your account settings could not be loaded."
            icon="warning"
            title="Settings unavailable"
          />
        </Card>
      ) : (
        <div className="mt-6 grid gap-5">
          <Card className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Account</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Your authenticated CampusConnect identity.
                </p>
              </div>
              <Badge tone="success">{account.status}</Badge>
            </div>
            <dl className="mt-6 grid gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Display name
                </dt>
                <dd className="mt-2 text-sm text-slate-200">{account.displayName}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Email
                </dt>
                <dd className="mt-2 break-all text-sm text-slate-200">{account.email}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Email is managed by your authenticated identity and is read-only in Settings.
            </p>
            <Link className="cc-button cc-button--secondary mt-5 inline-flex" to="/profile">
              Edit profile
            </Link>
          </Card>

          <Card className="p-5 sm:p-7">
            <h2 className="text-lg font-semibold">Security</h2>
            <p className="mt-1 text-sm text-slate-500">
              Change your password securely through Supabase Auth.
            </p>
            <form
              className="mt-6 grid max-w-xl gap-4"
              onSubmit={(event) => void changePassword(event)}
            >
              <label className="cc-label">
                New password
                <input
                  autoComplete="new-password"
                  className="cc-field"
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => {
                    setNewPassword(event.target.value);
                    setPasswordState('idle');
                  }}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="cc-label">
                Confirm new password
                <input
                  autoComplete="new-password"
                  className="cc-field"
                  maxLength={128}
                  minLength={8}
                  onChange={(event) => {
                    setConfirmation(event.target.value);
                    setPasswordState('idle');
                  }}
                  required
                  type="password"
                  value={confirmation}
                />
              </label>
              <p className="text-xs text-slate-500">Use between 8 and 128 characters.</p>
              {passwordError ? (
                <p className="text-sm text-rose-300" role="alert">
                  {passwordError}
                </p>
              ) : null}
              {passwordState === 'success' ? (
                <p className="text-sm text-emerald-300" role="status">
                  Password updated successfully.
                </p>
              ) : null}
              <div>
                <Button disabled={passwordState === 'saving'} type="submit">
                  {passwordState === 'saving' ? 'Updating password…' : 'Update password'}
                </Button>
              </div>
            </form>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Appearance</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Switch directly between the light and dark CampusConnect themes.
              </p>
              <div className="mt-5">
                <PublicThemeToggle />
              </div>
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold">Privacy</h2>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-slate-400">
                <li>Public profiles expose only controlled public fields.</li>
                <li>Authentication credentials are never included in public profiles.</li>
                <li>
                  Messages are encrypted at rest; CampusConnect does not claim end-to-end
                  encryption.
                </li>
              </ul>
            </Card>
          </div>

          <Card className="border-rose-300/20 p-5 sm:p-7">
            <h2 className="text-lg font-semibold">Account actions</h2>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium">Sign out</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  End your current CampusConnect session.
                </p>
                <Button
                  className="mt-4"
                  disabled={signingOut}
                  onClick={() => void signOut()}
                  variant="secondary"
                >
                  {signingOut ? 'Signing out…' : 'Sign out'}
                </Button>
                {logoutError ? (
                  <p className="mt-2 text-xs text-rose-300" role="alert">
                    {logoutError}
                  </p>
                ) : null}
              </div>
              <div>
                <h3 className="text-sm font-medium text-rose-200">Deactivate account</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Disable account access without permanently deleting your data or historical
                  records.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => {
                    setConfirmDeactivate(true);
                    setDeactivationError(null);
                  }}
                  variant="danger"
                >
                  Deactivate account
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
      <Modal
        description="Your access will be disabled. Your profile and historical platform records will remain; this is not permanent deletion."
        onClose={() => {
          if (!deactivating) setConfirmDeactivate(false);
        }}
        open={confirmDeactivate}
        title="Deactivate your account?"
      >
        {deactivationError ? (
          <p className="mb-4 text-sm text-rose-300" role="alert">
            {deactivationError}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            disabled={deactivating}
            onClick={() => setConfirmDeactivate(false)}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button disabled={deactivating} onClick={() => void deactivate()} variant="danger">
            {deactivating ? 'Deactivating…' : 'Yes, deactivate my account'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
