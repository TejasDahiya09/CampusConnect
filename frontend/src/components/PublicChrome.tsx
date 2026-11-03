import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { PublicThemeToggle } from './PublicThemeToggle';

export function PublicBrand({ compact = false }: { readonly compact?: boolean }) {
  return (
    <Link aria-label="CampusConnect home" className="cc-public-brand" to="/">
      <span aria-hidden="true" className="cc-public-brand-mark">
        <span>C</span>
      </span>
      {compact ? null : <span>CampusConnect</span>}
    </Link>
  );
}

export function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 16);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    header.current?.querySelector<HTMLAnchorElement>('.cc-public-mobile-nav > a')?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      menuButton.current?.focus();
    };
    window.addEventListener('keydown', close);
    const closeOutside = (event: PointerEvent) => {
      if (!header.current?.contains(event.target as Node)) {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    window.addEventListener('pointerdown', closeOutside);
    const desktop = window.matchMedia('(min-width: 1100px)');
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      setOpen(false);
      header.current?.querySelector<HTMLAnchorElement>('.cc-public-brand')?.focus();
    };
    desktop.addEventListener('change', closeOnDesktop);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', closeOutside);
      desktop.removeEventListener('change', closeOnDesktop);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);
  return (
    <header
      className={`cc-public-header${scrolled ? ' cc-public-header--scrolled' : ''}`}
      ref={header}
    >
      <div className="cc-public-header-inner">
        <PublicBrand />
        <nav aria-label="Public navigation" className="cc-public-desktop-nav">
          <a className="cc-public-nav-link" href="#product">
            Product
          </a>
          <a className="cc-public-nav-link" href="#how-it-works">
            How it works
          </a>
          <a className="cc-public-nav-link" href="#trust">
            Built for students
          </a>
        </nav>
        <div className="cc-public-desktop-actions">
          <PublicThemeToggle />
          <Link className="cc-public-signin" to="/login">
            Sign in
          </Link>
          <Link className="cc-public-get-started" to="/register">
            Get started
          </Link>
        </div>
        <div className="cc-public-mobile-actions">
          <PublicThemeToggle />
          <button
            aria-expanded={open}
            aria-controls="public-mobile-navigation"
            aria-label={open ? 'Close Explore menu' : 'Open Explore menu'}
            className="cc-public-menu-trigger"
            onClick={() => setOpen((value) => !value)}
            ref={menuButton}
            type="button"
          >
            <Icon name={open ? 'close' : 'dashboard'} />
            <span>{open ? 'Close' : 'Explore'}</span>
          </button>
        </div>
      </div>
      {open ? (
        <nav
          aria-label="Mobile public navigation"
          className="cc-public-mobile-nav"
          id="public-mobile-navigation"
        >
          <a href="#product" onClick={closeMenu}>
            Product
          </a>
          <a href="#how-it-works" onClick={closeMenu}>
            How it works
          </a>
          <a href="#trust" onClick={closeMenu}>
            Built for students
          </a>
          <div className="cc-public-mobile-cta">
            <Link className="cc-public-signin" to="/login">
              Sign in
            </Link>
            <Link className="cc-public-get-started" to="/register">
              Get started
            </Link>
          </div>
        </nav>
      ) : null}
    </header>
  );
}

export function PublicFooter({ children }: { readonly children?: ReactNode }) {
  return (
    <footer className="cc-public-footer">
      <div className="cc-public-footer-inner">
        <div>
          <PublicBrand />
          <p className="mt-3 text-sm text-[var(--cc-muted)]">
            Campus life, connected with purpose.
          </p>
        </div>
        {children ?? (
          <nav aria-label="Footer navigation" className="cc-public-footer-nav">
            <div>
              <strong>Platform</strong>
              <a href="#product">Product</a>
              <a href="#how-it-works">How it works</a>
              <a href="#trust">Built for students</a>
            </div>
            <div>
              <strong>Account</strong>
              <Link to="/login">Sign in</Link>
              <Link to="/register">Create account</Link>
              <Link to="/forgot-password">Password recovery</Link>
            </div>
            <div>
              <strong>CampusConnect</strong>
              <Link to="/">Home</Link>
              <a href="mailto:campusconnectteams@gmail.com">Contact support</a>
            </div>
          </nav>
        )}
      </div>
    </footer>
  );
}
