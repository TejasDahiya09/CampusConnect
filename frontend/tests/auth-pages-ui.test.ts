import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = (path: string) => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8');

void describe('premium registration and recovery presentation', () => {
  void it('preserves registration fields and operations in the shared premium layout', async () => {
    const pages = await source('features/auth/AuthPages.tsx');
    assert.match(pages, /storyTitle="A good start leads somewhere great\."/);
    assert.match(pages, /title="Create your account\."/);
    assert.match(pages, /Full name/);
    assert.match(pages, /autoComplete="name"/);
    assert.match(pages, /autoComplete="email"/);
    assert.match(pages, /Confirm password/);
    assert.match(pages, /Continue with Google/);
    assert.match(pages, /await register\(\{ displayName, email, password \}\)/);
    assert.match(pages, /await signInWithGoogle\('\/home'\)/);
    assert.match(pages, /We sent a verification link/);
    assert.match(pages, /to="\/login"/);
  });

  void it('uses the existing recovery operation and privacy-safe confirmation', async () => {
    const [pages, service] = await Promise.all([
      source('features/auth/AuthPages.tsx'),
      source('features/auth/auth-service.ts'),
    ]);
    assert.match(pages, /title="Let's get you back in\."/);
    assert.match(pages, /await requestPasswordReset\(email\)/);
    assert.match(
      pages,
      /If an account is associated with that email, you'll receive password reset instructions\./,
    );
    assert.match(pages, /Send reset link/);
    assert.match(pages, /cc-auth-recovery-confirmation/);
    assert.match(pages, /<h2>Check your inbox<\/h2>/);
    assert.match(pages, /className="cc-button cc-button--secondary" to="\/login"/);
    assert.match(service, /resetPasswordForEmail/);
    assert.match(service, /\/auth\/reset-password/);
  });

  void it('keeps both reset aliases behind the existing recovery-session gate', async () => {
    const [app, pages, service] = await Promise.all([
      source('app/App.tsx'),
      source('features/auth/AuthPages.tsx'),
      source('features/auth/auth-service.ts'),
    ]);
    assert.match(pages, /title="Choose a new password\."/);
    assert.match(pages, /New password/);
    assert.match(pages, /Confirm password/);
    assert.match(app, /path="\/reset-password"/);
    assert.match(app, /path="\/auth\/reset-password"/);
    assert.match(pages, /hasRecoverySession\(\)/);
    assert.match(pages, /if \(!hasSession\)/);
    assert.match(pages, /await updatePassword\(password\)/);
    assert.match(service, /if \(data\.session === null\)/);
    assert.match(service, /supabase\.auth\.updateUser\(\{ password \}\)/);
  });

  void it('reuses the approved story and ribbon without changing Login or callback presentation', async () => {
    const [pages, story, app] = await Promise.all([
      source('features/auth/AuthPages.tsx'),
      source('features/auth/LoginStory.tsx'),
      source('app/App.tsx'),
    ]);
    assert.match(pages, /<LoginStory description=\{storyDescription\} title=\{storyTitle\} \/>/);
    assert.match(pages, /<PublicThemeToggle \/>/);
    assert.match(story, /title = 'Your next move starts here\.'/);
    assert.match(story, /<LoginKineticRibbon \/>/);
    assert.match(pages, /variant="callback"/);
    assert.match(app, /import\('\.\.\/features\/auth\/LoginPage'\)/);
    assert.doesNotMatch(pages, /pointermove|requestAnimationFrame/);
  });

  void it('defines responsive premium form hooks without changing auth infrastructure', async () => {
    const [pages, styles] = await Promise.all([
      source('features/auth/AuthPages.tsx'),
      source('features/auth/login.css'),
    ]);
    assert.match(pages, /cc-auth-premium-page--\$\{variant\}/);
    assert.match(pages, /cc-auth-premium-panel/);
    assert.match(pages, /cc-auth-premium-form/);
    assert.match(styles, /\.cc-auth-premium-panel/);
    assert.match(styles, /\.cc-auth-premium-page--register \.cc-auth-premium-form form/);
    assert.match(styles, /\.cc-auth-recovery-confirmation \{/);
    assert.match(styles, /\.cc-auth-recovery-confirmation[\s\S]*display: grid/);
    assert.match(styles, /\.cc-auth-recovery-confirmation \.cc-button[\s\S]*width: 100%/);
    assert.match(styles, /@media \(min-width: 1120px\) and \(max-height: 820px\)/);
    assert.doesNotMatch(styles, /\.cc-auth-premium-form[^}]*overflow(?:-y)?:\s*(?:auto|scroll)/);
    assert.match(styles, /@media \(max-width: 600px\)/);
    assert.doesNotMatch(pages, /getSupabaseClient|updateUser|resetPasswordForEmail/);
  });
});
