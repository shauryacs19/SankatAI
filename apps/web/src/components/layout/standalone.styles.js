// Layout for standalone (non-shell) signed-in pages: document upload and
// profile setup. A slim bar with back / brand / emergency, and a centred
// reading-width card. Tokens only.
export const STANDALONE_CSS = `
.sa { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.sa-bar {
  position: sticky; top: 0; z-index: var(--z-sticky);
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  min-height: 3.5rem; padding: env(safe-area-inset-top) var(--space-4) 0;
  background: var(--surface); border-bottom: 1px solid var(--border-subtle);
}
.sa-brand { position: absolute; left: 50%; transform: translateX(-50%); }
.sa-main { flex: 1; width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-12); }
.sa-main:focus { outline: none; }
.sa-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); padding: var(--space-8); display: flex; flex-direction: column; gap: var(--space-6); }
.sa-title { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); letter-spacing: -0.01em; }
.sa-lead { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); margin-top: calc(-1 * var(--space-4)); }
.sa-inline-ic { display: inline; vertical-align: -2px; }
.sa-success { display: flex; flex-direction: column; gap: var(--space-4); }
.sa-success .sa-lead { margin-top: 0; }
.sa-success-ic { color: var(--success); }
@media (max-width: 767px) {
  .sa-main { padding: var(--space-4) var(--space-4) var(--space-8); }
  .sa-card { padding: var(--space-5); border-radius: var(--radius-card); }
  .sa-title { font-size: var(--fs-xl); line-height: var(--lh-xl); }
}
@media (max-width: 479px) {
  .sa-main { padding: 0 0 var(--space-8); }
  .sa-card { border-width: 0; border-radius: 0; padding: var(--space-5) var(--space-4); }
  .sa-brand { display: none; }
}
`
