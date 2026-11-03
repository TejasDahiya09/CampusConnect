import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createSupabaseAccessTokenVerifier } from '../src/modules/auth/supabase-jwt.js';

void describe('Supabase JWT verification', () => {
  void it('rejects expired, wrong-issuer, wrong-audience, wrong-signature and anonymous local JWTs', async () => {
    const issuer = 'https://synthetic.example.test/auth/v1',
      audience = 'authenticated';
    const keys = await generateKeyPair('ES256'),
      other = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(keys.publicKey);
    const verify = createSupabaseAccessTokenVerifier({
      issuer,
      audience,
      keyResolver: createLocalJWKSet({
        keys: [{ ...publicJwk, alg: 'ES256', kid: 'isolated-key', use: 'sig' }],
      }),
    });
    for (const scenario of [
      'expired',
      'issuer',
      'audience',
      'signature',
      'anonymous',
      'missing-email',
    ]) {
      const token = await new SignJWT({
        ...(scenario === 'missing-email' ? {} : { email: 'synthetic@example.test' }),
        is_anonymous: scenario === 'anonymous',
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'isolated-key' })
        .setIssuer(scenario === 'issuer' ? 'https://wrong.example.test/auth/v1' : issuer)
        .setAudience(scenario === 'audience' ? 'wrong' : audience)
        .setSubject('11111111-1111-4111-8111-111111111111')
        .setIssuedAt()
        .setExpirationTime(scenario === 'expired' ? Math.floor(Date.now() / 1000) - 60 : '5m')
        .sign(scenario === 'signature' ? other.privateKey : keys.privateKey);
      await assert.rejects(
        verify(token),
        (error: unknown) =>
          error instanceof Error && 'code' in error && error.code === 'INVALID_ACCESS_TOKEN',
      );
    }
  });
  void it('accepts a correctly signed and scoped verified-email token', async () => {
    const issuer = 'https://project.supabase.co/auth/v1';
    const audience = 'authenticated';
    const subject = '11111111-1111-4111-8111-111111111111';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const keyId = 'test-signing-key';
    const keyResolver = createLocalJWKSet({
      keys: [{ ...publicJwk, alg: 'ES256', kid: keyId, use: 'sig' }],
    });
    const token = await new SignJWT({
      email: 'student@university.edu',
      email_verified: true,
      user_metadata: { display_name: 'Student User' },
    })
      .setProtectedHeader({ alg: 'ES256', kid: keyId })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    const verify = createSupabaseAccessTokenVerifier({ audience, issuer, keyResolver });

    const identity = await verify(token);

    assert.equal(identity.id, subject);
    assert.equal(identity.email, 'student@university.edu');
    assert.equal(identity.emailVerified, true);
  });

  void it('does not trust email verification stored only in user metadata', async () => {
    const issuer = 'https://project.supabase.co/auth/v1';
    const audience = 'authenticated';
    const { privateKey, publicKey } = await generateKeyPair('ES256');
    const publicJwk = await exportJWK(publicKey);
    const keyResolver = createLocalJWKSet({
      keys: [{ ...publicJwk, alg: 'ES256', kid: 'metadata-test-key', use: 'sig' }],
    });
    const token = await new SignJWT({
      email: 'student@university.edu',
      user_metadata: { email_verified: true },
    })
      .setProtectedHeader({ alg: 'ES256', kid: 'metadata-test-key' })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject('11111111-1111-4111-8111-111111111111')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

    const identity = await createSupabaseAccessTokenVerifier({ audience, issuer, keyResolver })(
      token,
    );

    assert.equal(identity.emailVerified, false);
  });
});
