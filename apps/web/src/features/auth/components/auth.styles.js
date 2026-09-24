// Sign-in / sign-up. Tokens only.
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
.auth-panel:focus { outline: none; }
.auth-note { display: flex; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.auth-note svg { color: var(--success); margin-top: 0.125rem; }
.auth-foot { max-width: 26rem; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.auth-foot a { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 2px; }
.auth code { font-size: var(--fs-xs); }
@media (max-width: 479px) {
  .auth-main { padding-top: var(--space-4); }
  .auth-card { padding: var(--space-5); }
  .auth-title { font-size: var(--fs-xl); line-height: var(--lh-xl); }
}
`
