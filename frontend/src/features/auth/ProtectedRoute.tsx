import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { toLoginRedirect } from './auth-routing';
import { useAuth } from './useAuth';

interface ProtectedRouteProps {
  readonly children: ReactNode;
  readonly loadingFallback?: ReactNode;
}

export function ProtectedRoute({ children, loadingFallback = null }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return loadingFallback;
  }

  return isAuthenticated ? (
    children
  ) : (
    <Navigate replace to={toLoginRedirect(location.pathname, location.search, location.hash)} />
  );
}
