# SankatAI web — design audit (Phase 0)

Scope: `apps/web/src` excluding `features/admin/**`. Audited 2026-09-24 against commit `798de56`.
Method: read every in-scope component; a script extracted every literal from all 9 style
sources plus inline `style={{}}`; contrast computed with the WCAG 2.x formula on the real
token values; the public pages were checked in a browser at 360px, light and dark.

---

## Redesign plan (for approval — nothing has been implemented)

### 1. Token system (Phase 1)

**One source.** Extend `packages/shared/theme.js` additively (existing exports unchanged, so
mobile keeps working). The web builds its CSS custom properties from those values in one file,
`src/styles/tokens.js`, injected once in `main.jsx` before first paint. Today the web and shared
dark palettes have drifted apart (web dark surface is `#141D2E`, shared is `#111827`), and the web
never imports `theme.js` at all. After this change they can't drift.

| Group | Tokens |
| --- | --- |
| Neutrals | slate scale `--n-0 … --n-950` (the slate values already in use) |
| Semantic | `--bg`, `--surface`, `--surface-raised`, `--surface-sunken`, `--text-primary`, `--text-secondary`, `--text-muted`, `--border-subtle` (decorative), `--border-strong` (inputs and controls, ≥3:1), `--focus-ring` |
| Brand | `--primary` `#C4504B` / `#D9635E`, `--primary-hover`, `--on-primary`, `--primary-soft`. Used only for primary actions and brand marks. |
| Status | `--success`, `--warning`, `--danger` (destructive actions: `#B91C1C` / `#F87171`, both already in the codebase), `--info` |
| Severity | fixed fills `--sev-low #059669`, `--sev-moderate #CA8A04`, `--sev-high #EA580C`, `--sev-emergency #DC2626` (the same in both themes). They get `-soft` backgrounds and text-safe `-ink` companions. See decision D1. |
| Type | `--font-sans` (system stack), sizes `12/14/16/18/20/24/30/36`, line-heights `16/20/24/26/28/32/38/44`, weights `400/500/600/700` |
| Space | `4 8 12 16 20 24 32 40 48 64` → `--space-1 … --space-16` |
| Radius | controls (input, button) `8`, cards `12`, modals and sheets `16`, pills `999` (chips and badges only). `20` is kept in shared for mobile and not used on web. |
| Elevation | `flat` (border only), `--shadow-1` popover/dropdown, `--shadow-2` drawer/toast, `--shadow-3` modal |
| Motion | `--dur-1 120ms`, `--dur-2 180ms`, `--dur-3 240ms`, `--dur-4 320ms`; `--ease-standard cubic-bezier(.2,0,0,1)`, `--ease-enter cubic-bezier(0,0,.2,1)`, `--ease-exit cubic-bezier(.4,0,1,1)` |
| Z-index | `--z-sticky 100`, `--z-dropdown 200`, `--z-overlay 300`, `--z-modal 400`, `--z-toast 500`, `--z-skip 600` |
| Breakpoints | `480 / 768 / 1024 / 1440` (JS constants plus media queries) |

Rules go in `DESIGN_SYSTEM.md`. The main ones:
- Colour carries meaning. Red means a primary action, an emergency, or a destructive action, and nothing else.
- Movement uses only `transform` and `opacity`.
- Hover colour changes may transition over 120ms. They don't trigger layout, and that is my reading of "animate only transform/opacity" (see D6).

### 2. Primitives (Phase 2), in `components/ui/`

`Button` (primary · secondary · ghost · destructive; `loading` keeps width and sets `aria-busy`) ·
`IconButton` (≥40px hit area, `aria-label` required, built-in `Tooltip`) · `Field` wrapping
`Input` / `Select` / `Textarea` (label, hint, error, required, `aria-invalid` and `aria-describedby`) ·
`Card` · `Modal` (focus trap, Escape, focus restore, primary action bottom-right) with
`ConfirmDialog` on top · `Menu` (dropdown) · `Toast` and `ToastProvider` (`aria-live`, pauses on hover) ·
`Skeleton` · `EmptyState` · `ErrorState` (with retry) · `Badge` / `Chip` / `SeverityBadge` (icon and word,
never colour alone) · `Tabs` / `SegmentedControl` · `Switch` · `Tooltip` · `Spinner` (inline only) ·
`SkipLink`.
Hooks: `useReducedMotion` (one place, wraps framer's hook and `MotionConfig reducedMotion="user"`),
`useDelayedFlag` (300ms loader delay), `useFocusTrap`.
Styles stay in the repo's convention: CSS template strings in `ui.styles.js`, reading only tokens.
`InfoRow` is kept and restyled. `DashboardSkeleton` becomes a skeleton shaped like the shell.

### 3. Page order (Phases 3–6)

Emergency surfaces go first because they carry the most risk:
1. **App shell.** On mobile the rail becomes a bottom tab bar (D4). The skeleton renders *inside* the shell so SOS is never covered.
2. **Chat.** AI card, offline and error states, "Analysing your symptoms…".
3. **Emergency tab.**
4. **History.**
5. **Files and Upload.**
6. **Profile and ProfileSetup.**
7. **Settings, Auth and Offline.**
8. **Login.**
9. **Landing.**

Every page moves onto the primitives. Dead CSS is deleted as each page is migrated, and `App.css` goes away entirely.

### 4. Deliberately NOT changing
`features/admin/**` · routes and route structure (the upload page and profile setup stay full-page
routes) · API calls, auth flow, business rules (typed-"confirm" delete, PIN gating, profile
merge-before-PUT, required fields) · shared copy constants (`AI_DISCLAIMER`, `EMERGENCY_CALLOUT`,
`SEV_META`) · severity values · brand colours · the mobile app (theme.js changes are additive
only) · CI/CD, Terraform, SonarQube, Trivy.

### 5. Decisions I need from you before Phase 1

- **D1 · Severity text contrast.** The fixed severity colours fail as text on white:
  MODERATE 2.94:1, HIGH 3.56:1, LOW 3.77:1, EMERGENCY on its soft background 4.41:1.
  *Proposal:* keep the four fixed values for every fill, dot, bar, border and icon chip. Add a
  text-only `-ink` companion per level (darker in light mode, lighter in dark mode), and pair it
  with the icon and word. The EMERGENCY fill becomes `#DC2626` in **both** themes. Dark mode
  currently uses `#F87171`, so white on SOS/Call is **2.77:1**; this change restores the fixed
  value. Is an `-ink` text variant acceptable under "never tint"?
- **D2 · Dark primary buttons.** White on `#D9635E` is 3.56:1 and fails.
  *Proposal:* `--on-primary` is dark ink (`#0B1220`) in dark theme only. Brand colours are unchanged.
- **D3 · Webfont.** `index.html` loads Inter from Google Fonts in 6 weights. That is a render-blocking
  third-party request on slow connections. *Proposal:* drop it and use the system stack.
- **D4 · Mobile navigation.** *Proposal:* below 768px, a bottom tab bar with Chat · History · Files · Emergency · More (Settings/Profile).
  SOS stays pinned in the top bar. The drawer is removed.
- **D5 · Behaviour and copy changes** (each small, but none are purely visual):
  1. The emergency panel currently animates open (height 0 → auto). Its actions should appear instantly, with no animation.
  2. "Find nearby hospitals" currently navigates the app away (`window.location.href`). Open it in a new tab instead.
  3. A failed send currently renders the error text *as an AI card*. Proposal: render it as an error row with **Retry**, which resends the same text through the same API call.
  4. History delete is instant, with no confirmation, and fails silently. Add a `ConfirmDialog` and a toast on failure.
  5. The "Allow AI analysis" toggle on the upload page isn't sent anywhere. Remove it, or label it "Not yet active"?
  6. False or stale copy to fix:
     - Login footer: "All data stored locally on your device".
     - "Verified" badge shown on every profile.
     - Upload success: "front-end preview — nothing was uploaded yet". It *does* upload.
     - Landing: "Works offline" and the FAQ both imply triage works with no internet.
     - Landing hero mock tells the reader to "chew an aspirin".
     - Landing hero mock shows a made-up "City Care · 1.2 km".
     - "Allergies: None" when the field is empty. Should read "Not provided".
     - Emergency panel shows "Risk 0" when opened from SOS with no assessment.
  7. Landing "Documentation": four cards that all just go to /login, and no docs exist. Remove the section?
  8. Theme: add "System" and default to `prefers-color-scheme` (Phase 7 requires this; mobile already has it).
- **D6 · Hover colour transitions.** I'm reading "animate only transform/opacity" as covering movement.
  Hover colour and border changes would still transition over 120ms. OK, or make them instant?
- **D7 · Verifying signed-in pages.** I can't sign in (I don't enter credentials). Options:
  (a) you sign in once in the browser pane and I test from there; or (b) a dev-only preview route with mock data.
  Option (b) would be tree-shaken out of production by `import.meta.env.DEV`.
- **Git.** The repo is on `main`. I'll work on a branch `redesign/ui-system` with one commit per phase.

---

## 1. Inventory

### Routes (`app/App.jsx`)
| Route | Component | Shell |
| --- | --- | --- |
| `/` | `marketing/Landing.jsx` | own nav and footer, CSS `LX_CSS` |
| `/login` | `auth/components/Login.jsx` | legacy `Header.jsx` and `App.css` |
| `/auth/callback`, `/app` | `AuthCallback`, `Gate` (App.jsx) | plain `Loading` text |
| `/profile-setup` | `profile/pages/ProfileSetup.jsx` | standalone card, CSS `PS_CSS` |
| `/dashboard/*` | `dashboard/DashboardLayout.jsx` with `<Outlet>` | rail, top bar, CSS `DB_CSS` |
| ↳ `chat` | `pages/ChatPage.jsx` | |
| ↳ `history` | `pages/HistoryPage.jsx` | |
| ↳ `files` | `FilesPage` → `medical-documents/components/DocumentsTab.jsx` | |
| ↳ `profile` | `ProfilePage` → `profile/components/ProfileTab.jsx` (+ `SecurityPins`, `CreatePinModal`) | |
| ↳ `emergency` | `EmergencyPage` → `emergency/components/EmergencyTab.jsx` | |
| ↳ `settings` | `SettingsPage` → `profile/components/SettingsTab.jsx` (+ `AuthSection`) | |
| ↳ `offline` | `pages/OfflinePage.jsx` (placeholder) | |
| `/documents/upload` | `medical-documents/pages/DocumentUploadPage.jsx` (+ `DocumentUploadForm`, `FilePreview`, `AiAnalysisConsent`, `CreatePinModal`) | standalone card, CSS `DU_CSS` |
| `/admin` | out of scope | |

### Shared vs one-off
- **Shared components:** `InfoRow` (one 6-line component, used on 2 pages), `CreatePinModal` (profile and upload), `DashboardSkeleton` (dashboard only), `Header` (Login only).
- **Everything else is one-off.** Every page re-implements its buttons, inputs, modals, alerts and empty states.
- **State:** the dashboard passes 45 values to its pages through `Outlet` context. This is untouched; it's behaviour, not design.

## 2. Styling audit — the "before" metric

**9 style sources:**
- global CSS: `index.css`, `App.css`
- CSS template strings: `dashboard.styles.js`, `LX_CSS`, `PS_CSS`, `DU_CSS`, `LD_CSS`, and `Header.jsx`'s `<style>`
- `DashboardLayout` injects `DB_CSS`
- plus 7 inline `style={{}}`

3,872 declarations scanned.

| Category | Distinct literal values |
| --- | --- |
| Colours | **125**. `#C4504B` appears 174 times; 23 different alphas of the brand red |
| Font sizes | **43**, from `0.6rem` to `9rem`. 17 of them sit between 0.66rem and 0.95rem |
| Font weights | **8** (300, 400, 500, 600, 700, 800, 900, `bold`) |
| Spacing | **37** (includes 7, 9, 11, 13, 15, 22, 26, 34, 54, 70 px) |
| Radii | **29** (2 … 24px, 50%, 99px, 999px, 9999px, plus 6 token names) |
| Shadows | **42** |
| Durations | **21** (0.05s … 3s) |
| Easings | **7** |
| z-index | **13** (1 … 4000, no scale) |
| Line-heights | **10** |
| Letter-spacings | **15** |
| **Total** | **350 distinct values** |

- **Two token systems overlap.** `index.css` and `App.css` both define `:root` tokens. App.css loads second and overrides some of them (`--primary-soft`, `--primary-glow`).
- `var(--x, #fallback)` is written on nearly every declaration, which duplicates the palette about 400 times.
- **Dead CSS:** 72 of 504 defined classes are never used.
  - `App.css`: 47, including the whole old dashboard/chat/patient-card system, `bottom-dock`, `sos-floating-btn`, `emergency-panel`, and `info-card*`.
  - `dashboard.styles.js`: 17 (`db-doc*`, `dx-brand*`, `dx-emergency-btn`, `dx-chip*`, …).
  - `DU_CSS`: 6 (`du-type*`, `du-pins`).
  - `LX_CSS`: 2 (`lx-cta*`).
- **Used but undefined:** `auth-hint`, `dx-emergency-risk`, `ps-footer-left`.

## 3. Duplication

| Job | Implementations |
| --- | --- |
| Text buttons | **15**: `lx-btn`, `ps-btn`, `du-btn`, `dx-mbtn`, `dx-action`, `dock-btn`, `ghost-button`, `navbar-link`, `dx-setting-btn`, `dx-ea`, `dx-call`, `db-sos`, `db-newchat`, `dx-theme-btn`, `ps-add`. There are **5 separate "primary"** styles, with radii 10/12/99 and a gradient on one. |
| Icon buttons | **13**: `db-icon-ghost`, `dx-icon-btn`, `dx-send`, `db-file-act`, `sp-del`, `du-file-remove`, `dx-msgmenu-btn`, `dx-attcard-x`, `dx-fb`, `lx-burger`, `dx-history-act`, `db-cat-edit`, `db-cat-remove`. Sizes range from 22 to 44px. |
| Text inputs | **6** live: global `App.css`, `dx-modal-input`, `da-input`, `du-input`, `ps-field input`, `dh-search`. Radii 8/11/12. |
| Cards | **~10**: `dx-card`, `dx-acard`, `dx-aicard`, `db-cat-group`, `lx-card`, `lx-doc`, `ps-card`, `du-card`, `onboarding-section`, `ps-contact`. Radii 12/14/16/18/20/22. |
| Modals | **8 instances**, one markup pattern, re-typed each time. Only 1 animates, none trap focus, none restore focus, 2 handle Escape. |
| Loading | **6**: full-screen ambulance animation, plain "Loading…" text (×3), `db-docs-spinner`, rotating `RefreshCw`, bouncing dots (×2). No skeleton matches content. |
| Errors and alerts | **11**: `auth-alert`, `da-alert`, `db-docs-error`, `ps-error`, `du-submit-error`, `sp-err`, `dx-modal-err`, `da-err`, `ps-fielderr`, `du-fielderr`, `dx-toast`. Most use the *brand* red, not an error colour. |
| Empty states | **6**: `dx-empty`, `db-docs-empty`, `dh-empty`, `dx-analysis-empty`, `dx-greeting`, `db-cat-empty`. Only the chat greeting offers an action. |
| Badges and pills | **~10**. |
| Brand lockups | **6**, in 3 spellings: "Sankat.AI", "Sankat.Ai", "SankatAI". |
| Logic re-implemented locally | `ageFromDob` ×2, `formatBytes` (= shared `fmtFileSize`), `fmtDate` in SecurityPins, and `GENDERS` / `BLOOD_GROUPS` / `LANGUAGES` in ProfileSetup (all already in `@sankatai/shared`). The sidebar disclaimer is a paraphrase of `AI_DISCLAIMER`. |

## 4. Inconsistencies

- **Red is used as decoration everywhere.** It colours card-title icons, file icons, quick-action icons, category folders, the brand-coloured `dx-card-title svg`, hover borders on every card, validation errors, and the avatar gradients.
- **Emergency red is used for routine actions:**
  - "Upload" on Files (`dx-action danger`);
  - "Update password" in Settings;
  - the soft background of the "New Chat" button and the active nav tab (`--sev-emergency-soft`).
- **Destructive modals** (delete file, delete PIN) use the *primary* button. There is no destructive variant.
- **Gradients** (`linear-gradient(135deg,#C4504B,#D9635E)`): avatars, progress bars, Login hero, `dock-btn`, blood badge.
- **Glass and blur:**
  - `backdrop-filter` on the Landing nav and Login header;
  - `filter: blur(4px)` on file-grid hover.
- **Uppercase micro-labels** in 5 different size/tracking combinations.
- **Focus styles:**
  - 9 `outline: none` declarations, and only 2 `:focus-visible` rules in the whole app;
  - the input focus ring is a 10% tint (1.14:1, effectively invisible);
  - custom buttons fall back to the browser outline, or to nothing where `outline:none` is set.
- **Hover styles vary:**
  - some lift (`translateY(-1px/-2px)`), some scale (1.05, 1.08), some rotate (`-2deg`);
  - others only change colour;
  - `transition: all` appears about 30 times.
- **Global transition:** `index.css` applies a 360ms colour transition to every element (`*`). It slows every hover and costs repaint on low-end Android.

## 5. UX problems

### Medical safety (highest priority)
- **SOS is hidden behind a loading gate.** While the profile or first conversation loads, `DashboardSkeleton` covers the viewport at `z-index: 4000`, SOS included. `if (loading) return <DashboardSkeleton/>` does the same. On a slow connection that is several seconds with no emergency access.
- **Emergency actions animate in.** The emergency panel's actions animate from `height: 0` (framer default, about 300ms).
- **Emergency number isn't tappable.** The `EMERGENCY_CALLOUT` ("Call 108 … IMMEDIATELY") is plain text inside the EMERGENCY card, not a `tel:` link.
- **Misleading risk score.** SOS opens the panel with **"Risk 0"** when there has been no assessment.
- **Offline fallback answers look like AI answers.** They get the same card, AI avatar and Helpful/Not-helpful buttons. The only difference is an orange banner at **3.35:1** contrast.
- **Errors look like AI answers.** Failed sends render the error text *inside an AI card*.
- **No SOS on standalone pages.** `/documents/upload` and `/profile-setup` have no SOS or emergency access at all.
- **Silent failures in emergency actions:**
  - "Share my location" does nothing when geolocation fails (no error callback);
  - "Call emergency contact" and "Share location" are disabled with no explanation when there are no contacts.
- **Hospital search leaves the app.** It replaces the current page during an emergency.

### Flow and hierarchy
- **Chat**
  - Quick chips ("Chest pain causes"…) sit above the composer all the time, even mid-conversation.
  - The greeting suggestions duplicate them, with different copy.
  - The send button is enabled with an empty input and does nothing.
  - The typing indicator is three dots with no text and no `aria-live`.
- **History**
  - A row is `div role=button` containing `span role=button` actions: nested, unfocusable, and hover-only above 760px.
  - Delete has no confirmation, and failure is swallowed.
  - A failed list load shows "No consultations yet".
- **Files**
  - The header has 4 equal-weight buttons, and the primary one is emergency red.
  - The empty state has no Upload action.
  - The loading state is a spinner, not a skeleton.
  - The error banner has no retry.
  - Grid-view actions exist only on hover (`pointer-events: none` until then). On touch devices the first tap opens the file.
  - Category rename/remove are hover-only spans.
- **Upload**
  - Copy is stale in three places: the subtitle says "choose its type" (removed), the button says "Submit", and the success screen says nothing was uploaded.
  - The submit button is disabled with no reason given.
  - The consent toggle goes nowhere.
- **Profile setup**
  - "Preferred language" is asked on step 1 *and* step 2.
  - "Skip" really means "finish now".
  - Locked steps look clickable.
  - Errors show only "Required".
  - The server error renders at the top, possibly off-screen.
- **Profile**
  - Shows "Verified" unconditionally.
  - Shows "None" for empty allergies, conditions and disability. That is a clinical misstatement.
  - Delete-PIN uses the primary button.
  - The PIN list has no error retry.
- **Settings**
  - The first card ("Edit profile", "Go to chat") is navigation chrome.
  - The theme toggle ignores the OS preference.
- **Offline page** — the header's "Offline backup" badge leads to "coming soon": a dead end that never explains what offline mode means.
- **Login**
  - Uses an entirely different visual language (legacy `App.css`).
  - Labels aren't bound to inputs.
  - Password rules appear only in the placeholder.
  - The config banner points to a stale `frontend/.env` path.
  - The false footer claim noted in D5.
- **Landing**
  - The Documentation section is a dead end.
  - Two panels bob forever.
  - The hero mock gives specific medication advice.
- **Toasts** — one error channel (`hospitalError`) serves all messages. No `aria-live`, no auto-dismiss, hard-coded `#1E293B`.

## 6. Responsive gaps

- **Viewport height and safe areas**
  - `100vh` on `.db-shell` and `body`. On Android Chrome the composer drops under the URL bar.
  - No `dvh` fallback anywhere except the Landing hero.
  - No `env(safe-area-inset-*)`.
- **Below 760px**
  - The rail becomes an off-canvas drawer: no focus management, no Escape, and SOS sits top-right, out of thumb reach.
  - No bottom navigation.
  - The top bar at 360px packs menu, brand, offline badge, analysis and SOS into one row.
- **761–1024px:** the rail takes 20% (min 228px), leaving about 530px for chat at 768px, and the chat column doesn't adapt.
- **Tablets** (touch, ≥760px): the message menu, history actions and file-grid actions are hover-only. Hover-only CSS is gated by width, not by `(hover: hover)`.
- **Landing**
  - The footer keeps 3 columns at 360px.
  - The hero visual is ordered first on mobile and pushes the headline below the fold.
  - Measured: no horizontal scroll at 360.
- **ProfileSetup** hides step labels below 640px, leaving the step buttons with no accessible name.
- **Modals** are centred cards on mobile, with no bottom-sheet or keyboard-safe placement.

## 7. Accessibility gaps

### Contrast (computed on real token values)

Light theme:

| Pair | Ratio | Result |
| --- | --- | --- |
| muted on `surface-2` | 4.34 | FAIL |
| primary on primary-soft (active nav) | 4.12 | FAIL |
| EMERGENCY ink on its soft background | 4.41 | FAIL |
| HIGH (orange) on white — offline badge | 3.56 | FAIL |
| MODERATE on white | 2.94 | FAIL |
| LOW / success on white | 3.77 | FAIL |
| input border on white | 1.24 | FAIL (need 3) |
| App.css placeholder | 2.45 | FAIL |
| focus ring | 1.14 | FAIL |

Dark theme:

| Pair | Ratio | Result |
| --- | --- | --- |
| white on primary (every primary button) | 3.56 | FAIL |
| white on SOS / Call / Ambulance (`#F87171`) | **2.77** | FAIL |
| border on surface | 1.38 | FAIL |
| **Login inputs**: `#FAFBFC` background with `#E8ECF3` text | **1.14** | FAIL — the sign-up form is unreadable (confirmed in browser) |
| **Landing nav**: light glass background with light text | 1.22 | FAIL (confirmed) |
| **Landing footer**: `var(--text-primary)` background turns light, grey links | about 1.3 | FAIL (confirmed) |
| **Login hero**: light gradient card, heading text near-white | — | invisible (confirmed) |

### Keyboard
- **No skip link.**
- **Hidden drawer is focusable.** The analysis drawer stays in the DOM off-screen, so its buttons take focus while it is closed; it has no Escape.
- **Modals** don't trap or restore focus.
- **Nested interactive controls** in history rows and file rows.
- **`span role=button` without `tabIndex`**: history actions, category tools.

### Semantics
- **Heading order**
  - The dashboard has no `h1`: the top bar is an `h2`, and pages start at `h3`.
  - Login has no `h1`.
- **Unlabelled icon-only controls**
  - with no label at all: send, 8 modal close buttons, analysis close, the emergency-contact call link;
  - with `title` only: attach, mic, analysis open, history actions.
- **Missing states**
  - FAQ and burger lack `aria-expanded`.
  - The `du-switch` has no accessible name ("switch, ON").

### Touch targets under 44px
`dx-attcard-x` 22, `dx-history-act` ~22, `db-cat-*` ~21, `dx-msgmenu-btn` 28, `dx-fb` 28–30,
`db-icon-ghost` ~30, `db-file-act` 34, `sp-del` ~28, `dx-call` ~28 tall.

### Colour-only meaning
- The history severity dot has no label.
- The file-grid protected badge hides its text on mobile, though the lock icon stays.

### Motion
- **Infinite animations** ignore reduced motion: Landing floats, ambulance loader (partially handled), typing dots, mic pulse.
- `scroll-behavior: smooth` isn't gated.
- `prefers-color-scheme` is ignored (the app defaults to light).

## 8. Baseline build (`npm run build:web`, before)

| Chunk | Raw | Gzip |
| --- | --- | --- |
| `index` (app) | 244.21 kB | 55.80 kB |
| `react` | 229.67 kB | 73.44 kB |
| `motion` | 112.37 kB | 37.18 kB |
| `cognito` | 81.76 kB | 23.89 kB |
| `icons` | 17.15 kB | 6.14 kB |
| runtime | 1.29 kB | 0.71 kB |
| **JS total** | **686.45 kB** | **197.16 kB** |
| CSS | 25.86 kB | 5.82 kB |

No chunk is over 500 kB. CSS-in-JS strings live inside the `index` chunk, so removing dead CSS
reduces the JS size as well.
