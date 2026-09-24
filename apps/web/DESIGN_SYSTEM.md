# SankatAI web design system

The goal is clinical trust: calm, precise, high-contrast and fast. Every visual choice must be
justified by hierarchy, affordance or feedback. If it can't be, remove it.

## Where things live

| What | Where |
| --- | --- |
| Token values (shared with mobile) | `packages/shared/theme.js`. The additive exports are `semantic`, `severityTokens`, `neutral`, `typeScale`, `space`, `motionTokens`, `zIndex` and `breakpoints`. |
| CSS custom properties (the only place they are generated) | `src/styles/tokens.js` |
| Reset, focus and reduced motion | `src/styles/base.js`, installed once by `src/styles/install.js` before first paint |
| Primitives | `src/components/ui/`. Styles are in `ui.styles.js`. Import from `components/ui`. |
| Motion presets and the reduced-motion hook | `src/components/ui/motion.js` |

Components never use a raw colour, size or duration. Read a token. If no token fits, the design
is wrong or the token set needs a deliberate addition in `theme.js`.

## Colour

Colour carries meaning. **Most of the UI is neutral.**

| Token | Use |
| --- | --- |
| `--bg` | page background |
| `--surface` | cards, panels, inputs |
| `--surface-raised` | menus, modals, toasts (anything floating) |
| `--surface-sunken` | user chat bubble, quiet fills, skeleton base |
| `--surface-hover` | hover background for ghost controls and rows |
| `--text-primary` / `--text-secondary` / `--text-muted` | titles and body / supporting copy / metadata. All ≥4.5:1 on every surface. |
| `--border-subtle` | structural dividers and card edges (decorative) |
| `--border-strong` | input and control boundaries (≥3:1, WCAG 1.4.11) |
| `--focus-ring` | the single focus outline (neutral, 2px, offset 2px) |
| `--primary`, `--primary-hover`, `--on-primary` | **only** the one primary action per view and the brand mark |
| `--primary-text` | brand-coloured text (≥4.5:1 on `--bg`) |
| `--danger*` | destructive actions and error messages. Distinct from emergency. |
| `--warning*`, `--success*` | status notices (offline mode, saved) |

### Severity (fixed, semantic)

| Level | Fill (`--sev-x`) | Text (`--sev-x-ink`) light / dark |
| --- | --- | --- |
| LOW | `#059669` | `#047857` / `#34D399` |
| MODERATE | `#CA8A04` | `#A16207` / `#FACC15` |
| HIGH | `#EA580C` | `#C2410C` / `#FB923C` |
| EMERGENCY | `#DC2626` | `#B91C1C` / `#F87171` |

- **Fills are identical in both themes and are never tinted.** Use them for dots, bars, borders and solid buttons.
- **The fixed fills are too light for small text.** MODERATE on white is 2.94:1, so text uses `-ink`. `-soft` and `-border` are tints for badge backgrounds only.
- **Severity is never colour alone.** It always carries its word ("High risk"), and usually an icon.
- **Only life-critical actions use `--sev-emergency`:** SOS, Call 108, and calling an emergency contact. White on `#DC2626` is 4.83:1.
- **Red means an action, not decoration.** Primary red means "the main thing to do here", emergency red means "call for help now", and danger red means "irreversible". Red is never used for icons, borders or backgrounds just for looks.

### Themes
`data-theme="light|dark"` on `<html>`, resolved from the user's preference (Light / Dark /
System; the default is System) by `services/theme.js`. Both themes are complete, and every pair
above is contrast-checked.

## Typography

- One family: `--font-sans` (the system stack). No webfont request.
- One scale, about 1.2 ratio:

| Token | px / line-height | Use |
| --- | --- | --- |
| `--fs-xs` | 12 / 16 | badges, timestamps, overlines |
| `--fs-sm` | 14 / 20 | secondary copy, labels, buttons, meta |
| `--fs-md` | 16 / 24 | **body and inputs** (the mobile body minimum; 16px inputs also stop iOS zoom) |
| `--fs-lg` | 18 / 26 | card titles |
| `--fs-xl` | 20 / 28 | page titles in the app bar |
| `--fs-2xl` | 24 / 32 | empty-state and auth headings |
| `--fs-3xl` / `--fs-4xl` | 30 / 38, 36 / 44 | marketing only |

- Weights: 400 body, 500 controls and labels, 600 headings, 700 rare emphasis. There is no 800 or 900.
- Hierarchy uses weight, colour and space together, not size alone.
- Overlines (small uppercase) are allowed only for section group labels: `--fs-xs`, 600, `0.04em`.

## Spacing and layout

- 4px grid: `--space-1` (4) … `--space-16` (64). No other margin or padding values.
- Reading width is `--content-reading` (720px); dense views use `--content-wide` (960px).
- Card padding is `--space-5` (20px), `--space-4` below 480px. The gap between sections is `--space-6`.
- There are no boxes inside boxes. A card's content is rows separated by `--border-subtle`, not nested cards.
- Breakpoints: `<480`, `480–767`, `768–1023`, `1024–1439`, `≥1440`.
  - Below 768px the dashboard uses a bottom tab bar.
  - From 768px to 1023px it uses a compact icon rail.
  - From 1024px up it uses the full side nav.
- Use `100dvh` (with a `100vh` fallback) and `env(safe-area-inset-*)` on fixed bars.

## Radius

| Element | Token |
| --- | --- |
| Buttons, inputs, selects, icon buttons | `--radius-control` (8) |
| Cards, panels, list containers | `--radius-card` (12) |
| Modals, sheets, drawers | `--radius-modal` (16) |
| Chips, badges, avatars' status dots | `--radius-pill`. **Pills only here.** |

## Elevation

Prefer a border. Shadows are only for things that genuinely float.

| Level | Use |
| --- | --- |
| flat | everything in the page flow (border only) |
| `--shadow-1` | menus, dropdowns, tooltips |
| `--shadow-2` | toasts, side drawer |
| `--shadow-3` | modals |

## Motion

- Durations: `--dur-fast` 120ms (hover, dropdown) · `--dur-base` 180ms (modal, page) · `--dur-slow` 240ms (drawer, toast) · `--dur-slower` 320ms (rare).
- Easings: `--ease-standard`, `--ease-enter` (ease-out), `--ease-exit` (ease-in).
- **Movement animates `transform` and `opacity` only.** Hover colour and border changes may transition over `--dur-fast`, because they don't trigger layout. Never animate width, height, top or margin.
- Page enter: fade plus a 6px rise, 200ms. Lists stagger 35ms. Modal: fade plus scale .98 → 1, 180ms. Dropdown: 120ms. Toast: slide plus fade.
- **Reduced motion** (`useReducedMotion` in `motion.js` plus `MotionConfig reducedMotion="user"`) collapses motion to opacity or nothing. The CSS base forces near-instant transitions.
- **Clinical content never performs.** Severity cards, the emergency panel and disclaimers have no playful motion, and **emergency actions are never animated in, gated, or delayed.**

## z-index

`--z-sticky` 100 · `--z-dropdown` 200 · `--z-overlay` 300 · `--z-modal` 400 · `--z-toast` 500 · `--z-skip` 600.
No other values.

## Components (`components/ui`)

| Primitive | Rules |
| --- | --- |
| `Button` | Variants: `primary` (one per view), `secondary`, `ghost`, `destructive` (always behind a `ConfirmDialog`), `emergency` (life-critical only). `loading` keeps the width and sets `aria-busy`. Give a disabled button a `hint` that explains why. |
| `IconButton` | ≥40px (44px on touch). `label` is required; it becomes `aria-label` and the tooltip. |
| `Field` + `Input` / `Select` / `Textarea` | Always labelled. `hint`, `error` (sets `aria-invalid` and `aria-describedby`), `required`. Validate on blur, not just on submit. |
| `Card` | `--surface`, `--border-subtle`, `--radius-card`, no shadow. Optional header (title and actions). |
| `Modal` / `ConfirmDialog` | Focus trap, Escape to close, focus restored on close. Primary action bottom-right, destructive actions separated. Becomes a bottom sheet below 480px. |
| `Menu` | Dropdown with arrow-key navigation, Escape, and outside-click close. |
| `Toast` (`useToast`) | `aria-live`. Auto-dismisses, and pauses on hover or focus. Errors say what failed. |
| `Skeleton` | Initial loads, shaped like the real content. Spinners are only for in-place actions. |
| `EmptyState` | Says what goes here and offers the action that fills it. |
| `ErrorState` | Says what failed in plain words and offers Retry. |
| `Alert` | Inline notices (info, success, warning, danger). |
| `Badge` / `Chip` / `SeverityBadge` | `SeverityBadge` always shows an icon and a word. |
| `SegmentedControl` / `Tabs` | Arrow-key navigable radio or tab semantics. |
| `Switch` | `role="switch"` with a visible, bound label. |
| `Tooltip` | Supplementary text only; never the only way to learn something. |
| `SkipLink` | The first focusable element on every page. |

Loaders use `useDelayedFlag` (300ms) so fast responses don't flash. Every loading label says
what is happening: "Analysing your symptoms…", "Uploading report.pdf…", "Saving your details…".
A bare "Loading…" is not acceptable.

## Medical-safety rules (override everything above)

- SOS, Call 108 and emergency-contact calls fire immediately. There is no confirmation, no loading gate and no entrance animation. SOS stays visible while the dashboard loads.
- Offline or fallback answers are visibly different from AI answers. They have a dashed border, the "Offline estimate — not an AI assessment" label, and no AI mark.
- The medical disclaimer is always visible (in the side nav on desktop, under the composer everywhere). It is never collapsed.
- An empty medical field reads "Not provided", never "None".

## Checking your work (dev preview)

`npm run dev --workspace=@sankatai/web`, then open `/preview.html`. It renders the real app
against a mocked API with a signed-in session. It is dev-only: `preview.html` is not a build
input, so none of it ships.

| Query | Effect |
| --- | --- |
| `route=/dashboard/files` | Start page (default `/dashboard/chat`). `auth=0` shows the signed-out pages. |
| `empty=1` | Empty lists |
| `fail=1` | Every API call fails |
| `slow=3000` | Every call is delayed by 3 seconds |
| `offline=1` | AI replies are offline fallbacks |
| `static=1` | Animations are skipped, for stable screenshots |

In the browser console:
- `__qa()` reports horizontal overflow, controls with no accessible name, touch targets under 44px, the heading outline and the font sizes in use.
- `__contrast()` checks every visible text element's rendered contrast against its real background.

Run both in light and dark at 360 / 768 / 1024 / 1440 before shipping UI changes.
