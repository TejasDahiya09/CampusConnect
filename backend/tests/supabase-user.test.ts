import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import { createSupabaseEmailConfirmer } from '../src/modules/auth/supabase-user.js';
import type { SupabaseIdentity } from '../src/modules/auth/auth.types.js';

const identity: SupabaseIdentity = {
  email: 'student@university.edu',
  emailVerified: false,
  id: '11111111-1111-4111-8111-111111111111',
  metadata: {},
};

void describe('Supabase email confirmation', () => {
  void it('accepts the matching confirmed Supabase user', async () => {
    const confirmEmail = createSupabaseEmailConfirmer({
      fetcher: () =>
        Promise.resolve(
          Response.json({
            email: identity.email,
            email_confirmed_at: '2026-09-01T00:00:00.000Z',
            id: identity.id,
          }),
        ),
      publishableKey: 'public-test-key',
      supabaseUrl: 'https://project.supabase.co',
    });

    const confirmedIdentity = await confirmEmail('test-access-token', identity);

    assert.equal(confirmedIdentity.emailVerified, true);
  });

  void it('rejects an unconfirmed Supabase user', async () => {
    const confirmEmail = createSupabaseEmailConfirmer({
      fetcher: () =>
        Promise.resolve(
          Response.json({
            email: identity.email,
            email_confirmed_at: null,
            id: identity.id,
          }),
        ),
      publishableKey: 'public-test-key',
      supabaseUrl: 'https://project.supabase.co',
    });

    await assert.rejects(
      confirmEmail('test-access-token', identity),
      (error: unknown) => error instanceof AppError && error.code === 'EMAIL_NOT_VERIFIED',
    );
  });
});
