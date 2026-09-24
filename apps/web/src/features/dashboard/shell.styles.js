// Dashboard shell layout. Tokens only.
export const SHELL_CSS = `
.sh {
  display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: minmax(0, 1fr);
  height: 100vh; height: 100dvh; overflow: hidden; background: var(--bg);
}

/* ----- side nav (≥768) ----- */
.sh-side {
  display: flex; flex-direction: column; gap: var(--space-2); width: 16rem; min-height: 0;
  padding: var(--space-4) var(--space-3); padding-top: calc(var(--space-4) + env(safe-area-inset-top));
  background: var(--surface); border-right: 1px solid var(--border-subtle); overflow-y: auto;
}
.sh-side-brand { display: flex; align-items: center; min-height: var(--control-h); padding: 0 var(--space-2); border-radius: var(--radius-control); }
.sh-brand-mark { display: none; color: var(--primary); }
.sh-newchat-icon { display: none; }
.sh-nav { display: flex; flex-direction: column; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
.sh-side > .sh-nav { margin-top: var(--space-2); }
.sh-nav-item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 2.5rem; padding: 0 var(--space-3);
  border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); text-align: left;
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.sh-nav-item svg { color: var(--text-muted); }
.sh-nav-item:hover { background: var(--surface-hover); color: var(--text-primary); }
.sh-nav-item.active { background: var(--surface-hover); color: var(--text-primary); font-weight: var(--fw-semibold); }
.sh-nav-item.active svg { color: var(--text-primary); }
.sh-nav-short { display: none; }
.sh-side-extra { margin-top: auto; display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-4); }
.sh-side-heading { padding: 0 var(--space-3); }
.sh-disclaimer { display: flex; gap: var(--space-2); padding: var(--space-3); margin-top: var(--space-2); border-radius: var(--radius-card); background: var(--surface-sunken); }
.sh-disclaimer svg { color: var(--text-muted); margin-top: 0.125rem; }
.sh-disclaimer p { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-secondary); }
.sh-disclaimer--sheet { margin-top: var(--space-2); }
.sh-user {
  display: flex; align-items: center; gap: var(--space-3); margin-top: var(--space-2); padding: var(--space-2);
  border-radius: var(--radius-control); min-height: var(--touch);
}
.sh-user:hover { background: var(--surface-hover); }
.sh-user.active { background: var(--surface-hover); }
.sh-user-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.sh-user-name { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sh-user-sub { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.sh-user-chev { color: var(--text-muted); }

/* ----- main column ----- */
.sh-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
.sh-bar {
  position: sticky; top: 0; z-index: var(--z-sticky);
  display: flex; align-items: center; gap: var(--space-3);
  min-height: 3.5rem; padding: 0 var(--space-4) 0 var(--space-6); padding-top: env(safe-area-inset-top);
  background: var(--surface); border-bottom: 1px solid var(--border-subtle);
}
.sh-bar-mark { display: none; color: var(--primary); }
.sh-bar-title { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.sh-bar-actions { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
.sh-bar-newchat { display: none; }

.sh-content { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.sh-content:focus { outline: none; }
.sh-content--chat { overflow: hidden; display: flex; flex-direction: column; }
.sh-page { min-height: 100%; }
.sh-content--chat > .sh-page { display: flex; flex-direction: column; flex: 1; min-height: 0; }

/* Page body used by every non-chat dashboard page */
.pg { width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-6); padding-bottom: var(--space-12); display: flex; flex-direction: column; gap: var(--space-6); }
.pg--wide { max-width: var(--content-wide); }
.pg > .ui-pagehead { margin-bottom: 0; }

/* ----- bottom tab bar (<768) ----- */
.sh-bottom { display: none; }
.sh-more { display: flex; flex-direction: column; gap: var(--space-1); list-style: none; margin: 0; padding: 0; }
.sh-more-item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--touch); padding: 0 var(--space-3);
  border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary);
  font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); text-align: left;
}
.sh-more-item svg { color: var(--text-muted); }
.sh-more-item:hover { background: var(--surface-hover); }

/* ----- 768–1023: compact icon rail ----- */
@media (max-width: 1023px) {
  .sh-side { width: 5.5rem; align-items: center; padding-left: var(--space-2); padding-right: var(--space-2); }
  .sh-brand-full, .sh-newchat-full, .sh-nav-label, .sh-side-extra, .sh-user-text, .sh-user-chev { display: none; }
  .sh-brand-mark { display: block; }
  .sh-side-brand { justify-content: center; padding: 0; width: var(--touch); }
  .sh-newchat-icon { display: inline-flex; }
  .sh-side > .sh-nav { width: 100%; }
  .sh-nav-item { flex-direction: column; justify-content: center; gap: var(--space-1); min-height: 3.5rem; padding: var(--space-1); text-align: center; }
  .sh-nav-short { display: block; font-size: var(--fs-xs); line-height: var(--lh-xs); }
  .sh-user { margin-top: auto; padding: var(--space-1); justify-content: center; }
}

/* ----- <768: bottom tab bar, no side nav ----- */
@media (max-width: 767px) {
  .sh { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
  .sh-side { display: none; }
  .sh-bar { padding-left: var(--space-4); padding-right: var(--space-3); gap: var(--space-2); }
  .sh-bar-mark { display: block; }
  .sh-bar-title { font-size: var(--fs-md); line-height: var(--lh-md); }
  .sh-bar-newchat { display: inline-flex; }
  .sh-bottom {
    display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
    padding: 0 var(--space-1) env(safe-area-inset-bottom);
    background: var(--surface); border-top: 1px solid var(--border-subtle);
  }
  .sh-tab {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--space-1);
    min-height: 3.5rem; padding: var(--space-1) 0; border: 0; background: transparent; color: var(--text-muted);
    font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-medium);
  }
  .sh-tab.active { color: var(--text-primary); font-weight: var(--fw-semibold); }
  .pg { padding: var(--space-4); padding-bottom: var(--space-8); gap: var(--space-5); }
  body:has(.sh) { --toast-offset: 3.5rem; }
}
`
