import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { googleOAuthCallbackUrl, signInWithGoogle } from '../src/features/auth/auth-service.js';
import { oauthCallbackError } from '../src/features/auth/auth-routing.js';

void test('Google OAuth uses the provider and a safe application callback', async () => {
  let received: unknown;
  await signInWithGoogle(
    '/marketplace?category=books',
    (input) => {
      received = input;
      return Promise.resolve({ error: null });
    },
    'http://localhost:5173',
  );
  assert.deepEqual(received, {
    options: {
      redirectTo: 'http://localhost:5173/auth/callback?redirect=%2Fmarketplace%3Fcategory%3Dbooks',
    },
    provider: 'google',
  });
});

void test('OAuth callback construction rejects external redirect destinations', () => {
  assert.equal(
    googleOAuthCallbackUrl('http://localhost:5173', 'https://untrusted.example'),
    'http://localhost:5173/auth/callback?redirect=%2Fhome',
  );
  assert.equal(
    googleOAuthCallbackUrl('http://localhost:5173/path', '//untrusted.example'),
    'http://localhost:5173/auth/callback?redirect=%2Fhome',
  );
});

void test('OAuth initiation errors propagate for safe UI handling', async () => {
  const providerError = new Error('provider unavailable');
  await assert.rejects(
    signInWithGoogle(
      '/home',
      () => Promise.resolve({ error: providerError }),
      'http://localhost:5173',
    ),
    providerError,
  );
});

void test('callback provider errors are normalized without exposing provider details', () => {
  assert.equal(oauthCallbackError('?redirect=%2Fhome'), null);
  assert.equal(
    oauthCallbackError('?error=access_denied&error_description=sensitive+provider+diagnostic'),
    'Google sign-in could not be completed. Please try again.',
  );
  assert.equal(
    oauthCallbackError('', '#error=access_denied&error_description=sensitive+provider+diagnostic'),
    'Google sign-in could not be completed. Please try again.',
  );
});

void test('login and registration expose Google controls while preserving email forms', async () => {
  const [loginSource, loginFormSource, sharedSource] = await Promise.all([
    readFile(new URL('../src/features/auth/LoginPage.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/auth/LoginForm.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/auth/AuthPages.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal(loginFormSource.includes('Continue with Google'), true);
  assert.equal(sharedSource.includes('Continue with Google'), true);
  assert.equal(loginSource.includes('await login({ email, password })'), true);
  assert.equal(sharedSource.includes('register({ displayName, email, password })'), true);
  assert.equal(loginFormSource.includes('<GoogleMark />'), true);
  assert.equal(sharedSource.includes('<GoogleMark />'), true);
});

void test('Supabase restores callback sessions and synchronizes through the existing API', async () => {
  const [clientSource, providerSource] = await Promise.all([
    readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/features/auth/AuthProvider.tsx', import.meta.url), 'utf8'),
  ]);
  assert.equal(clientSource.includes('detectSessionInUrl: true'), true);
  assert.equal(clientSource.includes('persistSession: true'), true);
  assert.equal(clientSource.includes('autoRefreshToken: true'), true);
  assert.equal(providerSource.includes('getSession()'), true);
  assert.equal(providerSource.includes('onAuthStateChange'), true);
  assert.equal(providerSource.includes('synchronizeApplicationUser()'), true);
  assert.equal(providerSource.includes('signInWithGoogle'), true);
  assert.equal(providerSource.includes('logout'), true);
});
