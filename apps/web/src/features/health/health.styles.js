// Styles for the "My health" pages: timeline canvas, symptoms, lab reports, doctor report.
export const HEALTH_CSS = `
.hr-stack { display: flex; flex-direction: column; gap: var(--space-4); }
.hr-row { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.hr-muted { color: var(--text-muted); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.hr-note { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }

/* ----- symptoms ----- */
.hr-form { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4); }
.hr-form .hr-span { grid-column: 1 / -1; }
.hr-sev { display: flex; align-items: center; gap: var(--space-3); }
.hr-sev input[type="range"] { flex: 1; accent-color: var(--primary); min-height: var(--touch); }
.hr-sev-val { min-width: 3.5rem; font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
.hr-chart { width: 100%; height: auto; display: block; overflow: visible; }
.hr-chart .grid { stroke: var(--border-subtle); stroke-width: 1; }
.hr-chart .axis { fill: var(--text-muted); font-size: 11px; font-family: var(--font-sans); }
.hr-chart .line { fill: none; stroke: var(--primary); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.hr-chart .dot { fill: var(--primary); stroke: var(--surface); stroke-width: 2; }
.hr-chart .hit { fill: transparent; cursor: default; }
.hr-chart .hit:focus-visible + .dot, .hr-chart .hit:hover + .dot { r: 6; }
.hr-chart-wrap { position: relative; }
.hr-tip { position: absolute; transform: translate(-50%, calc(-100% - 10px)); background: var(--surface-raised); border: 1px solid var(--border-default); border-radius: var(--radius-control); box-shadow: var(--shadow-2); padding: var(--space-1) var(--space-2); font-size: var(--fs-xs); white-space: nowrap; pointer-events: none; color: var(--text-primary); }
.hr-entries { list-style: none; margin: 0; padding: 0; }
.hr-entry { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; }
.hr-entry + .hr-entry { border-top: 1px solid var(--border-subtle); }
.hr-entry-sev { font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; min-width: 3rem; }
.hr-entry-main { flex: 1; min-width: 0; font-size: var(--fs-sm); }
.hr-summary { background: var(--surface-sunken); border-radius: var(--radius-control); padding: var(--space-3); font-size: var(--fs-sm); line-height: var(--lh-sm); }

/* ----- lab reports ----- */
.hr-docs { list-style: none; margin: 0; padding: 0; }
.hr-doc { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.hr-doc + .hr-doc { border-top: 1px solid var(--border-subtle); }
.hr-doc-main { flex: 1; min-width: 0; }
.hr-doc-name { font-weight: var(--fw-medium); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hr-doc[aria-current="true"] .hr-doc-name { color: var(--primary-text); }
.hr-table-wrap { overflow-x: auto; }
.hr-table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); line-height: var(--lh-sm); }
.hr-table th { text-align: left; font-weight: var(--fw-semibold); color: var(--text-secondary); padding: var(--space-2); border-bottom: 1px solid var(--border-default); }
.hr-table td { padding: var(--space-2); border-bottom: 1px solid var(--border-subtle); vertical-align: top; }
.hr-table tr.is-abnormal td { background: var(--warning-soft); }
.hr-table .num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.hr-expl { color: var(--text-muted); font-size: var(--fs-xs); line-height: var(--lh-xs); margin-top: 2px; }

/* ----- timeline canvas (fills the content area) ----- */
.tl-page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.tl-wrap { position: relative; flex: 1; min-height: 0; display: flex; }
.tl-wrap > .ui-skel { flex: 1; border-radius: 0; }
.fc {
  position: relative; flex: 1; min-width: 0; overflow: hidden; cursor: grab; touch-action: none; user-select: none;
  background-color: var(--surface-sunken);
  background-image: radial-gradient(circle, var(--border-default) 1px, transparent 1.2px);
}
.fc:active { cursor: grabbing; }
.fc:focus-visible { outline: 2px solid var(--primary); outline-offset: -2px; }
.fc--empty { display: grid; place-items: center; cursor: default; }
.fc-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
.fc-week { position: absolute; border: 1px solid var(--border-subtle); border-radius: calc(var(--radius-card) + 6px); background: color-mix(in srgb, var(--surface) 55%, transparent); pointer-events: none; }
.fc-weekcheck { position: absolute; left: 14px; top: 12px; display: inline-flex; align-items: center; gap: 10px; padding: 4px 10px 4px 6px; border: 1px solid transparent; border-radius: var(--radius-control); background: transparent; color: var(--text-primary); cursor: pointer; pointer-events: auto; }
.fc-weekcheck:hover { background: var(--surface-hover); border-color: var(--border-subtle); }
.fc-week-title { font-size: var(--fs-sm); font-weight: var(--fw-semibold); white-space: nowrap; }
.fc-week-count { font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--primary-text); background: var(--primary-soft); border-radius: var(--radius-pill); padding: 1px 8px; }
.fc-check { cursor: pointer; }
.fc-box { display: grid; place-items: center; width: 18px; height: 18px; flex-shrink: 0; border: 1.5px solid var(--border-strong); border-radius: 5px; background: var(--surface); color: var(--on-primary); }
.fc-check[aria-checked="true"] .fc-box, .fc-check[aria-checked="mixed"] .fc-box { background: var(--primary); border-color: var(--primary); }
.fc-cardcheck { margin-left: auto; flex-shrink: 0; display: grid; place-items: center; width: 28px; height: 28px; margin-top: -4px; margin-right: -6px; padding: 0; border: 0; border-radius: var(--radius-control); background: transparent; }
.fc-cardcheck:hover { background: var(--surface-hover); }
.fc-node.is-picked { border-color: var(--primary); background: color-mix(in srgb, var(--primary-soft) 45%, var(--surface)); }
.fc-selbar { position: absolute; left: 50%; bottom: var(--space-4); transform: translateX(-50%); z-index: 2; display: flex; align-items: center; gap: var(--space-2); max-width: calc(100% - 9rem); padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4); background: var(--surface); border: 1px solid var(--border-default); border-radius: var(--radius-pill); box-shadow: var(--shadow-2); cursor: default; }
.fc-selbar-text { font-size: var(--fs-sm); color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.fc-day { position: absolute; display: block; font-size: var(--fs-xs); font-weight: var(--fw-semibold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-secondary); white-space: nowrap; }
.fc-day--empty { color: var(--text-muted); opacity: 0.55; font-weight: var(--fw-medium); }
.fc-wires { position: absolute; overflow: visible; pointer-events: none; max-width: none; max-height: none; }
.fc-wire { fill: none; stroke: var(--border-strong); stroke-width: 1.5; }
.fc-arrowhead { fill: var(--border-strong); }
.fc-port { fill: var(--surface); stroke: var(--border-strong); stroke-width: 1.5; }
.fc-now { position: absolute; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border: 1px solid var(--border-default); border-radius: var(--radius-pill); background: var(--surface); font-size: var(--fs-xs); font-weight: var(--fw-semibold); letter-spacing: 0.04em; color: var(--text-secondary); }
.fc-now-dot { width: 7px; height: 7px; border-radius: 50%; border: 1.5px solid var(--text-secondary); }

.fc-node {
  position: absolute; display: flex; flex-direction: column; border: 1px solid var(--border-default); border-radius: var(--radius-card);
  background: var(--surface); box-shadow: var(--shadow-0); cursor: pointer; overflow: hidden;
  transition: box-shadow var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.fc-node:hover { border-color: var(--border-strong); box-shadow: var(--shadow-1); }
.fc-node.is-selected { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft), var(--shadow-1); }
.fc-node-head { display: flex; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-2); }
.fc-node-ic { flex-shrink: 0; display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: var(--radius-control); background: var(--text-primary); color: var(--surface); }
.fc-node--report .fc-node-ic, .fc-node-ic--report { background: var(--surface-sunken); color: var(--text-primary); border: 1px solid var(--border-default); }
.fc-node--symptom .fc-node-ic, .fc-node-ic--symptom { background: var(--warning-soft); color: var(--text-primary); border: 1px solid var(--warning-border); }
.fc-node--medication .fc-node-ic, .fc-node-ic--medication { background: var(--success-soft); color: var(--text-primary); border: 1px solid var(--success-border); }
.fc-node-titles { display: flex; flex-direction: column; min-width: 0; }
.fc-node-kind { font-size: 0.6875rem; line-height: 1rem; font-weight: var(--fw-semibold); letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin: 0; }
.fc-node-title { padding: 0; border: 0; background: none; color: var(--text-primary); text-align: left; font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; cursor: inherit; }
.fc-node-rows { flex: 1; display: grid; align-content: start; gap: 2px; margin: 0; padding: 0 var(--space-3) var(--space-2); font-size: var(--fs-xs); line-height: var(--lh-xs); }
.fc-node-rows > div { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr); align-items: center; }
.fc-node-rows dt { color: var(--text-muted); }
.fc-node-rows dd { margin: 0; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fc-node-rows .ui-sev { font-size: var(--fs-xs); }
.fc-node-foot { display: flex; justify-content: flex-end; padding: var(--space-1) var(--space-2); border-top: 1px solid var(--border-subtle); background: var(--surface-sunken); }
.fc-node-action { display: inline-flex; align-items: center; gap: 2px; padding: 2px var(--space-1); border: 0; border-radius: var(--radius-control); background: none; color: var(--text-primary); font-size: var(--fs-xs); font-weight: var(--fw-semibold); cursor: pointer; }
.fc-node-action:hover { background: var(--surface-hover); }

.fc-filters { position: absolute; top: var(--space-3); left: var(--space-3); z-index: 2; }
.fc-chips { display: flex; gap: var(--space-1); flex-wrap: wrap; padding: var(--space-1); background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-pill); box-shadow: var(--shadow-1); }
.fc-chip { display: inline-flex; align-items: center; gap: 6px; height: 2rem; padding: 0 var(--space-3); border: 1px solid transparent; border-radius: var(--radius-pill); background: transparent; color: var(--text-muted); font-size: var(--fs-xs); font-weight: var(--fw-semibold); cursor: pointer; }
.fc-chip[aria-pressed="true"] { background: var(--surface-sunken); border-color: var(--border-default); color: var(--text-primary); }
.fc-chip[aria-pressed="false"] { text-decoration: line-through; }
.fc-tools { position: absolute; left: var(--space-3); bottom: var(--space-3); z-index: 2; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--border-default); border-radius: var(--radius-control); box-shadow: var(--shadow-1); overflow: hidden; }
.fc-tools .ui-iconbtn { border-radius: 0; }
.fc-tools > * + * { border-top: 1px solid var(--border-subtle); }
.fc-zoomlabel { position: absolute; left: calc(var(--space-3) + 3.25rem); bottom: var(--space-3); z-index: 2; font-size: var(--fs-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }

.fc-panel { position: absolute; top: var(--space-3); right: var(--space-3); z-index: 3; width: min(22rem, calc(100% - 2 * var(--space-3))); max-height: calc(100% - 2 * var(--space-3)); overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); background: var(--surface); border: 1px solid var(--border-default); border-radius: var(--radius-card); box-shadow: var(--shadow-2); }
.fc-panel-close { position: absolute; top: var(--space-2); right: var(--space-2); }
.fc-panel-head { display: flex; gap: var(--space-3); align-items: flex-start; padding-right: var(--space-8); }
.fc-panel-title { margin: 0; font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); }
.fc-panel-rows { display: grid; gap: var(--space-2); margin: 0; font-size: var(--fs-sm); line-height: var(--lh-sm); }
.fc-panel-rows > div { display: grid; grid-template-columns: 5.5rem minmax(0, 1fr); gap: var(--space-2); }
.fc-panel-rows dt { color: var(--text-muted); }
.fc-panel-rows dd { margin: 0; overflow-wrap: anywhere; }

@media (max-width: 767px) {
  .hr-form { grid-template-columns: 1fr; }
  .fc-panel { top: auto; bottom: var(--space-3); left: var(--space-3); right: var(--space-3); width: auto; max-height: 55%; }
  .fc-chips { border-radius: var(--radius-card); }
  .fc-selbar { left: calc(var(--space-3) + 3.5rem); right: var(--space-3); bottom: var(--space-3); transform: none; max-width: none; border-radius: var(--radius-card); flex-wrap: wrap; }
}
`
