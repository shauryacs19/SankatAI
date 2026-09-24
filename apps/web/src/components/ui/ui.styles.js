// Styles for the shared UI primitives. Tokens only — no raw values.
// Installed once with the global stylesheet (styles/install.js).

export const UI_CSS = `
/* ---------- Button ---------- */
.ui-btn {
  position: relative; display: inline-flex; align-items: center; justify-content: center;
  min-height: var(--control-h); padding: 0 var(--space-4); gap: var(--space-2);
  border: 1px solid transparent; border-radius: var(--radius-control);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold);
  white-space: nowrap; text-decoration: none; user-select: none; -webkit-tap-highlight-color: transparent;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.ui-btn:active:not(:disabled):not([aria-disabled="true"]) { transform: scale(0.98); }
.ui-btn--sm { min-height: var(--control-h-sm); padding: 0 var(--space-3); }
@media (pointer: coarse) { .ui-btn--sm { min-height: var(--touch); } }
.ui-btn--block { display: flex; width: 100%; }
.ui-btn-stack { display: grid; }
.ui-btn-stack > span { grid-area: 1 / 1; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); }
.ui-btn-busy { visibility: hidden; }
.ui-btn[aria-busy="true"] .ui-btn-idle { visibility: hidden; }
.ui-btn[aria-busy="true"] .ui-btn-busy { visibility: visible; }

.ui-btn--primary { background: var(--primary); color: var(--on-primary); }
.ui-btn--primary:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--primary-hover); }
.ui-btn--secondary { background: var(--surface); color: var(--text-primary); border-color: var(--border-default); }
.ui-btn--secondary:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--surface-hover); border-color: var(--border-strong); }
.ui-btn--ghost { background: transparent; color: var(--text-secondary); }
.ui-btn--ghost:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--surface-hover); color: var(--text-primary); }
.ui-btn--destructive { background: var(--danger); color: var(--on-danger); }
.ui-btn--destructive:hover:not(:disabled):not([aria-disabled="true"]) { background: var(--danger-hover); }
/* Life-critical only. No transition: feedback is instant. */
.ui-btn--emergency { background: var(--sev-emergency); color: var(--on-emergency); transition: none; }
.ui-btn--emergency:hover { background: var(--sev-emergency-hover); }
.ui-btn:disabled, .ui-btn[aria-disabled="true"] {
  background: var(--surface-sunken); color: var(--text-muted); border-color: var(--border-subtle); cursor: not-allowed;
}

/* ---------- Icon button ---------- */
.ui-iconbtn {
  display: inline-grid; place-items: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0;
  border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--text-secondary);
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
@media (pointer: coarse) { .ui-iconbtn { width: var(--touch); height: var(--touch); } }
.ui-iconbtn:hover:not(:disabled) { background: var(--surface-hover); color: var(--text-primary); }
.ui-iconbtn:active:not(:disabled) { transform: scale(0.96); }
.ui-iconbtn--secondary { background: var(--surface); border-color: var(--border-default); }
.ui-iconbtn--primary { background: var(--primary); color: var(--on-primary); }
.ui-iconbtn--primary:hover:not(:disabled) { background: var(--primary-hover); color: var(--on-primary); }
.ui-iconbtn--danger:hover:not(:disabled) { color: var(--danger); background: var(--danger-soft); }
.ui-iconbtn[aria-pressed="true"], .ui-iconbtn[aria-expanded="true"] { background: var(--surface-hover); color: var(--text-primary); }
.ui-iconbtn:disabled { color: var(--text-muted); opacity: 0.6; cursor: not-allowed; }
.ui-iconbtn--primary:disabled { background: var(--surface-sunken); opacity: 1; }

/* ---------- Tooltip (supplementary only) ---------- */
.ui-tipwrap { position: relative; display: inline-flex; }
.ui-tip {
  position: absolute; left: 50%; bottom: calc(100% + var(--space-2)); z-index: var(--z-dropdown);
  transform: translate(-50%, var(--space-1)); opacity: 0; pointer-events: none;
  padding: var(--space-1) var(--space-2); border-radius: var(--radius-control);
  background: var(--text-primary); color: var(--bg); font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-medium);
  white-space: nowrap; transition: opacity var(--dur-fast) var(--ease-exit), transform var(--dur-fast) var(--ease-exit);
}
.ui-tip--bottom { bottom: auto; top: calc(100% + var(--space-2)); transform: translate(-50%, calc(-1 * var(--space-1))); }
.ui-tip--end { left: auto; right: 0; transform: translate(0, var(--space-1)); }
.ui-tip--bottom.ui-tip--end { transform: translate(0, calc(-1 * var(--space-1))); }
@media (hover: hover) {
  .ui-tipwrap:hover > .ui-tip { opacity: 1; transform: translate(-50%, 0); transition-delay: 400ms; transition-timing-function: var(--ease-enter); }
  .ui-tipwrap:hover > .ui-tip--end { transform: translate(0, 0); }
}
.ui-tipwrap:focus-within > .ui-tip { opacity: 1; transform: translate(-50%, 0); }
.ui-tipwrap:focus-within > .ui-tip--end { transform: translate(0, 0); }
@media (pointer: coarse) { .ui-tip { display: none; } }

/* ---------- Field / inputs ---------- */
.ui-field { display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; }
.ui-label { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); color: var(--text-primary); }
.ui-label-opt { font-weight: var(--fw-regular); color: var(--text-muted); }
.ui-req { color: var(--danger); margin-left: var(--space-1); }
.ui-hint { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.ui-field-error { display: flex; align-items: flex-start; gap: var(--space-1); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--danger); font-weight: var(--fw-medium); }
.ui-field-error svg { margin-top: 0.125rem; }
.ui-input, .ui-select, .ui-textarea {
  width: 100%; min-height: var(--control-h); padding: 0 var(--space-3);
  border: 1px solid var(--border-strong); border-radius: var(--radius-control);
  background: var(--surface); color: var(--text-primary);
  font-size: var(--fs-md); line-height: var(--lh-md);
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.ui-input:hover, .ui-select:hover, .ui-textarea:hover { border-color: var(--text-muted); }
.ui-input:focus-visible, .ui-select:focus-visible, .ui-textarea:focus-visible { border-color: var(--focus-ring); outline-offset: 1px; }
.ui-input[aria-invalid="true"], .ui-select[aria-invalid="true"], .ui-textarea[aria-invalid="true"] { border-color: var(--danger); }
.ui-input:disabled, .ui-select:disabled, .ui-textarea:disabled { background: var(--surface-sunken); color: var(--text-muted); cursor: not-allowed; }
.ui-input--pin { letter-spacing: 0.3em; font-variant-numeric: tabular-nums; }
.ui-textarea { padding: var(--space-3); min-height: 5.5rem; resize: vertical; }
.ui-select-wrap { position: relative; display: block; }
.ui-select { appearance: none; -webkit-appearance: none; padding-right: var(--space-10); cursor: pointer; }
.ui-select-chev { position: absolute; right: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.ui-inputgroup { position: relative; display: flex; align-items: center; }
.ui-inputgroup > svg { position: absolute; left: var(--space-3); color: var(--text-muted); pointer-events: none; }
.ui-inputgroup > .ui-input { padding-left: var(--space-10); }
.ui-inputgroup > .ui-inputgroup-end { position: absolute; right: var(--space-1); display: flex; align-items: center; }
.ui-inputgroup > .ui-input.has-end { padding-right: var(--space-12); }

/* ---------- Form layout ---------- */
.ui-form { display: flex; flex-direction: column; gap: var(--space-5); }
.ui-form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5) var(--space-4); }
.ui-form-grid > .is-full { grid-column: 1 / -1; }
.ui-form-actions { display: flex; justify-content: flex-end; align-items: center; flex-wrap: wrap; gap: var(--space-3); }
.ui-form-actions-start { margin-right: auto; }
@media (max-width: 639px) { .ui-form-grid { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 479px) {
  .ui-form-actions { flex-direction: column-reverse; align-items: stretch; }
  .ui-form-actions > .ui-btn, .ui-form-actions > .ui-tipwrap, .ui-form-actions > .ui-tipwrap > .ui-btn { width: 100%; }
  .ui-form-actions-start { margin-right: 0; }
}

/* ---------- Card ---------- */
.ui-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); padding: var(--space-5); min-width: 0; }
.ui-card--flush { padding: 0; }
.ui-card-head { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); min-height: var(--control-h-sm); }
.ui-card--flush > .ui-card-head { padding: var(--space-4) var(--space-5) 0; }
.ui-card-title { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); min-width: 0; }
.ui-card-title svg { color: var(--text-muted); }
.ui-card-desc { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); margin-top: calc(-1 * var(--space-3)); margin-bottom: var(--space-4); }
.ui-card-actions { margin-left: auto; display: flex; align-items: center; gap: var(--space-2); }
@media (max-width: 479px) { .ui-card { padding: var(--space-4); } .ui-card--flush { padding: 0; } .ui-card--flush > .ui-card-head { padding: var(--space-4) var(--space-4) 0; } }

/* rows inside a card, separated by a hairline (no nested boxes) */
.ui-rows { display: flex; flex-direction: column; }
.ui-rows > * + * { border-top: 1px solid var(--border-subtle); }

/* ---------- Info row ---------- */
.ui-info-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding: var(--space-3) 0; }
.ui-info-label { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); flex-shrink: 0; }
.ui-info-label svg { color: var(--text-muted); align-self: center; }
.ui-info-value { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); color: var(--text-primary); text-align: right; min-width: 0; overflow-wrap: anywhere; }
.ui-info-value.is-empty { font-weight: var(--fw-regular); color: var(--text-muted); }

/* ---------- Modal / sheet ---------- */
.ui-scrim { position: fixed; inset: 0; z-index: var(--z-modal); background: var(--scrim); display: grid; place-items: center; padding: var(--space-4); }
.ui-modal {
  position: relative; width: min(100%, 28rem); max-height: calc(100dvh - var(--space-8)); display: flex; flex-direction: column;
  background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-modal); box-shadow: var(--shadow-3);
  overflow: hidden;
}
.ui-modal--md { width: min(100%, 36rem); }
.ui-modal form { display: contents; }
.ui-modal-head { display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-5) var(--space-5) 0; }
.ui-modal-icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
.ui-modal-icon--danger { background: var(--danger-soft); color: var(--danger); }
.ui-modal-titles { flex: 1; min-width: 0; padding-top: var(--space-2); }
.ui-modal-title { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); }
.ui-modal-desc { margin-top: var(--space-1); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.ui-modal-close { margin: calc(-1 * var(--space-2)) calc(-1 * var(--space-2)) 0 0; }
.ui-modal-body { padding: var(--space-5); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-4); }
.ui-modal-foot { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: var(--space-3); padding: var(--space-4) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--surface-raised); }
.ui-modal-foot-start { margin-right: auto; }
.ui-scrim--side { place-items: stretch end; padding: 0; }
.ui-modal--side { width: min(100%, 24rem); height: 100%; max-height: none; border-radius: var(--radius-modal) 0 0 var(--radius-modal); border-width: 0 0 0 1px; box-shadow: var(--shadow-2); }
.ui-modal--side .ui-modal-head { padding-top: calc(var(--space-5) + env(safe-area-inset-top)); }
.ui-modal--side .ui-modal-body { flex: 1; padding-bottom: calc(var(--space-5) + env(safe-area-inset-bottom)); }
@media (max-width: 479px) {
  .ui-scrim:not(.ui-scrim--side) { place-items: end stretch; padding: 0; }
  .ui-scrim:not(.ui-scrim--side) > .ui-modal { width: 100%; max-height: calc(100dvh - var(--space-6)); border-radius: var(--radius-modal) var(--radius-modal) 0 0; border-width: 1px 0 0; }
  .ui-scrim:not(.ui-scrim--side) .ui-modal-foot { padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom)); flex-direction: column-reverse; align-items: stretch; }
  .ui-scrim:not(.ui-scrim--side) .ui-modal-foot > .ui-btn, .ui-scrim:not(.ui-scrim--side) .ui-modal-foot > .ui-tipwrap { width: 100%; }
  .ui-modal-foot-start { margin-right: 0; }
}

/* ---------- Menu (dropdown) ---------- */
.ui-menu-anchor { position: relative; display: inline-flex; }
.ui-menu {
  position: absolute; z-index: var(--z-dropdown); min-width: 11rem; padding: var(--space-1);
  background: var(--surface-raised); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); box-shadow: var(--shadow-1);
  display: flex; flex-direction: column;
}
.ui-menu--bottom { top: calc(100% + var(--space-1)); }
.ui-menu--top { bottom: calc(100% + var(--space-1)); }
.ui-menu--end { right: 0; } .ui-menu--start { left: 0; }
.ui-menu-item {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: 2.5rem; padding: 0 var(--space-3);
  border: 0; border-radius: var(--radius-control); background: transparent; color: var(--text-primary);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); text-align: left; white-space: nowrap;
}
@media (pointer: coarse) { .ui-menu-item { min-height: var(--touch); } }
.ui-menu-item svg { color: var(--text-muted); }
.ui-menu-item:hover, .ui-menu-item:focus-visible { background: var(--surface-hover); }
.ui-menu-item:focus-visible { outline-offset: -2px; }
.ui-menu-item--danger, .ui-menu-item--danger svg { color: var(--danger); }

/* ---------- Toasts ---------- */
.ui-toasts {
  position: fixed; left: 0; right: 0; z-index: var(--z-toast); pointer-events: none;
  bottom: calc(var(--space-4) + env(safe-area-inset-bottom) + var(--toast-offset, 0px));
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2); padding: 0 var(--space-4);
}
.ui-toast {
  pointer-events: auto; width: min(100%, 26rem); display: flex; align-items: flex-start; gap: var(--space-3);
  padding: var(--space-3) var(--space-2) var(--space-3) var(--space-4);
  background: var(--surface-raised); color: var(--text-primary); border: 1px solid var(--border-subtle);
  border-radius: var(--radius-card); box-shadow: var(--shadow-2);
}
.ui-toast-icon { margin-top: 0.125rem; color: var(--text-secondary); }
.ui-toast--success .ui-toast-icon { color: var(--success); }
.ui-toast--error .ui-toast-icon { color: var(--danger); }
.ui-toast--warning .ui-toast-icon { color: var(--warning); }
.ui-toast-body { flex: 1; min-width: 0; padding-top: var(--space-1); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.ui-toast-title { font-weight: var(--fw-semibold); }
.ui-toast .ui-iconbtn { margin: calc(-1 * var(--space-1)) 0; }

/* ---------- Skeleton ---------- */
.ui-skel { display: block; background: var(--surface-sunken); border-radius: var(--radius-control); animation: ui-pulse 1.6s var(--ease-standard) infinite; }
.ui-skel--text { height: var(--lh-sm); border-radius: var(--space-1); }
.ui-skel--circle { border-radius: var(--radius-pill); }
@keyframes ui-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }

/* ---------- Empty / error states ---------- */
.ui-state { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-3); padding: var(--space-8) var(--space-5); max-width: 28rem; }
.ui-state--compact { padding: var(--space-5) 0; }
.ui-state-icon { display: grid; place-items: center; width: 2.75rem; height: 2.75rem; border-radius: var(--radius-card); background: var(--surface-sunken); color: var(--text-secondary); }
.ui-state--error .ui-state-icon { background: var(--danger-soft); color: var(--danger); }
.ui-state-title { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); }
.ui-state-desc { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.ui-state-actions { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-1); }

/* ---------- Alert (inline notice) ---------- */
.ui-alert {
  display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface-sunken);
  font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-primary);
}
.ui-alert > svg { margin-top: 0.125rem; color: var(--text-secondary); }
.ui-alert-body { flex: 1; min-width: 0; }
.ui-alert-title { font-weight: var(--fw-semibold); }
.ui-alert-action { flex-shrink: 0; margin: calc(-1 * var(--space-1)) 0; }
.ui-alert--success { background: var(--success-soft); border-color: var(--success-border); } .ui-alert--success > svg { color: var(--success); }
.ui-alert--warning { background: var(--warning-soft); border-color: var(--warning-border); } .ui-alert--warning > svg { color: var(--warning); }
.ui-alert--danger { background: var(--danger-soft); border-color: var(--danger-border); } .ui-alert--danger > svg { color: var(--danger); }

/* ---------- Badge / chip / severity ---------- */
.ui-badge {
  display: inline-flex; align-items: center; gap: var(--space-1); min-height: 1.5rem; padding: 0 var(--space-2);
  border: 1px solid transparent; border-radius: var(--radius-pill);
  font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-medium); white-space: nowrap;
  background: var(--surface-sunken); color: var(--text-secondary);
}
.ui-badge--success { background: var(--success-soft); color: var(--success); border-color: var(--success-border); }
.ui-badge--warning { background: var(--warning-soft); color: var(--warning); border-color: var(--warning-border); }
.ui-badge--danger { background: var(--danger-soft); color: var(--danger); border-color: var(--danger-border); }
.ui-badge--brand { background: var(--primary-soft); color: var(--primary-text); border-color: var(--primary-border); }
.ui-badge--outline { background: transparent; border-color: var(--border-default); }
a.ui-badge:hover { border-color: currentColor; }

.ui-chip {
  display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--control-h-sm); padding: 0 var(--space-3);
  border: 1px solid var(--border-default); border-radius: var(--radius-pill); background: var(--surface); color: var(--text-secondary);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); white-space: nowrap;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
@media (pointer: coarse) { .ui-chip { min-height: var(--touch); } }
.ui-chip:hover { background: var(--surface-hover); color: var(--text-primary); border-color: var(--border-strong); }
.ui-chip svg { color: var(--text-muted); }

.ui-sev {
  display: inline-flex; align-items: center; gap: var(--space-1); min-height: 1.5rem; padding: 0 var(--space-2);
  border: 1px solid; border-radius: var(--radius-pill); font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-semibold); white-space: nowrap;
}
.ui-sev--lg { min-height: 1.75rem; padding: 0 var(--space-3); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.ui-sev--low { color: var(--sev-low-ink); background: var(--sev-low-soft); border-color: var(--sev-low-border); }
.ui-sev--moderate { color: var(--sev-moderate-ink); background: var(--sev-moderate-soft); border-color: var(--sev-moderate-border); }
.ui-sev--high { color: var(--sev-high-ink); background: var(--sev-high-soft); border-color: var(--sev-high-border); }
.ui-sev--emergency { color: var(--sev-emergency-ink); background: var(--sev-emergency-soft); border-color: var(--sev-emergency-border); }
.ui-sevdot { display: inline-block; width: 0.5rem; height: 0.5rem; border-radius: var(--radius-pill); background: var(--text-muted); flex-shrink: 0; }
.ui-sevdot--low { background: var(--sev-low); } .ui-sevdot--moderate { background: var(--sev-moderate); }
.ui-sevdot--high { background: var(--sev-high); } .ui-sevdot--emergency { background: var(--sev-emergency); }

/* ---------- Segmented control / tabs ---------- */
.ui-seg { display: inline-flex; gap: var(--space-1); padding: var(--space-1); background: var(--surface-sunken); border-radius: var(--radius-control); }
.ui-seg--block { display: flex; width: 100%; }
.ui-seg--block .ui-seg-item { flex: 1; }
.ui-seg-item {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  min-height: 2.25rem; padding: 0 var(--space-3); border: 1px solid transparent; border-radius: calc(var(--radius-control) - 2px);
  background: transparent; color: var(--text-secondary); font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
@media (pointer: coarse) { .ui-seg-item { min-height: var(--touch); min-width: var(--touch); } }
.ui-seg-item:hover { color: var(--text-primary); }
.ui-seg-item[aria-checked="true"], .ui-seg-item[aria-selected="true"] { background: var(--surface); color: var(--text-primary); border-color: var(--border-default); }

/* ---------- Switch ---------- */
.ui-switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); }
.ui-switch-text { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.ui-switch-desc { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.ui-switch { display: inline-grid; place-items: center; width: var(--touch); height: var(--touch); flex-shrink: 0; border: 0; background: transparent; padding: 0; border-radius: var(--radius-control); }
.ui-switch-track { position: relative; width: 2.25rem; height: 1.25rem; border-radius: var(--radius-pill); background: var(--border-strong); transition: background-color var(--dur-fast) var(--ease-standard); }
.ui-switch-thumb { position: absolute; top: 0.125rem; left: 0.125rem; width: 1rem; height: 1rem; border-radius: var(--radius-pill); background: var(--surface); transition: transform var(--dur-fast) var(--ease-standard); }
.ui-switch[aria-checked="true"] .ui-switch-track { background: var(--text-primary); }
.ui-switch[aria-checked="true"] .ui-switch-thumb { transform: translateX(1rem); background: var(--surface); }

/* ---------- Spinner ---------- */
.ui-spinner { animation: ui-spin 0.9s linear infinite; }
@keyframes ui-spin { to { transform: rotate(360deg); } }

/* ---------- Avatar ---------- */
.ui-avatar { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-secondary); font-size: var(--fs-sm); font-weight: var(--fw-semibold); flex-shrink: 0; }
.ui-avatar--lg { width: 3.5rem; height: 3.5rem; font-size: var(--fs-xl); }

/* ---------- Brand ---------- */
.ui-brand { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-bold); letter-spacing: -0.01em; color: var(--text-primary); }
.ui-brand svg { color: var(--primary); }
.ui-brand--sm { font-size: var(--fs-md); line-height: var(--lh-md); }

/* ---------- Page header (description + page-level actions) ---------- */
.ui-pagehead { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3) var(--space-4); margin-bottom: var(--space-6); }
.ui-pagehead-text { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1 1 16rem; }
.ui-pagehead-title { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); letter-spacing: -0.01em; }
.ui-pagehead-desc { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); max-width: 40rem; }
.ui-pagehead-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); }

/* ---------- Bulleted list ---------- */
.ui-list { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }

/* ---------- Overline (section group label) ---------- */
.ui-overline { font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-semibold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); }

/* ---------- Skip link ---------- */
.ui-skip {
  position: fixed; top: var(--space-2); left: var(--space-2); z-index: var(--z-skip);
  padding: var(--space-2) var(--space-4); border-radius: var(--radius-control);
  background: var(--text-primary); color: var(--bg); font-size: var(--fs-sm); font-weight: var(--fw-semibold);
  transform: translateY(-200%);
}
.ui-skip:focus-visible { transform: none; }
`
