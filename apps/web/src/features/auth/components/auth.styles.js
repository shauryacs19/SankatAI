// Sign-in / sign-up / verify / reset. Tokens only.
export const AUTH_CSS = `
.auth { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.auth-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); min-height: 4.5rem; padding: env(safe-area-inset-top) var(--space-8) 0; border-bottom: 1px solid var(--border-subtle); }
.auth-home { display: inline-flex; align-items: center; min-height: var(--touch); }
.auth-main { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-6); padding: var(--space-12) var(--space-4) var(--space-16); }
.auth-main:focus { outline: none; }
.auth-card {
  width: 100%; max-width: 30rem; display: flex; flex-direction: column; gap: var(--space-6); padding: var(--space-10);
  background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-modal); box-shadow: var(--shadow-lift);
  animation: sk-rise 280ms var(--ease-enter) both;
}
@media (prefers-reduced-motion: reduce) { .auth-card { animation: none; } }
.auth-pending { display: flex; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-radius: var(--radius-control); background: var(--surface-tint); border: 1px solid var(--primary-border); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-primary); }
.auth-pending svg { color: var(--primary-text); flex-shrink: 0; margin-top: 0.125rem; }
.auth-head { display: flex; flex-direction: column; gap: var(--space-2); }
.auth-title { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); letter-spacing: -0.025em; }
.auth-lead { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.auth-panel { display: flex; flex-direction: column; gap: var(--space-4); }
.auth-note { display: flex; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.auth-note svg { color: var(--success); margin-top: 0.125rem; flex-shrink: 0; }
.auth-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.auth-check { display: inline-flex; align-items: center; gap: var(--space-3); font-size: var(--fs-md); color: var(--text-secondary); min-height: var(--touch); cursor: pointer; }
.auth-check input { width: 1.25rem; height: 1.25rem; accent-color: var(--primary); }
.auth-link { font-size: inherit; font-weight: var(--fw-semibold); color: var(--primary-text); text-decoration: underline; text-underline-offset: 3px; }
.auth-link:hover { text-decoration-thickness: 2px; }
.auth-row .auth-link { display: inline-flex; align-items: center; min-height: var(--touch); }
.auth-alt { display: flex; align-items: center; justify-content: center; gap: var(--space-3); flex-wrap: wrap; font-size: var(--fs-md); color: var(--text-muted); }
.auth-alt .auth-link { display: inline-flex; align-items: center; gap: var(--space-1); min-height: var(--touch); background: none; border: 0; padding: 0; cursor: pointer; }
.auth-alt .auth-link:disabled { opacity: .6; cursor: default; }
.auth-links { display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding-top: var(--space-5); border-top: 1px solid var(--border-subtle); font-size: var(--fs-md); color: var(--text-secondary); text-align: center; }
.auth-pw .ui-input { padding-right: 3.25rem; }
.auth-pw-toggle { display: grid; place-items: center; width: var(--touch); height: var(--touch); border: 0; background: transparent; color: var(--text-muted); border-radius: var(--radius-control); cursor: pointer; }
.auth-pw-toggle:hover { color: var(--text-primary); background: var(--surface-hover); }
.auth-pw-toggle:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.auth-rules { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-1) var(--space-3); margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.auth-rules li { display: flex; align-items: center; gap: var(--space-1); }
.auth-rules li.ok { color: var(--success); }
.auth-code { letter-spacing: 0.4em; font-variant-numeric: tabular-nums; text-align: center; font-size: var(--fs-lg); }
.auth-foot { max-width: 30rem; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); text-align: center; }
.auth code { font-size: var(--fs-xs); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
@media (max-width: 767px) { .auth-bar { min-height: 4rem; padding-left: var(--space-4); padding-right: var(--space-4); } }
@media (max-width: 479px) {
  .auth-main { padding-top: var(--space-4); }
  .auth-card { padding: var(--space-6) var(--space-5); border-radius: var(--radius-card); box-shadow: none; }
  .auth-title { font-size: var(--fs-xl); line-height: var(--lh-xl); }
  .auth-rules { grid-template-columns: 1fr; }
}
`
