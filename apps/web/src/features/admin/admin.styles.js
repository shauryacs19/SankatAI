// Admin console styles. Design tokens only (styles/tokens.js), plus the three
// categorical chart slots, validated with the dataviz palette checker against
// the app's light (#FFFFFF) and dark (#111827) surfaces.
export const ADMIN_CSS = `
.ac-root { --viz-1: #2a78d6; --viz-2: #eb6834; --viz-3: #1baf7a;
  min-height: 100vh; min-height: 100dvh; background: var(--bg); color: var(--text-primary);
  display: grid; grid-template-columns: 15rem minmax(0, 1fr); grid-template-rows: auto 1fr; }
:root[data-theme="dark"] .ac-root { --viz-1: #3987e5; --viz-2: #d95926; --viz-3: #199e70; }

.ac-topbar { grid-column: 1 / -1; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-5);
  background: var(--surface); border-bottom: 1px solid var(--border-subtle); flex-wrap: wrap; }
.ac-title { display: flex; align-items: center; gap: var(--space-3); flex: 1; min-width: 12rem; }
.ac-title-icon { width: 2.25rem; height: 2.25rem; display: grid; place-items: center; border-radius: var(--radius-control); background: var(--primary-soft); color: var(--primary-text); flex-shrink: 0; }
.ac-title h1 { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); }
.ac-title p { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }

.ac-nav { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-4) var(--space-3); border-right: 1px solid var(--border-subtle); background: var(--surface); }
.ac-navlink { display: flex; align-items: center; gap: var(--space-2); min-height: var(--control-h-sm); padding: 0 var(--space-3); border-radius: var(--radius-control);
  font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--text-secondary); text-decoration: none; white-space: nowrap;
  transition: background var(--dur-fast, 120ms) var(--ease-standard, ease), color var(--dur-fast, 120ms) var(--ease-standard, ease); }
.ac-navlink:hover { background: var(--surface-hover); color: var(--text-primary); }
.ac-navlink.active { background: var(--primary-soft); color: var(--primary-text); font-weight: var(--fw-semibold); }
.ac-navlink:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }

.ac-main { padding: var(--space-5) clamp(var(--space-4), 3vw, var(--space-8)) var(--space-12); display: flex; flex-direction: column; gap: var(--space-4); min-width: 0; }
.ac-main:focus { outline: none; }
.ac-scope { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); border-left: 3px solid var(--border-default); padding-left: var(--space-2); }
.ac-filters { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.ac-custom { display: flex; align-items: flex-end; gap: var(--space-2); flex-wrap: wrap; }
.ac-custom .ui-field { min-width: 9.5rem; }
.ac-range-note { font-size: var(--fs-xs); color: var(--text-muted); padding-bottom: var(--space-2); }

.ac-stack { display: flex; flex-direction: column; gap: var(--space-4); transition: opacity var(--dur-fast, 120ms); }
.ac-dim { opacity: 0.6; }
.ac-h2, .ac-section-head h2 { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); margin-top: var(--space-2); }
.ac-section-head { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.ac-muted { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.ac-pad { padding: var(--space-4); }
.ac-card { background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.ac-panel-pad { padding: var(--space-4); }

.ac-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: var(--space-3); }
.ac-metric { padding: var(--space-3) var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); animation: ac-in var(--dur-base, 180ms) var(--ease-standard, ease) both; }
.ac-metric-top { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); }
.ac-metric-label { font-size: var(--fs-xs); line-height: var(--lh-xs); font-weight: var(--fw-medium); color: var(--text-muted); }
.ac-metric-icon { width: 1.75rem; height: 1.75rem; display: grid; place-items: center; border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
.ac-metric-value { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
.ac-unavailable { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--text-muted); }
.ac-metric-note { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
@keyframes ac-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ac-metric { animation: none; } .ac-stack { transition: none; } }

.ac-grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); align-items: start; }

/* charts */
.ac-chart { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.ac-chart-tools { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); flex-wrap: wrap; }
.ac-legend { display: flex; gap: var(--space-3); flex-wrap: wrap; list-style: none; margin: 0; padding: 0; font-size: var(--fs-xs); color: var(--text-secondary); }
.ac-legend li { display: inline-flex; align-items: center; gap: var(--space-1); }
.ac-legend i, .ac-tip-row i { width: 0.625rem; height: 0.625rem; border-radius: 2px; display: inline-block; flex-shrink: 0; }
.ac-linkbtn { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-1); border: 0; background: transparent; color: var(--primary-text);
  font: inherit; font-size: var(--fs-xs); font-weight: var(--fw-semibold); cursor: pointer; min-height: 2rem; padding: 0 var(--space-1); border-radius: var(--radius-control); }
.ac-linkbtn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ac-plot { position: relative; width: 100%; overflow: hidden; border-radius: var(--radius-control); }
.ac-plot:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.ac-plot svg { display: block; }
.ac-grid { stroke: var(--border-subtle); stroke-width: 1; }
.ac-axis { fill: var(--text-muted); font-size: 11px; font-variant-numeric: tabular-nums; }
.ac-crosshair { stroke: var(--border-strong); stroke-width: 1; stroke-dasharray: 3 3; }
.ac-dot { stroke: var(--surface); stroke-width: 2; }
.ac-tip { position: absolute; top: var(--space-2); min-width: 10rem; max-width: 14rem; padding: var(--space-2) var(--space-3); pointer-events: none; z-index: 2;
  background: var(--surface-raised); border: 1px solid var(--border-default); border-radius: var(--radius-control); box-shadow: var(--shadow-1); }
.ac-tip-title { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--text-primary); margin-bottom: var(--space-1); }
.ac-tip-row { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-secondary); }
.ac-tip-row b { margin-left: auto; color: var(--text-primary); font-variant-numeric: tabular-nums; }

.ac-barlist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.ac-barlist-head { display: flex; justify-content: space-between; gap: var(--space-3); font-size: var(--fs-sm); color: var(--text-secondary); }
.ac-barlist-head b { color: var(--text-primary); font-variant-numeric: tabular-nums; font-weight: var(--fw-semibold); }
.ac-barlist-track { height: 0.5rem; margin-top: var(--space-1); border-radius: 4px; background: var(--surface-sunken); overflow: hidden; }
.ac-barlist-track span { display: block; height: 100%; border-radius: 0 4px 4px 0; }

/* tables */
/* position: relative contains .sr-only (absolute) cells, which would otherwise escape the scroller and widen the mobile layout viewport. */
.ac-table-wrap { position: relative; overflow-x: auto; }
.ac-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.ac-table th, .ac-table td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border-subtle); white-space: nowrap; vertical-align: middle; }
.ac-table thead th { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--text-muted); background: var(--surface-sunken); }
.ac-table tbody th { font-weight: var(--fw-medium); }
.ac-table tr:last-child > * { border-bottom: 0; }
.ac-table td.ac-wrap { white-space: normal; min-width: 12rem; }
.ac-table code { font-size: var(--fs-xs); }
.ac-actions { text-align: right; }
.ac-you { margin-left: var(--space-2); }
.ac-reason { display: block; font-size: var(--fs-xs); color: var(--text-muted); }

/* health */
.ac-status { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--fs-xs); font-weight: var(--fw-semibold); padding: 2px var(--space-2); border-radius: var(--radius-pill); border: 1px solid; }
.ac-status--healthy { color: var(--success); background: var(--success-soft); border-color: var(--success-border); }
.ac-status--degraded { color: var(--warning); background: var(--warning-soft); border-color: var(--warning-border); }
.ac-status--down { color: var(--danger); background: var(--danger-soft); border-color: var(--danger-border); }
.ac-status--unavailable { color: var(--text-muted); background: var(--surface-sunken); border-color: var(--border-subtle); }
.ac-failures { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); font-size: var(--fs-sm); }
.ac-failures li { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.ac-failures time { margin-left: auto; font-size: var(--fs-xs); color: var(--text-muted); }

.ac-invite { display: flex; align-items: flex-end; gap: var(--space-3); flex-wrap: wrap; }
.ac-invite .ui-field { flex: 1; min-width: 14rem; }
.ac-ack { margin-top: var(--space-3); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

@media (max-width: 1023px) {
  .ac-root { grid-template-columns: minmax(0, 1fr); grid-template-rows: auto auto 1fr; }
  .ac-nav { flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--border-subtle); padding: var(--space-2) var(--space-4); }
  .ac-grid-2 { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 479px) {
  .ac-topbar { padding: var(--space-2) var(--space-4); }
  .ac-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ac-metric-value { font-size: var(--fs-xl); line-height: var(--lh-xl); }
}
`
