// Landing page. Tokens only — theme-proof in light and dark.
export const LANDING_CSS = `
.lx { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.lx main { flex: 1; }
.lx main:focus { outline: none; }

/* nav — solid surface, no blur */
.lx-nav { position: sticky; top: 0; z-index: var(--z-sticky); background: var(--surface); border-bottom: 1px solid var(--border-subtle); padding-top: env(safe-area-inset-top); }
.lx-nav-inner { max-width: 72rem; margin: 0 auto; display: flex; align-items: center; gap: var(--space-6); min-height: 4rem; padding: 0 var(--space-6); }
.lx-links { display: flex; gap: var(--space-1); flex: 1; }
.lx-links a { display: inline-flex; align-items: center; min-height: var(--touch); padding: 0 var(--space-3); border-radius: var(--radius-control); font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--text-secondary); }
.lx-links a:hover { color: var(--text-primary); background: var(--surface-hover); }
.lx-nav-cta { display: flex; gap: var(--space-2); }
.lx-burger { display: none; margin-left: auto; }
.lx-mobile-menu { display: none; }

/* hero */
.lx-hero { max-width: 72rem; margin: 0 auto; padding: var(--space-16) var(--space-6); display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr); gap: var(--space-12); align-items: center; }
.lx-hero-copy { display: flex; flex-direction: column; gap: var(--space-5); }
.lx-hero-copy h1 { font-size: clamp(var(--fs-3xl), 2rem + 1.5vw, var(--fs-4xl)); line-height: 1.15; font-weight: var(--fw-bold); letter-spacing: -0.02em; max-width: 34rem; }
.lx-hero-lead { font-size: var(--fs-lg); line-height: var(--lh-lg); color: var(--text-secondary); max-width: 34rem; }
.lx-hero-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); }
.lx-hero-note { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.lx-hero-note svg { color: var(--success); margin-top: 0.125rem; }
.lx-hero-note a, .lx-foot-cols a[href^="tel"] { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); }
.lx-hero-note a { text-decoration: underline; text-underline-offset: 2px; }

/* product mock (static — no floating, no fake data) */
.lx-mock { margin: 0; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-modal); }
.lx-mock-user { align-self: flex-end; max-width: 85%; padding: var(--space-3) var(--space-4); border-radius: var(--radius-card) var(--radius-card) var(--space-1) var(--radius-card); background: var(--surface-sunken); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.lx-mock-ai { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--sev-emergency-border); border-left: 3px solid var(--sev-emergency); border-radius: var(--radius-card); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.lx-mock-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.lx-mock-who { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: var(--fw-semibold); }
.lx-mock-mark { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--primary); }
.lx-mock-call { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); border-radius: var(--radius-control); background: var(--sev-emergency-soft); }
.lx-mock-call p { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); }
.lx-mock-call .ui-btn { align-self: flex-start; pointer-events: none; }
.lx-mock-cap { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }

/* sections */
.lx-section { max-width: 72rem; margin: 0 auto; padding: var(--space-16) var(--space-6); }
.lx-section--band { max-width: none; background: var(--surface); border-block: 1px solid var(--border-subtle); }
.lx-band-inner { max-width: 72rem; margin: 0 auto; }
.lx-section-head { display: flex; flex-direction: column; gap: var(--space-2); max-width: 40rem; margin-bottom: var(--space-10); }
.lx-section-head h2, .lx-cta h2 { font-size: var(--fs-3xl); line-height: var(--lh-3xl); font-weight: var(--fw-semibold); letter-spacing: -0.015em; }

.lx-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); list-style: none; margin: 0; padding: 0; }
.lx-card { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-6); background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.lx-card-icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; margin-bottom: var(--space-2); border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); }
.lx-card h3, .lx-step h3 { font-size: var(--fs-lg); line-height: var(--lh-lg); }
.lx-card p, .lx-step p { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }

.lx-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-8); list-style: none; margin: 0; padding: 0; }
.lx-step { display: flex; flex-direction: column; gap: var(--space-2); }
.lx-step-n { display: grid; place-items: center; width: 2rem; height: 2rem; margin-bottom: var(--space-2); border-radius: var(--radius-pill); border: 1px solid var(--border-default); font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }

.lx-faq { max-width: 45rem; display: flex; flex-direction: column; border-top: 1px solid var(--border-subtle); }
.lx-faq-item { border-bottom: 1px solid var(--border-subtle); }
.lx-faq-item h3 { font-size: inherit; }
.lx-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: 3.5rem; padding: var(--space-4) 0; border: 0; background: transparent; text-align: left; font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); color: var(--text-primary); }
.lx-faq-q svg { color: var(--text-muted); transition: transform var(--dur-base) var(--ease-standard); }
.lx-faq-q svg.is-open { transform: rotate(180deg); }
.lx-faq-a { padding: 0 0 var(--space-5); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); max-width: 40rem; }

.lx-cta { max-width: 72rem; margin: 0 auto var(--space-16); padding: var(--space-10) var(--space-6); display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); border-top: 1px solid var(--border-subtle); }
.lx-cta p { font-size: var(--fs-lg); line-height: var(--lh-lg); color: var(--text-secondary); margin-bottom: var(--space-2); }

/* footer — uses surface tokens (the old one inverted text-primary and broke in dark) */
.lx-footer { background: var(--surface); border-top: 1px solid var(--border-subtle); padding-bottom: env(safe-area-inset-bottom); }
.lx-footer-inner { max-width: 72rem; margin: 0 auto; padding: var(--space-12) var(--space-6) var(--space-8); display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--space-10); }
.lx-foot-brand { display: flex; flex-direction: column; gap: var(--space-3); }
.lx-foot-brand p { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); max-width: 22rem; }
.lx-foot-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
.lx-foot-cols > div { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
.lx-foot-cols h2 { margin-bottom: var(--space-2); }
.lx-foot-cols a, .lx-foot-link { display: inline-flex; align-items: center; gap: var(--space-2); min-height: 2.25rem; padding: 0; border: 0; background: transparent; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); text-align: left; }
.lx-logo { display: inline-flex; align-items: center; min-height: var(--touch); }
@media (pointer: coarse) { .lx-foot-cols a, .lx-foot-link { min-height: var(--touch); min-width: var(--touch); } }
.lx-foot-cols a:hover, .lx-foot-link:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 2px; }
.lx-foot-bottom { max-width: 72rem; margin: 0 auto; padding: var(--space-5) var(--space-6); border-top: 1px solid var(--border-subtle); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }

@media (max-width: 1023px) {
  .lx-hero { grid-template-columns: minmax(0, 1fr); padding-top: var(--space-10); gap: var(--space-10); }
  .lx-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 767px) {
  .lx-links, .lx-nav-cta { display: none; }
  .lx-burger { display: inline-grid; }
  .lx-nav-inner { padding: 0 var(--space-4); min-height: 3.5rem; }
  .lx-mobile-menu { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-2) var(--space-4) var(--space-4); border-top: 1px solid var(--border-subtle); }
  .lx-mobile-menu nav { display: flex; flex-direction: column; }
  .lx-mobile-menu nav a { display: flex; align-items: center; min-height: var(--touch); font-weight: var(--fw-medium); }
  .lx-hero, .lx-section, .lx-cta { padding-left: var(--space-4); padding-right: var(--space-4); }
  .lx-hero { padding-top: var(--space-8); padding-bottom: var(--space-12); }
  .lx-hero-lead { font-size: var(--fs-md); line-height: var(--lh-md); }
  .lx-section { padding-top: var(--space-12); padding-bottom: var(--space-12); }
  .lx-section-head { margin-bottom: var(--space-6); }
  .lx-section-head h2, .lx-cta h2 { font-size: var(--fs-2xl); line-height: var(--lh-2xl); }
  .lx-grid, .lx-steps { grid-template-columns: minmax(0, 1fr); }
  .lx-steps { gap: var(--space-6); }
  .lx-footer-inner { grid-template-columns: minmax(0, 1fr); padding: var(--space-10) var(--space-4) var(--space-6); gap: var(--space-8); }
  .lx-foot-bottom { padding: var(--space-4); }
  .lx-hero-actions .ui-btn { flex: 1 1 auto; }
}
`
