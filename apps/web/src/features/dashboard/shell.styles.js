// Dashboard shell layout. Tokens only.
export const SHELL_CSS = `
.sh {
  display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  height: 100vh; height: 100dvh; overflow: hidden; background: var(--bg);
}

/* ----- side nav (>=768) ----- */
.sh-side {
  display: flex; flex-direction: column; gap: var(--space-2); width: 17rem; min-height: 0;
  padding: var(--space-4) var(--space-4); padding-top: calc(var(--space-4) + env(safe-area-inset-top));
  background: var(--bg); border-right: 1px solid var(--border-subtle); overflow-y: auto;
}
.sh-side-brand { display: flex; align-items: center; min-height: var(--control-h); padding: 0 var(--space-2); margin-bottom: var(--space-2); border-radius: var(--radius-control); }
.sh-brand-mark { display: none; }
.sh-newchat-icon { display: none; }
.sh-nav { display: flex; flex-direction: column; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
.sh-side > .sh-nav { margin-top: var(--space-3); }
.sh-nav-item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--touch); padding: 0 var(--space-3);
  border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary);
  font-size: var(--fs-md); line-height: var(--lh-sm); font-weight: var(--fw-medium); text-align: left;
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.sh-nav-item svg { color: var(--text-muted); transition: color var(--dur-fast) var(--ease-standard); }
.sh-nav-item:hover { background: var(--surface-hover); color: var(--text-primary); }
/* Current page: white surface, edge and weight — never colour alone. */
.sh-nav-item.active { background: var(--surface); border-color: var(--border-subtle); box-shadow: var(--shadow-0); color: var(--text-primary); font-weight: var(--fw-semibold); }
.sh-nav-item.active svg { color: var(--primary); }
.sh-nav-short { display: none; }
.sh-side-extra { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-1); padding-top: var(--space-6); }
.sh-side-heading { padding: 0 var(--space-3) var(--space-1); }
.sh-disclaimer { display: flex; gap: var(--space-3); padding: var(--space-4); margin-top: var(--space-3); border-radius: var(--radius-card); background: var(--surface); border: 1px solid var(--border-subtle); }
.sh-disclaimer svg { color: var(--primary); margin-top: 0.1875rem; flex-shrink: 0; }
.sh-disclaimer p { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.sh-disclaimer--sheet { margin-top: var(--space-3); background: var(--surface-tint); border-color: var(--primary-border); }
.sh-user {
  display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-3); padding: var(--space-2);
  border-radius: var(--radius-card); min-height: var(--touch); border: 1px solid transparent;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.sh-user:hover { background: var(--surface-hover); }
.sh-user.active { background: var(--surface); border-color: var(--border-subtle); }
.sh-user-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.sh-user-name { font-size: var(--fs-md); line-height: var(--lh-sm); font-weight: var(--fw-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-user-sub { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.sh-user-chev { color: var(--text-muted); }

/* ----- main column ----- */
.sh-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.sh-bar {
  position: sticky; top: 0; z-index: var(--z-sticky);
  display: flex; align-items: center; gap: var(--space-3);
  min-height: 4rem; padding: 0 var(--space-5) 0 var(--space-8); padding-top: env(safe-area-inset-top);
  background: var(--bg); border-bottom: 1px solid var(--border-subtle);
}
.sh-bar-mark { display: none; }
.sh-bar-title { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); letter-spacing: -0.015em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sh-bar-actions { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
.sh-bar-newchat { display: none; }
.sh-bar-analysis { color: var(--text-secondary); }

.sh-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.sh-content:focus { outline: none; }
.sh-content--chat { overflow: hidden; display: flex; flex-direction: column; }
.sh-page { min-height: 100%; }
.sh-content--chat > .sh-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }

/* Shell-level notice (e.g. profile failed to load) */
.sh-notice { padding: var(--space-3) var(--space-8) 0; }
@media (max-width: 767px) { .sh-notice { padding: var(--space-3) var(--space-4) 0; } }

/* Page body used by every non-chat dashboard page */
.pg { width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-10) var(--space-6); padding-bottom: var(--space-16); display: flex; flex-direction: column; gap: var(--space-6); }
.pg--wide { max-width: var(--content-wide); }
.pg > .ui-pagehead { margin-bottom: 0; }

/* ----- bottom tab bar (<768) ----- */
.sh-bottom { display: none; }
.sh-more { display: flex; flex-direction: column; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
.sh-more-item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 3rem; padding: 0 var(--space-3);
  border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary);
  font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); text-align: left;
}
.sh-more-item svg { color: var(--primary); }
.sh-more-item:hover { background: var(--surface-hover); }

/* ----- 768-1023: compact icon rail ----- */
@media (max-width: 1023px) {
  .sh-side { width: 6rem; align-items: center; padding-left: var(--space-2); padding-right: var(--space-2); }
  .sh-brand-full, .sh-newchat-full, .sh-nav-label, .sh-side-extra, .sh-user-text, .sh-user-chev { display: none; }
  .sh-brand-mark { display: grid; }
  .sh-side-brand { justify-content: center; padding: 0; width: var(--touch); }
  .sh-newchat-icon { display: inline-flex; }
  .sh-side > .sh-nav { width: 100%; }
  .sh-nav-item { flex-direction: column; justify-content: center; gap: var(--space-1); min-height: 4rem; padding: var(--space-1); text-align: center; }
  .sh-nav-short { display: block; font-size: var(--fs-xs); line-height: var(--lh-xs); }
  .sh-user { margin-top: auto; padding: var(--space-1); justify-content: center; }
  .sh-bar { padding-left: var(--space-6); }
}

/* ----- <768: bottom tab bar, no side nav ----- */
@media (max-width: 767px) {
  .sh { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .sh-side { display: none; }
  .sh-bar { min-height: 3.5rem; padding-left: var(--space-4); padding-right: var(--space-3); gap: var(--space-2); }
  .sh-bar-mark { display: grid; }
  .sh-bar-title { font-size: var(--fs-md); line-height: var(--lh-md); }
  .sh-bar-newchat { display: inline-flex; }
  .sh-bar-analysis { width: var(--touch); padding: 0; }
  .sh-bar-actions { gap: var(--space-1); }
  .sh-bar .ui-btn--emergency { padding: 0 var(--space-4); }
  .sh-bar-analysis .ui-btn-text { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .sh-bottom {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: var(--space-1) var(--space-1) env(safe-area-inset-bottom);
    background: var(--surface); border-top: 1px solid var(--border-subtle);
  }
  .sh-tab {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-1);
    min-height: 3.75rem; padding: var(--space-1) 0; border: 0; background: transparent; color: var(--text-muted);
    font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-medium);
  }
  .sh-tab svg { padding: 0.125rem 0; width: 3.5rem; height: 1.75rem; border-radius: var(--radius-pill); transition: background-color var(--dur-fast) var(--ease-standard); }
  .sh-tab.active { color: var(--text-primary); font-weight: var(--fw-semibold); }
  .sh-tab.active svg { background: var(--primary-soft); color: var(--primary-text); }
  .pg { padding: var(--space-6) var(--space-4); padding-bottom: var(--space-10); gap: var(--space-5); }
  body:has(.sh) { --toast-offset: 3.75rem; }
}
`
