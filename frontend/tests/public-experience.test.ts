import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void describe('premium public experience', () => {
  void it('provides the approved product-led hero with truthful calls to action', async () => {
    const landing = await source('features/landing/LandingPage.tsx');
    const hero = await source('features/landing/LandingHero.tsx');
    assert.match(hero, /Everything student life needs, finally connected/);
    assert.match(hero, /Create your account/);
    assert.match(hero, /to="\/register"/);
    assert.match(hero, /Explore the product/);
    assert.match(hero, /href="#product"/);
    assert.match(landing, /id="how-it-works"/);
    assert.match(landing, /id="trust"/);
    assert.equal(landing.includes('testimonial'), false);
    assert.equal(hero.includes('verified student'), false);
  });

  void it('provides an accessible responsive public menu and theme control', async () => {
    const chrome = await source('components/PublicChrome.tsx');
    const themeToggle = await source('components/PublicThemeToggle.tsx');
    assert.match(chrome, /aria-expanded/);
    assert.match(chrome, /aria-controls="public-mobile-navigation"/);
    assert.match(chrome, /Mobile public navigation/);
    assert.match(chrome, /PublicThemeToggle/);
    assert.match(chrome, /cc-public-desktop-nav/);
    assert.match(chrome, /cc-public-mobile-actions/);
    assert.match(chrome, /to="\/login"/);
    assert.match(chrome, /to="\/register"/);
    assert.match(chrome, /event\.key !== 'Escape'/);
    assert.match(chrome, /menuButton\.current\?\.focus/);
    assert.match(chrome, /document\.body\.style\.overflow = 'hidden'/);
    assert.match(chrome, /href="#product"/);
    assert.match(chrome, /href="#trust"/);
    assert.match(chrome, /Open Explore menu/);
    assert.match(chrome, /name=\{open \? 'close' : 'dashboard'\}/);
    assert.match(themeToggle, /resolvedTheme === 'light' \? 'dark' : 'light'/);
    assert.match(themeToggle, /setMode\(next\)/);
    assert.match(themeToggle, /Switch to \$\{next\} mode/);
  });

  void it('keeps the five-module showcase interactive and privacy-safe', async () => {
    const showcase = await source('features/landing/PlatformShowcase.tsx');
    const content = await source('features/landing/landing-content.ts');
    const preview = await source('features/landing/ProductPreview.tsx');
    for (const module of ['Marketplace', 'Lost & Found', 'TeamUp', 'Services', 'Campus Assistant'])
      assert.match(content, new RegExp(module.replace('&', '\\&')));
    assert.match(showcase, /aria-pressed/);
    assert.match(showcase, /onClick=\{\(\) => setSelectedId/);
    assert.match(showcase, /aria-live="polite"/);
    for (const scene of [
      'MarketplaceScene',
      'LostScene',
      'TeamScene',
      'ServicesScene',
      'AssistantScene',
    ])
      assert.match(showcase, new RegExp(`function ${scene}`));
    assert.match(preview, /role="region"/);
    assert.match(preview, /aria-label="CampusConnect product workspace preview"/);
    assert.match(preview, /<Link to=\{primary\.route\}>/);
    assert.equal(preview.includes('email'), false);
    assert.equal(preview.includes('enrollment'), false);
    assert.equal(preview.includes('rating'), false);
    assert.match(preview, /cc-canvas-feature/);
    assert.match(preview, /cc-canvas-match/);
    assert.match(preview, /cc-canvas-team/);
    assert.equal(/[âÂÃ]/u.test(`${showcase}${preview}${content}`), false);
  });

  void it('retains signed-out landing and authenticated Home redirect behavior', async () => {
    const app = await source('app/App.tsx');
    assert.match(app, /isAuthenticated \? <Navigate replace to="\/home" \/> : <LandingPage \/>/);
    assert.match(app, /path="\/"/);
  });

  void it('defines landing motion with a reduced-motion fallback', async () => {
    const landing = await source('features/landing/LandingPage.tsx');
    const preview = await source('features/landing/ProductPreview.tsx');
    const css = await source('index.css');
    const refinement = await source('features/landing/landing-refinement.css');
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(refinement, /@keyframes cc-chapter-reveal/);
    assert.match(refinement, /@media \(min-width: 1100px\)/);
    assert.match(refinement, /@media \(min-width: 1200px\)/);
    assert.match(refinement, /\.cc-public-mobile-actions/);
    assert.match(refinement, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(landing, /IntersectionObserver/);
    assert.match(landing, /data-landing-reveal/);
    assert.match(preview, /window\.setTimeout/);
    assert.match(preview, /prefers-reduced-motion: reduce/);
    assert.match(preview, /onFocusCapture/);
    assert.match(preview, /onMouseEnter/);
    assert.equal(preview.includes('setInterval'), false);
  });

  void it('uses shared semantic surfaces instead of the legacy dark-only auth canvas', async () => {
    const auth = await source('features/auth/AuthPages.tsx');
    assert.match(auth, /cc-auth-premium-page/);
    assert.match(auth, /cc-alert cc-alert--danger/);
    assert.match(auth, /<PublicThemeToggle \/>/);
    assert.equal(auth.includes('bg-[#070b14]'), false);
  });
});
