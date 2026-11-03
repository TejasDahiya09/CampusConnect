# Step 11C — Messaging UI and state verification

Date: 2026-10-31. Scope: `/messages` and `/messages/:id`, frontend only.

## Verdict

Messaging frontend modernization is implemented. Local automated and isolated Chrome checks pass as recorded below. Visual acceptance remains with the user. These fixtures are not real Supabase-authenticated end-to-end evidence. Step 11D has not started.

## Source audit and preserved contracts

| Area                   | Verified source and contract                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Routing                | `frontend/src/app/App.tsx` lazily loads `MessagesPage` at both existing protected routes. AppShell, guards and deep links remain unchanged.                                                                                                                                        |
| Inbox                  | `messaging-service.ts` calls `GET /api/messages?contextType=…&search=…`. Backend `messagingService.list` filters participant display name/context label, not message text. UI supports All, DIRECT, MARKETPLACE, TEAMUP and SERVICE. No Lost & Found filter.                       |
| Conversation DTO       | `ConversationView`: id, contextId/type/label/path, createdAt/updatedAt, authorized otherParticipant, lastMessage and unreadCount. Inbox includes authoritative global and per-context unread totals.                                                                               |
| Participant projection | Backend repository uses `servicePerson` redaction. Frontend renders only projected displayName/initials and returned context label/path. Avatar is typed `unknown`; this pass uses initials rather than guessing an image URL schema. No new profile lookup or inferred identity.  |
| History                | `GET /api/messages/:id?page=N&limit=50`. Backend sorts newest first with stable ID ordering, slices an offset page, then reverses it into chronological order. Response is `{messages, readReceipt}` with no total or hasMore metadata.                                            |
| Sending                | `POST /api/messages/:id` with trimmed text, maximum 4,000 characters, and optional UUID clientMessageId. Existing service-to-server validation, permissions and encryption remain authoritative.                                                                                   |
| Reading                | `PATCH /api/messages/:id/read` accepts the signed fetched-message receipt. Receipt scope, expiry and actual recipient filtering remain server-controlled.                                                                                                                          |
| Realtime               | Existing `message:new` socket event. No new transport or socket-server modifications.                                                                                                                                                                                              |
| Previous defects       | One shared draft; only first history page accessible; loading could appear as an empty thread; selection-dependent socket recreation; latest-page refresh could replace older messages; no deliberate scroll following; hard-coded presentation and corrupted visible punctuation. |

## Final component architecture and design

- `MessagesPage` keys its workspace by authenticated application-user ID. Switching accounts remounts all private UI state.
- `MessagingWorkspace` owns inbox requests, active history, pagination, conversation drafts, pending attempts, read errors and realtime reconciliation.
- Small local Avatar and Notice components provide consistent identity fallback and recoverable feedback.
- `messaging-state.ts` contains deterministic merge, draft-completion and scroll-threshold helpers.
- `messaging.css` is route-loaded, feature-scoped styling. Existing shared chat CSS remains because Campus Assistant still consumes it; no global CSS or shell styles were changed.
- Desktop uses roughly 32% inbox / 68% conversation, constrained to 92rem. Tablet adjusts proportions. Inbox and thread have independent scroll regions inside a shared boundary.
- Below 768px the route selects either inbox or conversation. Real AppShell header and six-destination bottom navigation remain intact. No duplicate header, sticky contact bar or second bottom navigation.
- Light/Dark reuse existing canvas, panel, field, primary, border, focus and error tokens. Manrope headings and Inter body text remain consistent with the approved modules.

## State and interaction behavior

### Inbox

Search is bounded to the existing 100-character API limit and debounced 200ms. Request generations invalidate stale responses immediately when filters change. Clear search, selected filter semantics, selected conversation styling, context labels, activity dates and authoritative unread values are included. Filters do not discard the selected thread or draft; already returned conversation metadata remains available for its header. There is no polling.

Initial loading, empty inbox, no search matches and inbox errors are distinct. Retry preserves existing state. Context links use server-provided destinations. No people suggestions, arbitrary new-chat action, unsupported filters or invented badges were introduced.

### History and scrolling

Latest page loads on selection. Earlier pages are requested individually, merged by persistent message ID, sorted chronologically and prepended without replacing socket arrivals. A height/top anchor preserves the visible message while older rows are added. A page with fewer than 50 records ends pagination; an exact final page of 50 needs one additional empty request because the API supplies no total.

Initial history follows the latest messages. Screenshot review revealed that font loading could change mobile bubble heights after this initial scroll; the final implementation corrects the position when fonts settle unless the reader has interacted with scrolling. A ResizeObserver preserves bottom-following when the viewport changes. Readers scrolled upward are not forced down by incoming messages; Jump to latest restores following. Successful outgoing persistence follows the sent message.

Original message line breaks and long unbroken text are rendered safely as React text. Timestamps use native time elements with date/time details. No read ticks, delivery claims or typing states are fabricated.

### Composer, drafts and durable sends

The composer is multiline with a 4,000-character limit and count. Enter sends, Shift+Enter remains native newline behavior; IME composition, keycode 229 and modifier combinations are not submitted accidentally. Empty text and unavailable/loading threads cannot send. Send pending is guarded by a synchronous lock as well as disabled controls.

Drafts exist only in per-conversation in-memory state. Successful delayed sends clear only the originating draft if its text still matches; another conversation's draft and edited text survive. No message/draft content is added to URLs, storage, analytics or logs.

An attempted conversation/text pair retains its UUID after an ambiguous failure. Returning to that unchanged failed text reuses the ID even after editing another attempted message. Edited content gets a different attempt. HTTP and socket success use the persisted message ID; no optimistic success bubble is invented. Retry state is session-only, not a persistent outbox.

### Signed reads and sockets

Only actual fetched receipts are submitted, while the document is visible. Returning to a visible selected conversation fetches a new signed page. This is fetched/view-lifecycle acknowledgment, not verified on-screen reading. Read failures are caught and offer recovery; unread totals are refreshed from the server.

One messaging socket is retained across conversation changes within the workspace. Current conversation refs prevent stale event routing. Event IDs are deduplicated in a bounded recent-ID set; message merging also prevents HTTP/socket duplicate bubbles. Incoming active-thread events fetch a page to obtain an authentic receipt before marking anything read. Listener cleanup and disconnect run on unmount. A disconnected banner offers manual refresh while HTTP messaging remains usable.

Full token renewal, reconnect catch-up, durable outbox and delivery lifecycle remain Step 11D work.

## Accessibility

Labeled search, pressed filter buttons, real route links with current-page semantics, keyboard-scrollable history, heading focus on mobile route transitions, visible semantic focus outlines, labeled composer/send button and alert/status regions are provided. History is not a live region, avoiding repeated announcements of the entire paginated history; incoming-message status is separate. Controls use approximately 44px targets. Reduced motion disables feature transitions. No unsupported attachments, calls, group chats or emoji-picker controls were added.

## Files

Created:

- `frontend/src/features/messaging/messaging.css`
- `frontend/src/features/messaging/messaging-state.ts`
- `frontend/tests/messaging-visual-fixture.ts`
- `frontend/tests/messaging-browser-qa.mjs`
- `docs/messaging-ui-readiness.md`

Modified:

- `frontend/src/features/messaging/MessagesPage.tsx`
- `frontend/src/features/messaging/messaging-service.ts` — optional page/limit arguments for the existing history API only.
- `frontend/tests/messaging.test.ts` — merge, draft completion and scroll-threshold behavior; obsolete source-shape assertion replaced.
- `frontend/tests/global-ui.test.ts` — two Messaging class-name expectations updated; other modules' assertions retained.

## Automated results

| Validation                            | Result                                                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Full frontend tests                   | 255 passed, 0 failed, 0 skipped                                                                  |
| Focused Messaging unit tests          | 9 passed, 0 failed, 0 skipped                                                                    |
| Frontend ESLint                       | Passed, zero warnings                                                                            |
| Frontend TypeScript                   | Passed                                                                                           |
| Repository formatting check           | Passed                                                                                           |
| Frontend production build             | Passed, no Vite warnings                                                                         |
| Messaging Chrome/AppShell fixture     | 20 viewport/theme combinations plus state and interaction checks passed                          |
| Marketplace Detail Chrome regression  | 17 viewport/theme cases, 13 lifecycle/error scenarios plus geometry/gallery/action checks passed |
| TeamUp Browse Chrome regression       | 20 viewport/theme combinations plus discovery/navigation/state checks passed                     |
| TeamUp Details Chrome regression      | 20 viewport/theme combinations, 15 state scenarios plus workflow checks passed                   |
| Services Browse Chrome regression     | 20 viewport/theme combinations plus interaction/state coverage passed                            |
| Services Details Chrome regression    | Responsive geometry, states and workflow checks passed                                           |
| Services management Chrome regression | 60 viewport/screen/theme combinations plus workflow/recovery checks passed                       |

All browser fixtures use actual components and synthetic adapters. No live auth, production records or backend writes were used. Backend tests were not rerun in this frontend-only phase; backend source was unchanged.

Final build: MessagesPage JS 12.48kB / 4.41kB gzip; Messaging CSS 7.75kB / 2.01kB gzip; messaging-service JS 1.39kB / 0.78kB gzip. Main entry JS 128.65kB / 39.37kB gzip; main CSS 142.95kB / 25.38kB gzip. Largest JS chunk is React vendor at 231.97kB / 74.41kB gzip. No dependency added; route-level splitting retained. These are final measurements, not an independently measured before/after delta.

## Browser evidence and reproduction

Screenshots and JSON results: `C:\Users\dahiy\AppData\Local\Temp\campusconnect-messaging-11c-qa`.

Run from repository root after the frontend build:

```powershell
npx tsx frontend/tests/messaging-visual-fixture.ts "$env:TEMP\campusconnect-messaging-11c-qa"
node frontend/tests/messaging-browser-qa.mjs "$env:TEMP\campusconnect-messaging-11c-qa"
```

The fixture renders real AppShell and MessagesPage components, synthetic identity/API/socket boundaries, and blocks external fetches. It covers 1920, 1440, 1366, 1280, 1024, 768, 430, 390, 360 and 320px in both themes. Screenshots include desktop selected/unselected conversation, desktop empty inbox, mobile inbox/thread, earlier history, new-message affordances, focused composer, send failure, disconnected socket, redacted identity, loading and error states.

Interaction assertions cover 50→100→120 history pagination, visible anchoring, chronological deduplication, receipt payloads, filters/search, account-isolated drafts, delayed sends, retry UUIDs including edited/reverted text, duplicate events, IME/Shift+Enter guards and mobile focus transitions. Rendered geometry checks include overflow and composer clearance above the real bottom navigation. Runtime exception collection is empty.

Screenshots reviewed directly include Desktop Light/Dark, Mobile Light/Dark and 320px Dark. They show coordinated surfaces, readable text wrapping and final-message visibility after the font-loading correction. User visual approval remains pending.

## Remaining limitations and acceptance checklist

- Real Supabase-authenticated cross-user end-to-end messaging is unverified by this fixture. Verify the real listing/project/service entry points, actual projected identities, sends, notification deep links and unread updates in a controlled non-production environment.
- Test native Android/iOS keyboard opening, dismissal, rotation and textarea resize; desktop emulation and static screenshots cannot establish native keyboard behavior.
- 720 CSS-pixel reflow was checked as a 1440px/200%-style proxy. Native 200% Chrome zoom was not verified.
- Offset history can shift during concurrent writes. ID reconciliation prevents duplicates but cannot guarantee cursor-like gap-free traversal under sustained arrivals without backend support.
- Inbox remains unpaginated server-side; UI modernization does not resolve backend N+1/global-list scalability.
- Message attempts and drafts do not survive reload, logout or account change. There is no persistent outbox or guaranteed reconnect replay.
- Avatar media schema remains `unknown`; initials are intentional until a supported safe image contract is established.
- No screen-reader/assistive-technology or native mobile-device certification is claimed.

Approved Marketplace, TeamUp, Services, Lost & Found, authentication and global shell source were not modified. No Git operations, migrations, production-data access, deployment, infrastructure changes or paid AI calls were performed. Stop at Step 11C and await screenshot approval.
