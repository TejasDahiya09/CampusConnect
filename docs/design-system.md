# CampusConnect Design System

This document is the visual source of truth for the Phase 8 redesign. New UI should use the existing `cc-*` primitives and semantic tokens before adding feature-specific styles.

## Product direction

CampusConnect should feel calm, capable, and student-centered: restrained color, strong reading hierarchy, compact actions, clear state feedback, and comfortable density. Decoration must never compete with content. Avoid neon color, heavy glass effects, broad gradients, oversized radii, and motion without functional value.

## Frontend inventory

### Public surfaces

- `/` landing page
- `/login`, `/register`
- `/forgot-password`, `/reset-password`, `/auth/reset-password`
- `/auth/callback`
- `/404` and unmatched-route state

### Authenticated student surfaces

- `/home`, `/dashboard`
- `/profile`, `/profile/:userId`
- Marketplace discovery, saved, create, detail, and edit routes
- Lost & Found discovery, saved, create, match center, detail, and edit routes
- TeamUp discovery, personal workspace, create, detail, and edit routes
- Services discovery, personal workspace, create, detail, and edit routes
- `/messages`, `/messages/:id`
- `/notifications`, `/assistant`, `/analytics`, `/settings`, `/search`

### Elevated surfaces

- `/moderation`: Moderator and Admin report review
- `/admin`: designated allowlisted Admin only

### Shared architecture

- `AppShell`: desktop sidebar, application header, mobile drawer, bottom navigation, route suspense
- `components/ui.tsx`: buttons, cards, badges, avatar, breadcrumbs, tabs, toast, alerts, empty states, page and section headers, statistics, skeletons, dialogs, progress
- `components/Icon.tsx`: the controlled icon vocabulary
- `features/theme`: Light, Dark, and System preference and persistence
- `index.css`: semantic tokens, shared primitives, compatibility layer, responsive and reduced-motion rules

Feature folders own their domain pages, typed view models, API adapters, and specialized components. Shared visual behavior belongs in the shared component layer, not duplicated feature CSS.

## Tokens

### Color roles

- `--cc-bg`: application canvas; warm off-white in Light and deep charcoal in Dark
- `--cc-panel`: primary elevated surface
- `--cc-panel-strong`: controls, table headers, and nested surfaces
- `--cc-panel-muted`: low-emphasis grouped content
- `--cc-border` / `--cc-border-strong`: separators and emphasized boundaries
- `--cc-text`, `--cc-text-soft`, `--cc-muted`, `--cc-subtle`: descending text emphasis
- `--cc-primary`, `--cc-primary-hover`, `--cc-primary-soft`: brand action and selection
- `--cc-success`, `--cc-warning`, `--cc-danger`, `--cc-info` and `*-soft`: state pairs
- `--cc-focus`: keyboard focus

Never encode meaning with color alone. Pair status color with text, an icon, or both.

### Typography

Use Inter when available, followed by the system sans-serif stack. Do not add a remote font dependency.

- Page title: fluid `1.85–2.55rem`, compact line height, tight tracking
- Section title: `1.15rem`, semibold/bold
- Card title: approximately `1.05rem`
- Body: `1rem`, line height `1.5`
- Supporting copy: `0.875rem`, line height `1.55–1.6`
- Metadata: `0.75–0.78rem`
- Eyebrow: `0.72rem`, restrained uppercase tracking

Keep long-form content within `--cc-reading-width` (46rem).

### Spacing, radius, and elevation

Use the 4px-derived `--cc-space-1/2/3/4/5/6/8/10` scale. Typical card padding is 16–24px; page sections usually separate by 24–32px.

- `--cc-radius-xs`: small indicators
- `--cc-radius-sm`: controls
- `--cc-radius-md`: alerts and grouped controls
- `--cc-radius-lg`: cards
- `--cc-radius-xl`: dialogs and intentional hero surfaces
- `--cc-shadow-sm`: ordinary cards
- `--cc-shadow-md`: interactive elevated cards
- `--cc-shadow-lg`: dialogs and toasts

Borders provide most surface definition; shadows remain subtle.

## Component rules

- **Buttons:** one primary action per local decision area. Secondary for alternatives, ghost for low-emphasis actions, danger only for consequential mutations. Preserve a minimum 42px target.
- **Fields:** use `cc-label` and `cc-field`; supporting copy uses `FieldMessage`. Set `aria-invalid` for invalid controls. Errors must be announced.
- **Choices:** checkbox/radio labels use `cc-choice`; never rely on the input alone as the target.
- **Cards:** use `Card` for grouped content and `cc-feature-card` for navigable discovery items. Avoid nesting multiple shadowed cards.
- **Badges:** short state/category labels only. Do not use badges for paragraphs or primary actions.
- **Tabs:** use `Tabs`; preserve selected state, horizontal scrolling, and keyboard-visible focus.
- **Dialogs:** use `Modal`; it owns labelling, focus trap, Escape, focus restoration, scroll lock, and mobile containment.
- **Tables:** wrap wide tables in a labelled, focusable `cc-table-scroll` region. Keep mutation actions visible and server-confirmed.
- **Feedback:** `InlineAlert` for persistent contextual feedback, `Toast` for transient mutation confirmation, `EmptyState` for recoverable absence, and `Skeleton` only while shape-compatible content loads.
- **Progress:** use `ProgressBar`; percentages must represent a real documented calculation.

## Page patterns

- **Public marketing:** independent public header, focused value proposition, one dominant next action.
- **Authentication:** narrow reading column, explicit form labels, provider and password flows visually separated.
- **Dashboard:** `cc-page`, `PageHeader`, bounded metric grid, prioritized activity and quick actions.
- **Discovery:** page header, `cc-filter-panel`, result summary, responsive feature-card grid, `cc-pagination`.
- **Detail:** breadcrumb, two-column content/sidebar above desktop breakpoint, single-column mobile flow, grouped owner actions.
- **Create/edit:** reading-width container, logical form sections, persistent validation proximity, Cancel then primary Submit.
- **Workspace:** responsive split view; selected content must remain usable on mobile without horizontal page overflow.
- **Messaging/assistant:** bounded `cc-chat-workspace`, contained scrolling, wrapping message bubbles, composer anchored after history.
- **Data management:** section navigation, bounded filters, labelled keyboard-scrollable tables, server-confirmed dialogs.

## Interaction and motion

Transitions are normally 150–200ms and limited to color, border, opacity, small elevation, or a maximum 2px translation. Never delay essential feedback. Loading controls set `aria-busy` and become disabled. Destructive actions require confirmation. `prefers-reduced-motion` removes nonessential motion globally.

## Responsive principles

Design mobile-first at 320px. The existing Tailwind breakpoints are the implementation breakpoints: 640px, 768px, 1024px, and 1280px. Validate representative widths 320, 375, 430, 768, 1024, and 1440px plus 200% zoom.

- Never require page-level horizontal scrolling.
- Tables may scroll only inside their labelled region.
- Action groups stack on small screens.
- Text and controls must wrap without clipping.
- Images retain a stable aspect ratio and `object-fit` behavior.
- Do not hide essential actions on mobile.

## Accessibility

Meet WCAG AA contrast where feasible. All interactive elements require accessible names and visible focus. Use semantic headings in document order. Associate errors and help with their controls. Do not place private content in ARIA labels, analytics, logs, or notification previews. Dialogs must retain the shared focus-management behavior.

## Migration guidance

Stages 2–6 should migrate by pattern, not page-by-page improvisation:

1. Reuse or extend a semantic token.
2. Prefer an existing shared component contract.
3. Add a shared primitive only when two or more routes need it.
4. Replace dark-only utility colors with semantic shared classes as each surface is migrated.
5. Preserve feature logic and tests; visual work must not alter authorization, requests, or data shaping.
6. Validate both themes, mobile width, keyboard flow, loading/error/empty states, and production bundle output for each migrated group.

The compatibility layer in `index.css` exists only for controlled migration of older dark-first feature markup. New code must not expand that layer.
