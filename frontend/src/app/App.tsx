import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Card, EmptyState } from '../components/ui';
import { adminApi } from '../features/admin/admin-service';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { useAuth } from '../features/auth/useAuth';
import { LandingPage } from '../features/landing/LandingPage';
import { AppShell } from './AppShell';

const lazyNamed = <T extends Record<string, unknown>, K extends keyof T>(
  loader: () => Promise<T>,
  name: K,
) => lazy(async () => ({ default: (await loader())[name] as ComponentType }));

const LoginPage = lazyNamed(() => import('../features/auth/LoginPage'), 'LoginPage');
const authPages = () => import('../features/auth/AuthPages');
const RegisterPage = lazyNamed(authPages, 'RegisterPage');
const ForgotPasswordPage = lazyNamed(authPages, 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(authPages, 'ResetPasswordPage');
const AuthCallbackPage = lazyNamed(authPages, 'AuthCallbackPage');
const AdminPage = lazyNamed(() => import('../features/admin/AdminPage'), 'AdminPage');
const AIAssistantPage = lazyNamed(
  () => import('../features/ai/AIAssistantPage'),
  'AIAssistantPage',
);
const AnalyticsPage = lazyNamed(
  () => import('../features/analytics/AnalyticsPage'),
  'AnalyticsPage',
);
const DashboardPage = lazyNamed(
  () => import('../features/dashboard/DashboardPage'),
  'DashboardPage',
);
const HomePage = lazyNamed(() => import('../features/home/HomePage'), 'HomePage');
const lostFoundPages = () => import('../features/lost-found/LostFoundPages');
const LostFoundCreatePage = lazyNamed(lostFoundPages, 'LostFoundCreatePage');
const LostFoundDetailPage = lazyNamed(lostFoundPages, 'LostFoundDetailPage');
const LostFoundEditPage = lazyNamed(lostFoundPages, 'LostFoundEditPage');
const LostFoundMatchesPage = lazyNamed(lostFoundPages, 'LostFoundMatchesPage');
const LostFoundPage = lazyNamed(lostFoundPages, 'LostFoundPage');
const LostFoundSavedPage = lazyNamed(lostFoundPages, 'LostFoundSavedPage');
const MyReportsPage = lazyNamed(
  () => import('../features/lost-found/MyReportsPage'),
  'MyReportsPage',
);
const MyListingsPage = lazyNamed(
  () => import('../features/marketplace/MyListingsPage'),
  'MyListingsPage',
);
const CreateListingPage = lazy(() =>
  import('../features/marketplace/CreateListingPage').then(({ CreateListingPage }) => ({
    default: CreateListingPage,
  })),
);
const EditListingPage = lazy(() =>
  import('../features/marketplace/EditListingPage').then(({ EditListingPage }) => ({
    default: EditListingPage,
  })),
);
const ListingDetailPage = lazy(() =>
  import('../features/marketplace/ListingDetailPage').then(({ ListingDetailPage }) => ({
    default: ListingDetailPage,
  })),
);
const MarketplacePage = lazy(() =>
  import('../features/marketplace/MarketplacePage').then(({ MarketplacePage }) => ({
    default: MarketplacePage,
  })),
);
const SavedListingsPage = lazy(() =>
  import('../features/marketplace/SavedListingsPage').then(({ SavedListingsPage }) => ({
    default: SavedListingsPage,
  })),
);
const MessagesPage = lazyNamed(() => import('../features/messaging/MessagesPage'), 'MessagesPage');
const NotificationsPage = lazyNamed(
  () => import('../features/notifications/NotificationsPage'),
  'NotificationsPage',
);
const ModerationPage = lazyNamed(
  () => import('../features/moderation/ModerationPage'),
  'ModerationPage',
);
const ProfilePage = lazyNamed(() => import('../features/profile/ProfilePage'), 'ProfilePage');
const PublicProfilePage = lazy(() =>
  import('../features/profile/PublicProfilePage').then(({ PublicProfilePage }) => ({
    default: PublicProfilePage,
  })),
);
const SearchPage = lazyNamed(() => import('../features/search/SearchPage'), 'SearchPage');
const servicePages = () => import('../features/services/ServicePages');
const SavedServicesPage = lazyNamed(servicePages, 'SavedServicesPage');
const ServiceCreatePage = lazyNamed(servicePages, 'ServiceCreatePage');
const ServiceDetailPage = lazyNamed(servicePages, 'ServiceDetailPage');
const ServiceEditPage = lazyNamed(servicePages, 'ServiceEditPage');
const ServicesPage = lazyNamed(servicePages, 'ServicesPage');
const SettingsPage = lazyNamed(() => import('../features/settings/SettingsPage'), 'SettingsPage');
const teamUpPages = () => import('../features/teamup/TeamUpPages');
const MyProjectsPage = lazyNamed(teamUpPages, 'MyProjectsPage');
const TeamUpCreatePage = lazyNamed(teamUpPages, 'TeamUpCreatePage');
const TeamUpDetailPage = lazyNamed(teamUpPages, 'TeamUpDetailPage');
const TeamUpEditPage = lazyNamed(teamUpPages, 'TeamUpEditPage');
const TeamUpPage = lazyNamed(teamUpPages, 'TeamUpPage');

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--cc-bg)] px-6 text-center">
      <div>
        <span
          aria-label="Loading CampusConnect"
          className="mx-auto block size-9 animate-spin rounded-full border-2 border-[var(--cc-primary)] border-t-transparent"
          role="status"
        />
        <p className="mt-4 text-sm text-[var(--cc-muted)]">
          Preparing your CampusConnect workspace…
        </p>
      </div>
    </main>
  );
}
function LandingRoute() {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? <Navigate replace to="/home" /> : <LandingPage />;
}
function ProtectedShell() {
  return (
    <ProtectedRoute loadingFallback={<LoadingScreen />}>
      <AppShell />
    </ProtectedRoute>
  );
}
function ModeratorRoute() {
  const { applicationUser } = useAuth();
  return applicationUser?.role === 'MODERATOR' || applicationUser?.role === 'ADMIN' ? (
    <ModerationPage />
  ) : (
    <Navigate replace to="/home" />
  );
}
function AdminRoute() {
  const { applicationUser } = useAuth();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (applicationUser?.role === 'ADMIN')
      void adminApi
        .access()
        .then(() => {
          if (active) setAuthorized(true);
        })
        .catch(() => {
          if (active) setAuthorized(false);
        });
    return () => {
      active = false;
    };
  }, [applicationUser?.id, applicationUser?.role]);
  if (applicationUser?.role !== 'ADMIN') return <Navigate replace to="/home" />;
  if (authorized === null) return <LoadingScreen />;
  return authorized ? <AdminPage /> : <Navigate replace to="/home" />;
}

function ExistingPage({
  children,
}: {
  readonly children: (navigate: (path: string) => void) => ReactNode;
}) {
  const navigate = useNavigate();
  return children((path) => void navigate(path));
}
function EditListingRoute() {
  const { id = '' } = useParams();
  return (
    <ExistingPage>{(navigate) => <EditListingPage id={id} navigate={navigate} />}</ExistingPage>
  );
}
function ListingDetailRoute() {
  const { id = '' } = useParams();
  return (
    <ExistingPage>{(navigate) => <ListingDetailPage id={id} navigate={navigate} />}</ExistingPage>
  );
}
function PublicProfileRoute() {
  const { userId = '' } = useParams();
  return <PublicProfilePage key={userId} userId={userId} />;
}
function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <main className="cc-public-state">
      <Card className="w-full max-w-xl">
        <EmptyState
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <button
                className="cc-button cc-button--secondary"
                onClick={() => void navigate(-1)}
                type="button"
              >
                Go back
              </button>
              <a className="cc-button cc-button--primary" href="/">
                Return home
              </a>
            </div>
          }
          description="We could not find that page. It may have moved, or the address may be incomplete."
          icon="search"
          title="Page not found"
        />
      </Card>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route element={<LandingRoute />} path="/" />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <LoginPage />
          </Suspense>
        }
        path="/login"
      />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <RegisterPage />
          </Suspense>
        }
        path="/register"
      />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <ForgotPasswordPage />
          </Suspense>
        }
        path="/forgot-password"
      />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <ResetPasswordPage />
          </Suspense>
        }
        path="/reset-password"
      />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <ResetPasswordPage />
          </Suspense>
        }
        path="/auth/reset-password"
      />
      <Route
        element={
          <Suspense fallback={<LoadingScreen />}>
            <AuthCallbackPage />
          </Suspense>
        }
        path="/auth/callback"
      />
      <Route element={<ProtectedShell />}>
        <Route element={<Navigate replace to="/home" />} path="/app" />
        <Route element={<HomePage />} path="/home" />
        <Route element={<DashboardPage />} path="/dashboard" />
        <Route element={<ProfilePage />} path="/profile" />
        <Route element={<Navigate replace to="/profile" />} path="/profile/public" />
        <Route element={<PublicProfileRoute />} path="/profile/:userId" />
        <Route
          element={
            <ExistingPage>{(navigate) => <MarketplacePage navigate={navigate} />}</ExistingPage>
          }
          path="/marketplace"
        />
        <Route
          element={
            <ExistingPage>{(navigate) => <SavedListingsPage navigate={navigate} />}</ExistingPage>
          }
          path="/marketplace/saved"
        />
        <Route
          element={
            <ExistingPage>{(navigate) => <CreateListingPage navigate={navigate} />}</ExistingPage>
          }
          path="/marketplace/new"
        />
        <Route element={<EditListingRoute />} path="/marketplace/:id/edit" />
        <Route element={<MyListingsPage />} path="/marketplace/my-listings" />
        <Route element={<ListingDetailRoute />} path="/marketplace/:id" />
        <Route element={<LostFoundPage />} path="/lost-found" />
        <Route element={<LostFoundSavedPage />} path="/lost-found/saved" />
        <Route element={<MyReportsPage />} path="/lost-found/my-reports" />
        <Route element={<LostFoundCreatePage />} path="/lost-found/new" />
        <Route element={<LostFoundMatchesPage />} path="/lost-found/matches" />
        <Route element={<LostFoundEditPage />} path="/lost-found/:id/edit" />
        <Route element={<LostFoundDetailPage />} path="/lost-found/:id" />
        <Route element={<TeamUpPage />} path="/teamup" />
        <Route element={<TeamUpCreatePage />} path="/teamup/new" />
        <Route element={<MyProjectsPage />} path="/teamup/my-projects" />
        <Route element={<TeamUpEditPage />} path="/teamup/:id/edit" />
        <Route element={<TeamUpDetailPage />} path="/teamup/:id" />
        <Route element={<ServicesPage />} path="/services" />
        <Route element={<ServiceCreatePage />} path="/services/new" />
        <Route element={<SavedServicesPage />} path="/services/saved" />
        <Route element={<ServiceEditPage />} path="/services/:id/edit" />
        <Route element={<ServiceDetailPage />} path="/services/:id" />
        <Route element={<MessagesPage />} path="/messages" />
        <Route element={<MessagesPage />} path="/messages/:id" />
        <Route element={<NotificationsPage />} path="/notifications" />
        <Route element={<AIAssistantPage />} path="/assistant" />
        <Route element={<AnalyticsPage />} path="/analytics" />
        <Route element={<AdminRoute />} path="/admin" />
        <Route element={<SettingsPage />} path="/settings" />
        <Route element={<SearchPage />} path="/search" />
        <Route element={<ModeratorRoute />} path="/moderation" />
      </Route>
      <Route element={<NotFoundPage />} path="/404" />
      <Route element={<NotFoundPage />} path="*" />
    </Routes>
  );
}
