import type { Session } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { frontendEnv } from '../../config/env';
import { getSupabaseClient } from '../../lib/supabase';
import { AuthContext, type AuthContextValue } from './auth-context';
import { authErrorMessage } from './auth-errors';
import {
  login,
  logout,
  register,
  requestPasswordReset,
  signInWithGoogle,
  synchronizeApplicationUser,
  updatePassword,
} from './auth-service';
import type { ApplicationUser } from './auth.types';

export function AuthProvider({ children }: PropsWithChildren) {
  const sessionVersion = useRef(0);
  const [session, setSession] = useState<Session | null>(null);
  const [applicationUser, setApplicationUser] = useState<ApplicationUser | null>(null);
  const [isLoading, setIsLoading] = useState(frontendEnv.authConfigured);
  const [error, setError] = useState<string | null>(
    frontendEnv.authConfigured ? null : 'Supabase Auth public configuration is required.',
  );

  useEffect(() => {
    if (!frontendEnv.authConfigured) {
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;

    const applySession = async (nextSession: Session | null) => {
      const version = ++sessionVersion.current;
      if (!active) {
        return;
      }

      setSession(nextSession);
      setError(null);

      if (nextSession === null) {
        setApplicationUser(null);
        setIsLoading(false);
        return;
      }

      try {
        const synchronizedUser = await synchronizeApplicationUser();

        if (active && sessionVersion.current === version) {
          setApplicationUser(synchronizedUser);
        }
      } catch (synchronizationError) {
        if (active && sessionVersion.current === version) {
          setApplicationUser(null);
          setError(
            authErrorMessage(synchronizationError, 'Authentication could not be completed.'),
          );
        }
      } finally {
        if (active && sessionVersion.current === version) {
          setIsLoading(false);
        }
      }
    };

    const initialVersion = sessionVersion.current;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (sessionVersion.current === initialVersion) return applySession(data.session);
      })
      .catch((sessionError: unknown) => {
        if (active && sessionVersion.current === initialVersion) {
          setError(authErrorMessage(sessionError, 'Authentication could not be initialized.'));
          setIsLoading(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      queueMicrotask(() => void applySession(nextSession));
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      applicationUser,
      error,
      isAuthenticated: applicationUser !== null && session !== null,
      isLoading,
      login: async (input) => {
        setIsLoading(true);
        setError(null);
        try {
          const nextSession = await login(input);
          setSession(nextSession);
          setApplicationUser(await synchronizeApplicationUser());
        } catch (loginError) {
          setApplicationUser(null);
          setError(authErrorMessage(loginError, 'Authentication could not be completed.'));
          setIsLoading(false);
          throw loginError;
        } finally {
          setIsLoading(false);
        }
      },
      logout: async () => {
        sessionVersion.current++;
        await logout();
        setApplicationUser(null);
        setSession(null);
      },
      register,
      requestPasswordReset,
      session,
      signInWithGoogle,
      updatePassword,
      user: session?.user ?? null,
    }),
    [applicationUser, error, isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
