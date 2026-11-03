# Google authentication

CampusConnect uses Supabase Auth as its only authentication system. Google sign-in redirects through Supabase, returns to `/auth/callback`, restores the browser session, and then uses the existing authenticated `POST /api/auth/sync` flow. No Google client secret belongs in the frontend or this repository.

## Application behavior

The Login and Register pages call `supabase.auth.signInWithOAuth` with provider `google`. The local callback is:

```text
http://localhost:5173/auth/callback
```

An optional safe internal `redirect` query parameter preserves the original protected destination. External and protocol-relative redirects fall back to `/home`.

The Supabase browser client uses persisted sessions, automatic token refresh, and URL session detection. After OAuth completes, `AuthProvider` restores the session and calls `/api/auth/sync`. First-time identities create a `STUDENT` application user and profile. Returning identities are resolved by the stable Supabase user ID, so synchronization is idempotent and does not overwrite existing profile data. Suspended and deactivated application users remain blocked.

Google email confirmation proves control of an email address only. It does not populate or verify CampusConnect university-enrollment fields, grant moderator/admin roles, or establish an official university relationship. Identity linking and provider/email collision behavior must remain managed by Supabase; application code must not manually link accounts by email. Supabase currently documents automatic linking of verified identities that share the same email address. Review the [Supabase identity-linking documentation](https://supabase.com/docs/guides/auth/auth-identity-linking) before changing provider or linking settings.

## Google Auth Platform configuration

1. Open Google Cloud Console for the intended project.
2. Configure Google Auth Platform branding/consent information using the real application name, support email, and authorized domains.
3. Choose the appropriate audience. If the application remains in testing, add the exact Google accounts used for browser testing as OAuth test users.
4. Create an OAuth client with application type **Web application**.
5. Add these local authorized JavaScript origins:

   ```text
   http://localhost:5173
   ```

6. In Supabase Dashboard, open Authentication → Providers → Google. Copy the Supabase callback URI shown there. It normally has this form:

   ```text
   https://<project-ref>.supabase.co/auth/v1/callback
   ```

7. Add that exact Supabase callback URI as an authorized redirect URI on the Google Web OAuth client. Do not substitute the CampusConnect frontend callback here: Google returns to Supabase first.
8. Copy the Google OAuth client ID and client secret into the Supabase Google provider configuration only. Never put the secret in `frontend/.env`, source code, screenshots, logs, or commits.

The current provider setup is documented by [Supabase Sign in with Google](https://supabase.com/docs/guides/auth/social-login/auth-google). Google requires an exact authorized redirect URI match, including scheme and trailing-slash differences.

## Supabase configuration

1. Open Authentication → Providers → Google.
2. Enable Google and enter the Web OAuth client ID and client secret from Google Cloud.
3. Open Authentication → URL Configuration.
4. Configure the local Site URL:

   ```text
   http://localhost:5173
   ```

5. Add the application callback to the redirect allowlist:

   ```text
   http://localhost:5173/auth/callback
   ```

   Supabase may require an allowed wildcard form for callback query parameters. Prefer the narrowest rule supported by the dashboard, such as `http://localhost:5173/auth/callback**`, and do not allow arbitrary external origins.

6. Keep existing email/password and email-confirmation configuration unchanged.

## Local browser verification

1. Start the frontend and backend using the documented development commands.
2. Open `http://localhost:5173/login` in a private test browser profile.
3. Select **Continue with Google** and authenticate with an allowed test user.
4. Confirm the browser returns to `/auth/callback` and then `/home` or the original safe protected destination.
5. Confirm a first-time user has a `STUDENT` account and initialized profile.
6. Sign out, use Google again, and confirm the same application profile is reused without duplication or profile-name replacement.
7. Confirm suspended/deactivated accounts are denied by the existing application-status enforcement.
8. Confirm email/password login, password recovery, session restoration after refresh, protected redirects, and logout still work.
9. Test declining Google consent and confirm the callback displays a safe error without raw provider diagnostics.

Do not manually merge identities or change database rows during this verification. Supabase provider behavior for an existing email/password identity should be tested using Supabase-supported identity handling and the project's actual provider settings.

See [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls) for current allowlist syntax and production/preview URL guidance.
