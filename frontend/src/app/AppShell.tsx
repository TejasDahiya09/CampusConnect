import { clearOwnAvatar } from '../features/profile/own-avatar';
import { AccountAvatar } from '../features/profile/AccountAvatar';
import { Suspense, useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { cn } from '../components/class-names';
import { adminApi } from '../features/admin/admin-service';
import { useAuth } from '../features/auth/useAuth';
import { NotificationBell } from '../features/notifications/NotificationBell';
import { GlobalSearch } from '../features/search/GlobalSearch';
import { PublicThemeToggle } from '../components/PublicThemeToggle';
import {
  mobilePrimary,
  pageContextForPath,
  pageTitleForPath,
  primaryNavigation,
  routeMatches,
  workspaceNavigation,
  type NavItem,
} from './app-navigation';
import './app-shell.css';

const focusableSelector =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusFirst(container: HTMLElement | null) {
  container?.querySelector<HTMLElement>(focusableSelector)?.focus();
}

function containFocus(event: KeyboardEvent, container: HTMLElement | null) {
  if (event.key !== 'Tab' || !container) return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1) ?? first;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function DesktopNavLink({ item }: { readonly item: NavItem }) {
  return (
    <NavLink
      className={({ isActive }) => cn('cc-shell-nav-link', isActive && 'is-active')}
      end={item.path === '/home'}
      to={item.path}
    >
      {item.label}
    </NavLink>
  );
}

function UtilityLink({ icon, label, path }: NavItem) {
  return (
    <NavLink
      aria-label={label}
      className={({ isActive }) => cn('cc-shell-utility', isActive && 'is-active')}
      to={path}
    >
      <Icon className="size-[1.15rem]" name={icon} />
      <span className="cc-shell-utility-label">{label}</span>
    </NavLink>
  );
}

function AccountMenu({
  adminAuthorized,
  displayName,
  initials,
}: {
  readonly adminAuthorized: boolean;
  readonly displayName: string;
  readonly initials: string;
}) {
  const { applicationUser, logout } = useAuth();
  useEffect(() => {
    const id = applicationUser?.id;
    if (id) clearOwnAvatar(id);
    return () => {
      if (id) clearOwnAvatar(id);
    };
  }, [applicationUser?.id]);
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', keyboard);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', keyboard);
    };
  }, [open]);

  const visit = (path: string) => {
    setOpen(false);
    void navigate(path);
  };
  const signOut = async () => {
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      void navigate('/login', { replace: true });
    } catch {
      setSignOutError('We could not sign you out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="cc-shell-menu-root" ref={root}>
      <button
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Open account menu"
        className="cc-shell-avatar"
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >
        <AccountAvatar
          id={applicationUser?.id ?? ''}
          avatar={applicationUser?.profile?.avatar}
          fallback={initials}
        />
      </button>
      {open ? (
        <div className="cc-shell-dropdown cc-shell-account-menu" id={menuId} role="menu">
          <div className="cc-shell-account-identity">
            <span className="cc-shell-avatar" aria-hidden="true">
              <AccountAvatar
                id={applicationUser?.id ?? ''}
                avatar={applicationUser?.profile?.avatar}
                fallback={initials}
              />
            </span>
            <span className="min-w-0">
              <strong>{displayName}</strong>
              <small>{applicationUser?.email}</small>
            </span>
          </div>
          <div className="cc-shell-menu-section">
            <button
              className="cc-shell-menu-item"
              onClick={() => visit('/profile')}
              role="menuitem"
              type="button"
            >
              <Icon className="size-4" name="profile" /> My Profile
            </button>
            <button
              className="cc-shell-menu-item"
              onClick={() => visit('/settings')}
              role="menuitem"
              type="button"
            >
              <Icon className="size-4" name="settings" /> Settings
            </button>
          </div>
          {applicationUser?.role === 'MODERATOR' || applicationUser?.role === 'ADMIN' ? (
            <div className="cc-shell-menu-section">
              <p className="cc-shell-menu-label">Platform</p>
              <button
                className="cc-shell-menu-item"
                onClick={() => visit('/moderation')}
                role="menuitem"
                type="button"
              >
                <Icon className="size-4" name="shield" /> Moderation
              </button>
              {applicationUser.role === 'ADMIN' && adminAuthorized ? (
                <button
                  className="cc-shell-menu-item"
                  onClick={() => visit('/admin')}
                  role="menuitem"
                  type="button"
                >
                  <Icon className="size-4" name="analytics" /> Administration
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="cc-shell-menu-section">
            <button
              className="cc-shell-menu-item cc-shell-menu-item--danger"
              disabled={signingOut}
              onClick={() => void signOut()}
              role="menuitem"
              type="button"
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
            {signOutError ? (
              <p className="cc-shell-menu-error" role="alert">
                {signOutError}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExploreSheet({
  adminAuthorized,
  onClose,
  open,
  triggerRef,
}: {
  readonly adminAuthorized: boolean;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { applicationUser } = useAuth();
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const restoreFocus = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => focusFirst(panel.current));
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      containFocus(event, panel.current);
    };
    const desktop = window.matchMedia('(min-width: 1340px)');
    const resize = (event: MediaQueryListEvent) => {
      if (event.matches) onClose();
    };
    desktop.addEventListener('change', resize);
    window.addEventListener('keydown', keyboard);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      desktop.removeEventListener('change', resize);
      window.removeEventListener('keydown', keyboard);
      restoreFocus?.focus();
    };
  }, [onClose, open, triggerRef]);

  if (!open) return null;
  const platformLinks: NavItem[] = [];
  if (applicationUser?.role === 'MODERATOR' || applicationUser?.role === 'ADMIN')
    platformLinks.push({ icon: 'shield', label: 'Moderation', path: '/moderation' });
  if (applicationUser?.role === 'ADMIN' && adminAuthorized)
    platformLinks.push({ icon: 'analytics', label: 'Administration', path: '/admin' });

  const group = (label: string, items: readonly NavItem[]) => (
    <div className="cc-explore-group">
      <p className="cc-shell-menu-label">{label}</p>
      <nav aria-label={`${label} navigation`} className="cc-explore-grid">
        {items.map((item) => (
          <NavLink
            className={({ isActive }) => cn('cc-explore-link', isActive && 'is-active')}
            key={item.path}
            onClick={onClose}
            to={item.path}
          >
            <span className="cc-explore-icon">
              <Icon className="size-5" name={item.icon} />
            </span>
            <span>
              <strong>{item.label}</strong>
              <small>{pageContextForPath(item.path)}</small>
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );

  return (
    <div className="cc-explore-backdrop" role="presentation">
      <button
        aria-label="Close Explore navigation"
        className="cc-explore-scrim"
        onClick={onClose}
        type="button"
      />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="cc-explore-sheet"
        ref={panel}
        role="dialog"
      >
        <header className="cc-explore-header">
          <div>
            <p className="cc-eyebrow">Campus workspace</p>
            <h2 id={titleId}>Explore CampusConnect</h2>
          </div>
          <button
            aria-label="Close Explore navigation"
            className="cc-shell-utility"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-5" name="close" />
          </button>
        </header>
        <div className="cc-explore-scroll">
          {group('Core modules', primaryNavigation)}
          {group('Workspace', workspaceNavigation)}
          {platformLinks.length ? group('Privileged', platformLinks) : null}
        </div>
      </aside>
    </div>
  );
}

export function AppShell() {
  const { applicationUser } = useAuth();
  const [exploreOpen, setExploreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [verifiedAdminId, setVerifiedAdminId] = useState<string | null>(null);
  const exploreTrigger = useRef<HTMLButtonElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const title = pageTitleForPath(location.pathname);
  const adminAuthorized =
    applicationUser?.role === 'ADMIN' && verifiedAdminId === applicationUser.id;
  const closeExplore = useCallback(() => setExploreOpen(false), []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    searchTrigger.current?.focus();
  }, []);

  useEffect(() => {
    let active = true;
    if (applicationUser?.role === 'ADMIN')
      void adminApi.access().then(
        () => {
          if (active) setVerifiedAdminId(applicationUser.id);
        },
        () => {
          if (active) setVerifiedAdminId(null);
        },
      );
    return () => {
      active = false;
    };
  }, [applicationUser?.id, applicationUser?.role]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('#global-search')?.focus(),
    );
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        !target.closest('.cc-shell-search, .cc-shell-search-trigger')
      )
        closeSearch();
    };
    document.addEventListener('mousedown', outside);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener('mousedown', outside);
    };
  }, [closeSearch, searchOpen]);

  const displayName = applicationUser?.profile?.displayName ?? 'Campus student';
  const initials = displayName
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <div className="cc-app-shell min-h-screen">
      <a className="cc-skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="cc-top-nav">
        <div className="cc-top-nav-inner">
          <Link aria-label="CampusConnect Home" className="cc-shell-brand" to="/home">
            <span className="cc-shell-brand-mark">C</span>
            <span className="cc-shell-wordmark">CampusConnect</span>
          </Link>
          <nav aria-label="Primary application navigation" className="cc-shell-primary-nav">
            {primaryNavigation.map((item) => (
              <DesktopNavLink item={item} key={item.path} />
            ))}
          </nav>
          <button
            aria-expanded={exploreOpen}
            aria-haspopup="dialog"
            className="cc-shell-explore-trigger"
            onClick={() => setExploreOpen(true)}
            ref={exploreTrigger}
            type="button"
          >
            <Icon className="size-[1.1rem]" name="dashboard" />
            <span>Explore</span>
          </button>
          <div className={cn('cc-shell-search', searchOpen && 'is-open')}>
            <GlobalSearch autoFocus={searchOpen} onDismiss={closeSearch} />
          </div>
          <div className="cc-shell-utilities">
            <button
              aria-expanded={searchOpen}
              aria-label="Search CampusConnect"
              className="cc-shell-utility cc-shell-search-trigger"
              onClick={() => setSearchOpen((value) => !value)}
              ref={searchTrigger}
              type="button"
            >
              <Icon className="size-[1.15rem]" name="search" />
            </button>
            <div className="cc-shell-assistant">
              <UtilityLink icon="ai" label="Campus Assistant" path="/assistant" />
            </div>
            <div className="cc-shell-messages">
              <UtilityLink icon="message" label="Messages" path="/messages" />
            </div>
            <NotificationBell />
            <div className="cc-shell-theme">
              <PublicThemeToggle />
            </div>
            <AccountMenu
              adminAuthorized={adminAuthorized}
              displayName={displayName}
              initials={initials}
            />
          </div>
        </div>
      </header>
      <main aria-label={title} data-workspace={title} id="main-content">
        <Suspense fallback={<RouteLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <nav aria-label="Mobile navigation" className="cc-mobile-nav">
        {mobilePrimary.map((item) => {
          const active = routeMatches(location.pathname, item.path);
          return (
            <NavLink
              aria-label={item.path === '/assistant' ? 'Campus Assistant' : item.label}
              className={cn('cc-mobile-nav-link', active && 'cc-mobile-nav-link--active')}
              key={item.path}
              to={item.path}
            >
              <Icon className="size-5" name={item.icon} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <ExploreSheet
        adminAuthorized={adminAuthorized}
        onClose={closeExplore}
        open={exploreOpen}
        triggerRef={exploreTrigger}
      />
    </div>
  );
}

function RouteLoadingFallback() {
  return (
    <div aria-live="polite" className="cc-page" role="status">
      <span className="sr-only">Loading page</span>
      <div className="grid gap-4">
        <div className="cc-skeleton h-9 max-w-sm" />
        <div className="cc-skeleton h-4 max-w-xl" />
        <div className="cc-skeleton mt-4 h-64" />
      </div>
    </div>
  );
}
