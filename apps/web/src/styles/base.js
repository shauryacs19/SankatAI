// Global base styles: webfont, reset, typography defaults, focus, reduced motion.
// Reads tokens only (styles/tokens.js).

// Inter (SIL OFL 1.1, see public/fonts/Inter-LICENSE.txt), self-hosted so no
// third-party font request is made. Vite hashes these URLs. Latin-ext loads
// only when a page uses those characters; Devanagari falls back to the system.
import interLatin from '../assets/fonts/inter-latin-wght-normal.woff2?url'
import interLatinExt from '../assets/fonts/inter-latin-ext-wght-normal.woff2?url'

const FONT_FACES = `
@font-face {
  font-family: 'Inter Variable'; font-style: normal; font-display: swap; font-weight: 100 900;
  src: url(${interLatinExt}) format('woff2-variations');
  unicode-range: U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF;
}
@font-face {
  font-family: 'Inter Variable'; font-style: normal; font-display: swap; font-weight: 100 900;
  src: url(${interLatin}) format('woff2-variations');
  unicode-range: U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD;
}
`

export const BASE_CSS = FONT_FACES + `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
body {
  margin: 0; min-height: 100vh; min-height: 100dvh;
  background: var(--bg); color: var(--text-primary);
  font-family: var(--font-sans); font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-regular);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility;
}
#root { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; }
h1, h2, h3, h4, p, figure, blockquote, dl, dd { margin: 0; }
h1, h2, h3, h4 { font-weight: var(--fw-semibold); color: var(--text-primary); letter-spacing: -0.011em; text-wrap: balance; }
p { text-wrap: pretty; }
ul[role="list"], ol[role="list"] { list-style: none; margin: 0; padding: 0; }
img, svg, video { display: block; max-width: 100%; }
svg { flex-shrink: 0; }
a { color: inherit; text-decoration: none; }
button, input, select, textarea { font: inherit; color: inherit; letter-spacing: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; }
input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 1; }
select option { color: var(--text-primary); background: var(--surface-raised); }
input:-webkit-autofill, input:-webkit-autofill:hover, input:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--text-primary);
  -webkit-box-shadow: 0 0 0 1000px var(--surface) inset;
}
::selection { background: var(--primary-soft); color: var(--text-primary); }

/* One focus treatment for everything. Never removed without this replacement. */
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
@media (prefers-contrast: more) { :focus-visible { outline-width: 3px; } }

/* Inline text links read as links without relying on colour alone. */
.link { color: var(--primary-text); font-weight: var(--fw-medium); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.link:hover { text-decoration-thickness: 2px; }
.link--emergency { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); }

/* Gentle page entry for CSS-only surfaces (framer handles the rest). */
@keyframes sk-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Thin themed scrollbars */
* { scrollbar-width: thin; scrollbar-color: var(--border-strong) transparent; }

.sr-only {
  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}

/* Full-page status (session restore). */
.app-status { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-4); padding: var(--space-6); }
.app-status-line { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.app-status-sos { display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--touch); padding: 0 var(--space-4); border-radius: var(--radius-control); background: var(--sev-emergency); color: var(--on-emergency); font-size: var(--fs-sm); font-weight: var(--fw-semibold); }

/* Reduced motion: the app stays fully usable; animations collapse to instant. */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important; animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important; scroll-behavior: auto !important;
  }
}
`

// Older token names still read by features/admin/** (out of scope for the
// redesign and deliberately untouched). Mapped onto the semantic tokens so the
// admin area keeps working in both themes. Nothing else may use these names.
export const ADMIN_COMPAT_CSS = `
:root, :root[data-theme="dark"] { --bg-body: var(--bg); --bg-surface: var(--surface); --surface-2: var(--surface-sunken); }
`
