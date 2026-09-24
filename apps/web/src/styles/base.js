// Global base styles: reset, typography defaults, focus, reduced motion.
// Reads tokens only (styles/tokens.js).

export const BASE_CSS = `
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
h1, h2, h3, h4 { font-weight: var(--fw-semibold); color: var(--text-primary); }
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

// TEMPORARY aliases so pages not yet migrated onto the primitives keep
// rendering (and get working dark mode) during the phased rollout. Removed once
// every page reads the semantic names directly.
export const LEGACY_ALIASES_CSS = `
:root, :root[data-theme="dark"] {
  --bg-body: var(--bg); --bg-surface: var(--surface); --surface-1: var(--surface);
  --surface-2: var(--surface-sunken); --surface-3: var(--border-subtle); --muted: var(--text-muted);
  --accent: var(--primary); --accent-soft: var(--primary-soft);
  --primary-glow: var(--primary-soft); --border-card: var(--border-subtle);
  --shadow-xs: none; --shadow-sm: none; --shadow-md: var(--shadow-1); --shadow-lg: var(--shadow-2); --shadow-xl: var(--shadow-3);
  --radius-xs: var(--radius-control); --radius-sm: var(--radius-control); --radius-md: var(--radius-card);
  --radius-lg: var(--radius-card); --radius-xl: var(--radius-modal); --radius-2xl: var(--radius-modal);
  --transition-base: var(--dur-fast) var(--ease-standard);
}
`
