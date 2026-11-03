import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { authErrorMessage } from '../src/features/auth/auth-errors.js';
import { normalizeValidEmail } from '../src/features/auth/auth-service.js';
import {
  passwordConfirmationError,
  oauthCallbackError,
  readSafeRedirect,
  redirectFromSearch,
  toLoginRedirect,
} from '../src/features/auth/auth-routing.js';

void describe('authentication routing and form guards', () => {
  void it('preserves an internal protected destination for sign-in', () => {
    assert.equal(
      toLoginRedirect('/marketplace', '?page=2', '#saved'),
      '/login?redirect=%2Fmarketplace%3Fpage%3D2%23saved',
    );
    assert.equal(
      redirectFromSearch('?redirect=%2Fmarketplace%3Fpage%3D2%23saved'),
      '/marketplace?page=2#saved',
    );
  });

  void it('rejects unsafe redirects and falls back to Home', () => {
    assert.equal(readSafeRedirect(null), '/home');
    assert.equal(readSafeRedirect('https://untrusted.example'), '/home');
    assert.equal(readSafeRedirect('//untrusted.example'), '/home');
    assert.equal(readSafeRedirect('/profile'), '/profile');
  });

  void it('uses a safe callback error instead of provider diagnostics', () => {
    assert.equal(oauthCallbackError('?redirect=%2Fhome'), null);
    assert.equal(
      oauthCallbackError('?error=server_error&error_description=provider+diagnostic'),
      'Google sign-in could not be completed. Please try again.',
    );
  });

  void it('validates confirmation before registration or reset submission', () => {
    assert.equal(passwordConfirmationError('campus-pass', 'campus-pass'), null);
    assert.equal(passwordConfirmationError('campus-pass', 'other-pass'), 'Passwords do not match.');
  });

  void it('accepts arbitrary valid email domains and rejects malformed addresses', () => {
    assert.equal(normalizeValidEmail(' Student@Gmail.com '), 'student@gmail.com');
    assert.equal(normalizeValidEmail('student@company.example'), 'student@company.example');
    assert.throws(() => normalizeValidEmail('student-at-example.com'), /valid email address/);
    assert.throws(() => normalizeValidEmail('student@example'), /valid email address/);
  });
});

void describe('authentication error messages', () => {
  void it('converts expected provider failures to safe user messages', () => {
    assert.equal(
      authErrorMessage(new Error('Invalid login credentials'), 'Sign in failed.'),
      'The email or password is incorrect.',
    );
    assert.equal(
      authErrorMessage(new Error('Email not confirmed'), 'Sign in failed.'),
      'Confirm your email address before signing in.',
    );
    assert.equal(
      authErrorMessage(new Error('unexpected upstream diagnostic'), 'Sign in failed.'),
      'Sign in failed.',
    );
  });
});
