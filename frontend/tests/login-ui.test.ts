import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { PublicThemeToggle } from '../src/components/PublicThemeToggle.js';
import { ThemeContext } from '../src/features/theme/theme-context.js';
import { authErrorMessage } from '../src/features/auth/auth-errors.js';
import { LoginForm } from '../src/features/auth/LoginForm.js';
import { LoginKineticRibbon } from '../src/features/auth/LoginKineticRibbon.js';
import { LoginStory, SessionRestorationStatus } from '../src/features/auth/LoginStory.js';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');
const renderForm = (overrides: Partial<Parameters<typeof LoginForm>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(LoginForm, {
        authError: null,
        emailSubmitting: false,
        googleSubmitting: false,
        onEmailSubmit: () => Promise.resolve(),
        onGoogleSubmit: () => Promise.resolve(),
        ...overrides,
      }),
    ),
  );

void describe('premium Login presentation', () => {
  void it('renders labelled email/password fields and the established account routes', () => {
    const html = renderForm();
    assert.match(html, /<label for="login-email">Email address<\/label>/);
    assert.match(html, /autoComplete="email"[^>]*id="login-email"/);
    assert.match(html, /<label for="login-password">Password<\/label>/);
    assert.match(html, /autoComplete="current-password"[^>]*id="login-password"/);
    assert.match(html, /href="\/forgot-password"/);
    assert.match(html, /Continue with Google/);
    assert.match(html, /type="submit"/);
  });

  void it('exposes accessible password visibility and authentication errors', () => {
    const html = renderForm({ authError: 'The email or password is incorrect.' });
    assert.match(html, /aria-label="Show password"/);
    assert.match(html, /aria-pressed="false"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /aria-live="assertive"/);
    assert.match(html, /The email or password is incorrect/);
  });

  void it('coordinates email and Google busy states across both initiation controls', () => {
    const emailBusy = renderForm({ emailSubmitting: true });
    const googleBusy = renderForm({ googleSubmitting: true });
    assert.equal((emailBusy.match(/disabled=""/g) ?? []).length, 2);
    assert.equal((googleBusy.match(/disabled=""/g) ?? []).length, 2);
    assert.match(emailBusy, />Signing in…<\/span>/);
    assert.match(googleBusy, />Connecting to Google…<\/span>/);
    assert.match(emailBusy, /aria-busy="true"/);
    assert.match(googleBusy, /aria-busy="true"/);
  });

  void it('uses one decorative kinetic ribbon without the retired network or repeated branding', () => {
    const html = renderToStaticMarkup(createElement(LoginKineticRibbon));
    assert.match(html, /cc-login-ribbon-layer--main/);
    assert.match(html, /cc-login-ribbon-highlight/);
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /focusable="false"/);
    assert.equal((html.match(/<path/g) ?? []).length, 4);
    assert.equal((html.match(/<animate/g) ?? []).length, 4);
    assert.equal((html.match(/attributeName="d"/g) ?? []).length, 4);
    assert.match(html, /dur="9s"/);
    assert.match(html, /dur="12s"/);
    assert.match(html, /dur="11s"/);
    assert.match(html, /dur="6\.5s"/);
    assert.doesNotMatch(html, /<circle|>C<|brand-core|brand-orbit|brand-node|brand-route/);
    assert.doesNotMatch(
      html,
      /Marketplace|TeamUp|Lost &amp; Found|Services|Campus Assistant|email|phone|enrollment/i,
    );
    assert.doesNotMatch(html, /tabindex|<button|<a\b|role=/i);
  });

  void it('provides static reduced-motion styling for every decorative animation', async () => {
    const [styles, motif] = await Promise.all([
      source('features/auth/login.css'),
      source('features/auth/LoginKineticRibbon.tsx'),
    ]);
    const reducedMotion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)'));
    assert.match(reducedMotion, /animation: none !important/);
    assert.match(reducedMotion, /transition: none !important/);
    assert.match(styles, /cc-login-ribbon-flow/);
    assert.match(styles, /cc-login-ribbon-light/);
    assert.match(styles, /animation-play-state: paused !important/);
    assert.match(motif, /visibilitychange/);
    assert.match(motif, /IntersectionObserver/);
    assert.match(motif, /observer\?\.disconnect\(\)/);
    assert.match(motif, /prefers-reduced-motion: reduce/);
    assert.match(motif, /pauseAnimations\(\)/);
    assert.match(motif, /unpauseAnimations\(\)/);
    assert.doesNotMatch(styles, /requestAnimationFrame|animation-timeline|scroll-timeline/);
  });

  void it('removes all pointer animation code without changing the Login form', async () => {
    const [story, motif, styles, form] = await Promise.all([
      source('features/auth/LoginStory.tsx'),
      source('features/auth/LoginKineticRibbon.tsx'),
      source('features/auth/login.css'),
      source('features/auth/LoginForm.tsx'),
    ]);
    for (const content of [story, motif, styles, form]) {
      assert.doesNotMatch(
        content,
        /pointermove|pointerleave|requestAnimationFrame|cancelAnimationFrame|login-pointer|--login-pointer/,
      );
    }
  });

  void it('renders clean UTF-8 copy across editorial, loading, error and theme states', () => {
    const story = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(LoginStory)),
    );
    const restoration = renderToStaticMarkup(createElement(SessionRestorationStatus));
    const defaultForm = renderForm();
    const googleLoading = renderForm({ googleSubmitting: true });
    const emailLoading = renderForm({ emailSubmitting: true });
    const errors = [
      authErrorMessage(new Error('Invalid login credentials'), 'Sign in failed.'),
      authErrorMessage(new Error('Email not confirmed'), 'Sign in failed.'),
      authErrorMessage(new Error('Network request failed'), 'Sign in failed.'),
    ].map((message) => renderForm({ authError: message }));
    const theme = renderToStaticMarkup(
      createElement(
        ThemeContext.Provider,
        { value: { mode: 'light', resolvedTheme: 'light', setMode: () => undefined } },
        createElement(PublicThemeToggle),
      ),
    );
    const rendered = [
      story,
      restoration,
      defaultForm,
      googleLoading,
      emailLoading,
      theme,
      ...errors,
    ].join(' ');

    assert.match(story, /Your next move starts here/);
    assert.match(
      story,
      /Ideas worth exploring\. People worth meeting\. Opportunities worth taking\./,
    );
    assert.doesNotMatch(
      story,
      /Good things start with a connection|Your campus, reconnected|One campus|connected workspace/i,
    );
    assert.match(restoration, /Restoring your secure session…/);
    assert.match(defaultForm, /Continue with Google/);
    assert.match(googleLoading, /Connecting to Google…/);
    assert.match(emailLoading, /Signing in…/);
    assert.match(theme, /Switch to dark mode/);
    assert.match(rendered, /The email or password is incorrect/);
    assert.match(rendered, /Confirm your email address before signing in/);
    assert.match(rendered, /We could not reach the authentication service/);
    assert.doesNotMatch(rendered, /â€¦|â€“|â€”|â€|Â|�/u);
  });

  void it('uses the existing auth context, safe redirect helper and one-click theme control', async () => {
    const login = await source('features/auth/LoginPage.tsx');
    assert.match(login, /useAuth\(\)/);
    assert.match(login, /redirectFromSearch\(location\.search\)/);
    assert.match(login, /await login\(\{ email, password \}\)/);
    assert.match(login, /await signInWithGoogle\(destination\)/);
    assert.match(login, /operationActive\.current/);
    assert.match(login, /<PublicThemeToggle \/>/);
    assert.equal(login.includes('getSupabaseClient'), false);
    assert.equal(login.includes('signInWithPassword'), false);
  });

  void it('uses first-session loading without replacing later form submission states', async () => {
    const login = await source('features/auth/LoginPage.tsx');
    assert.match(login, /initialSessionResolved/);
    assert.match(login, /setInitialSessionResolved\(true\)/);
    assert.match(login, /window\.clearTimeout\(timer\)/);
    assert.match(login, /if \(!initialSessionResolved\) return <LoginInitialization \/>/);
    assert.match(login, /if \(isAuthenticated\) return <Navigate replace to=\{destination\} \/>/);
  });

  void it('keeps Login isolated and leaves the shared auth pages on their existing shell', async () => {
    const [app, authPages, styles] = await Promise.all([
      source('app/App.tsx'),
      source('features/auth/AuthPages.tsx'),
      source('features/auth/login.css'),
    ]);
    assert.match(app, /import\('\.\.\/features\/auth\/LoginPage'\)/);
    assert.match(app, /<Suspense fallback=\{<LoadingScreen \/>\}>/);
    assert.equal(authPages.includes('export function LoginPage'), false);
    for (const page of [
      'RegisterPage',
      'ForgotPasswordPage',
      'ResetPasswordPage',
      'AuthCallbackPage',
    ])
      assert.match(authPages, new RegExp(`export function ${page}`));
    assert.match(authPages, /<PremiumAuthLayout/);
    assert.match(authPages, /variant="callback"/);
    assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(styles, /@media \(max-width: 359px\)/);
    assert.match(styles, /@media \(min-width: 1120px\) and \(max-height: 790px\)/);
  });
});
