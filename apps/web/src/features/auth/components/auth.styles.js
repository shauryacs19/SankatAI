// Sign-in / sign-up / verify / reset. Tokens only.
export const AUTH_CSS = `
.auth { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.auth-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 3.5rem; padding: env(safe-area-inset-top) var(--space-4) 0; }
.auth-home { display: inline-flex; align-items: center; min-height: var(--touch); }
.auth-main { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-5); padding: var(--space-10) var(--space-4) var(--space-12); }
.auth-main:focus { outline: none; }
.auth-card { width: 100%; max-width: 26rem; display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-8); background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.auth-head { display: flex; flex-direction: column; gap: var(--space-2); }
.auth-title { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); letter-spacing: -0.01em; }
.auth-lead { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.auth-panel { display: flex; flex-direction: column; gap: var(--space-4); }
.auth-note { display: flex; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.auth-note svg { color: var(--success); margin-top: 0.125rem; flex-shrink: 0; }
.auth-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.auth-check { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); color: var(--text-secondary); min-height: var(--touch); cursor: pointer; }
.auth-check input { width: 1.125rem; height: 1.125rem; accent-color: var(--primary); }
.auth-link { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--primary-text); text-decoration: underline; text-underline-offset: 2px; }
.auth-links { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); color: var(--text-secondary); text-align: center; }
.auth-pw .ui-input { padding-right: 2.75rem; }
.auth-pw-toggle { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border: 0; background: transparent; color: var(--text-muted); border-radius: var(--radius-control); cursor: pointer; }
.auth-pw-toggle:hover { color: var(--text-primary); background: var(--surface-hover); }
.auth-pw-toggle:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.auth-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1) var(--space-3); margin: 0; padding: 0; list-style: none; font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.auth-rules li { display: flex; align-items: center; gap: var(--space-1); }
.auth-rules li.ok { color: var(--success); }
.auth-code { letter-spacing: 0.4em; font-variant-numeric: tabular-nums; text-align: center; font-size: var(--fs-lg); }
.auth-social { display: flex; flex-direction: column; gap: var(--space-3); }
.auth-social-mark { display: inline-grid; place-items: center; width: 1.25rem; height: 1.25rem; }
.auth-divider { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-1) 0 0; font-size: var(--fs-sm); color: var(--text-muted); }
.auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
.auth-hint { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); margin: 0; }
.auth-foot { max-width: 26rem; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.auth-foot a { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 2px; }
.auth code { font-size: var(--fs-xs); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 479px) {
  .auth-main { padding-top: var(--space-4); }
  .auth-card { padding: var(--space-5); }
  .auth-title { font-size: var(--fs-xl); line-height: var(--lh-xl); }
  .auth-rules { grid-template-columns: 1fr; }
}
`
