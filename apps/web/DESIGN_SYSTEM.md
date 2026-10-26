# SankatAI web design system

The goal is a calm, trustworthy health companion that anyone can use, including older adults:
warm ivory, white reading surfaces, restrained sage accents, large readable type. Every visual
choice must be justified by hierarchy, affordance or feedback. If it can't be, remove it.

## Where things live

| What | Where |
| --- | --- |
| Shared visual identity and structural tokens | `packages/shared/theme.js`: light/dark colours, severity fills, spacing, font weights, motion, z-index and breakpoints. Both clients consume this palette. |
| Web-only refinements | `src/styles/palette.js`: severity text inks, type scale, font stack and radii. |
| Webfont | Inter variable (OFL, `public/fonts/Inter-LICENSE.txt`), self-hosted from `src/assets/fonts/`, `@font-face` in `src/styles/base.js`. No third-party font request. |
| CSS custom properties (the only place they are generated) | `src/styles/tokens.js` |
| Reset, focus and reduced motion | `src/styles/base.js`, installed once by `src/styles/install.js` before first paint |
| Primitives | `src/components/ui/`. Styles are in `ui.styles.js`. Import from `components/ui`. |
| Motion presets and the reduced-motion hook | `src/components/ui/motion.js` |

Components never use a raw colour, size or duration. Read a token. If no token fits, the design
is wrong or the token set needs a deliberate addition in `theme.js`.

## Colour

Colour carries meaning. **Most of the UI is warm neutral; sage marks the one thing to act on.**

| Palette | Light | Use |
| --- | --- | --- |
| Warm ivory | `#F6F4ED` | `--bg`, page background |
| White | `#FFFFFF` | `--surface`: cards, inputs, replies |
| Muted sage | `#426F68` | `--primary`: primary buttons, current item, key icons |
| Soft sage | `#E5EBE3` | `--primary-soft`, `--surface-tint`, `--user-bubble` |
| Stone | `#E8E9E5` | `--border-subtle` |
| Charcoal | `#293B38` | `--text-primary` |
| Muted grey | `#5E6964` | `--text-muted` (the brief's `#66716C`, darkened to keep 4.5:1 on stone) |

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
| `--primary`, `--primary-hover`, `--on-primary` | the one primary action per view, the brand mark, the current nav item's icon |
| `--surface-tint`, `--user-bubble` | soft sage fills: info alerts, the user's chat bubble, the closing call to action |
| `--focus-halo` | the soft ring around a focused input (its 2px sage edge is the indicator) |
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

- One family: `--font-sans` (Inter, then the system stack; Devanagari falls back to the system).
- One scale, senior-friendly. **Nothing below 14px.**

| Token | px / line-height | Use |
| --- | --- | --- |
| `--fs-xs` | 14 / 20 | badges, timestamps |
| `--fs-sm` | 15 / 22 | supporting copy, hints, small buttons, group labels |
| `--fs-md` | 17 / 27 | **body, inputs, buttons, navigation** |
| `--fs-lg` | 19 / 28 | card titles, app bar title |
| `--fs-xl` | 22 / 30 | dialog and state titles |
| `--fs-2xl` | 28 / 36 | page and auth headings |
| `--fs-3xl` / `--fs-4xl` | 34 / 42, 48 / 56 | home page only (headings use `clamp()` there) |

- Weights: 400 body, 500 controls and labels, 600 headings, 700 rare emphasis. There is no 800 or 900.
- Hierarchy uses weight, colour and space together, not size alone.
- `.ui-overline` is a sentence-case group label (`--fs-sm`, 600, muted). No small uppercase labels.

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
| Inputs, selects, icon buttons, nav items | `--radius-control` (12) |
| Cards, panels, list containers | `--radius-card` (16); chat replies and the composer use 20 |
| Modals, sheets, drawers, auth card | `--radius-modal` (20) |
| Text buttons, chips, badges | `--radius-pill` |

## Elevation

Prefer a border. Shadows are only for things that genuinely float.

| Level | Use |
| --- | --- |
| flat | everything in the page flow (border only) |
| `--shadow-lift` | the main question box (home page and chat composer) and the auth card |
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
| `Button` | Pill, 48px (40px `sm`). Variants: `primary` (one per view), `secondary`, `ghost`, `destructive` (always behind a `ConfirmDialog`), `emergency` (life-critical only). `loading` keeps the width and sets `aria-busy`. Give a disabled button a `hint` that explains why. Prefer a word next to an icon; wrap it in `.ui-btn-text` if it may be hidden on phones (it stays the accessible name). |
| `IconButton` | ≥40px (44px on touch). `label` is required; it becomes `aria-label` and the tooltip. |
| `Field` + `Input` / `Select` / `Textarea` | Always labelled. `hint`, `error` (sets `aria-invalid` and `aria-describedby`), `required`. Validate on blur, not just on submit. |
| `Card` | `--surface`, `--border-subtle`, `--radius-card`, no shadow. Optional header (title and actions). |
| `Modal` / `ConfirmDialog` | Focus trap, Escape to close, focus restored on close. Primary action bottom-right, destructive actions separated. Becomes a bottom sheet below 480px. |
| `Menu` | Dropdown with arrow-key navigation, Escape, and outside-click close. `text` gives the trigger a visible word. |
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

## Home page showcase

- Product visuals are real screens captured from the dev preview (`preview.html?showcase=1`, sample data) and
  labelled as sample screens. Regenerate after UI changes:
  `node --experimental-websocket apps/web/scripts/capture-showcase.mjs` (writes `src/assets/showcase/*.webp`).
- Each shot exists in light and dark; `Shot` renders both and CSS shows the active theme's (lazy, so the other
  is never downloaded). Always pass real `alt` text describing what the screen shows.
- Motion: once-only `whileInView` reveals (fade + 16–48px offset, 0.5–0.8s), staggered lists, one gentle scroll
  parallax in the hero, and the only looping motion is the floating chips (stopped by reduced motion). Real
  emergency actions (Call 108 buttons, the call-108 note) are never animated in.

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
