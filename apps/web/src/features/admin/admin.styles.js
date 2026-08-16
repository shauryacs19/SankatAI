// Self-contained styles for the Admin Dashboard, using the existing SankatAI
// design tokens (red accent, light surfaces, subtle borders) with fallbacks.

export const ADMIN_CSS = `
.ac-root { max-width: 1600px; margin: 0 auto; min-height: 100vh; background: var(--bg-body, #F8FAFC); color: var(--text-primary, #0F172A); padding: 24px clamp(16px, 3vw, 32px) 60px; font-size: 14px; }
.ac-root * { box-sizing: border-box; }

/* topbar */
.ac-topbar { display: flex; align-items: center; gap: 16px; margin-bottom: 14px; flex-wrap: wrap; }
.ac-back { display: inline-flex; align-items: center; gap: 6px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); color: var(--text-secondary, #334155); font-weight: 600; font-size: 0.85rem; padding: 8px 12px; border-radius: 10px; cursor: pointer; }
.ac-back:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.ac-title { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
.ac-title-icon { width: 40px; height: 40px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.ac-title h1 { margin: 0; font-size: 1.3rem; font-weight: 800; letter-spacing: -0.01em; }
.ac-title p { margin: 2px 0 0; font-size: 0.82rem; color: var(--text-muted, #64748B); }
.ac-topbar-right { display: flex; gap: 8px; }
.ac-refresh { display: inline-flex; align-items: center; gap: 6px; background: var(--primary, #C4504B); color: #fff; border: none; font-weight: 700; font-size: 0.85rem; padding: 9px 14px; border-radius: 10px; cursor: pointer; box-shadow: 0 2px 8px rgba(196, 80, 75,0.2); }
.ac-refresh:hover:not(:disabled) { background: var(--primary-hover, #A93F3B); }
.ac-refresh:disabled { opacity: 0.6; cursor: not-allowed; }
.ac-spin { animation: ac-rotate 0.8s linear infinite; }
@keyframes ac-rotate { 100% { transform: rotate(360deg); } }

/* dev banner */
.ac-devbanner { display: flex; align-items: flex-start; gap: 8px; background: var(--sev-high-soft, #FFF7ED); border: 1px solid var(--sev-high-border, #FED7AA); color: var(--sev-high, #C2410C); padding: 10px 14px; border-radius: 12px; font-size: 0.82rem; line-height: 1.5; margin-bottom: 16px; }
.ac-devbanner svg { flex-shrink: 0; margin-top: 1px; }

/* period selector */
.ac-periodrow { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; flex-wrap: wrap; }
.ac-period-label { font-size: 0.8rem; font-weight: 600; color: var(--text-muted, #64748B); }
.ac-period-tabs { display: inline-flex; background: var(--surface-2, #F1F5F9); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; padding: 3px; gap: 2px; flex-wrap: wrap; }
.ac-period-tab { border: none; background: transparent; color: var(--text-secondary, #334155); font-weight: 600; font-size: 0.82rem; padding: 7px 13px; border-radius: 9px; cursor: pointer; }
.ac-period-tab:hover { color: var(--primary, #C4504B); }
.ac-period-tab.active { background: var(--bg-surface, #fff); color: var(--primary, #C4504B); box-shadow: 0 1px 3px rgba(16,24,40,0.08); }

.ac-error { display: flex; align-items: center; gap: 8px; background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); color: var(--primary, #C4504B); padding: 12px 14px; border-radius: 12px; margin-bottom: 16px; }

/* content transitions */
.ac-content { display: flex; flex-direction: column; gap: 16px; transition: opacity 0.15s; }
.ac-dim { opacity: 0.6; }
.ac-loading { display: flex; align-items: center; justify-content: center; gap: 12px; padding: 80px 20px; color: var(--text-muted, #64748B); font-weight: 600; }
.ac-spinner { width: 22px; height: 22px; border-radius: 50%; border: 3px solid var(--border-subtle, #E5E7EB); border-top-color: var(--primary, #C4504B); animation: ac-rotate 0.8s linear infinite; }

/* cards */
.ac-card { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.ac-panel { padding: 16px; }
.ac-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.ac-panel-head h3 { margin: 0; font-size: 0.92rem; font-weight: 700; }

/* metric cards grid */
.ac-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(178px, 1fr)); gap: 12px; }
.ac-metric { padding: 14px 16px; }
.ac-metric-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ac-metric-label { font-size: 0.78rem; color: var(--text-muted, #64748B); font-weight: 600; }
.ac-metric-icon { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); flex-shrink: 0; }
.ac-metric-value { font-size: 1.45rem; font-weight: 800; letter-spacing: -0.02em; margin: 8px 0 4px; }
.ac-metric-change { display: inline-flex; align-items: center; gap: 3px; font-size: 0.76rem; font-weight: 700; }
.ac-metric-change.up { color: var(--success, #059669); }
.ac-metric-change.down { color: var(--primary, #C4504B); }
.ac-metric-change.flat { color: var(--text-muted, #94A3B8); }

/* charts */
.ac-svg { display: block; width: 100%; height: auto; }
.ac-axis { fill: var(--text-muted, #94A3B8); font-size: 12px; }
.ac-donut-center { fill: var(--text-primary, #0F172A); font-size: 18px; font-weight: 800; }
.ac-donut-sub { fill: var(--text-muted, #94A3B8); font-size: 10px; }
.ac-chart-label { font-size: 0.76rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #94A3B8); margin: 14px 0 8px; }

/* legend */
.ac-legend { display: flex; gap: 14px; flex-wrap: wrap; }
.ac-legend-item { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; color: var(--text-secondary, #334155); }
.ac-legend-item i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

/* sub-stats */
.ac-substats { display: flex; flex-wrap: wrap; gap: 10px 22px; margin-top: 14px; padding-top: 14px; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.ac-substats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
.ac-substat { display: flex; flex-direction: column; gap: 2px; }
.ac-substat span { font-size: 0.74rem; color: var(--text-muted, #64748B); }
.ac-substat b { font-size: 1.05rem; font-weight: 700; }
.ac-danger-text { color: var(--primary, #C4504B); }
.ac-ok-text { color: var(--success, #059669); }

/* analytics grids */
.ac-grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; align-items: start; }
.ac-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }

/* severity */
.ac-severity { display: flex; align-items: center; gap: 22px; flex-wrap: wrap; }
.ac-severity-legend { display: flex; flex-direction: column; gap: 7px; flex: 1; min-width: 128px; }
.ac-severity-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.ac-severity-row b { font-size: 0.9rem; }

/* system health */
.ac-health-list { display: flex; flex-direction: column; gap: 2px; }
.ac-health-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid var(--border-subtle, #E5E7EB); }
.ac-health-row:last-child { border-bottom: none; }
.ac-health-name { font-size: 0.88rem; font-weight: 600; }
.ac-health-status { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8rem; font-weight: 700; }
.ac-health-status.ok { color: var(--success, #059669); }
.ac-health-status.warn { color: var(--sev-high, #EA580C); }
.ac-health-status.down { color: var(--primary, #C4504B); }
.ac-mock-pill { font-size: 0.68rem; font-weight: 700; color: var(--sev-high, #C2410C); background: var(--sev-high-soft, #FFF7ED); border: 1px solid var(--sev-high-border, #FED7AA); padding: 3px 8px; border-radius: 99px; }

/* recent activity table */
.ac-table-wrap { overflow-x: auto; }
.ac-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
.ac-table th { text-align: left; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #94A3B8); font-weight: 700; padding: 8px 10px; border-bottom: 1px solid var(--border-subtle, #E5E7EB); }
.ac-table td { padding: 10px; border-bottom: 1px solid var(--border-subtle, #F1F5F9); white-space: nowrap; }
.ac-table tr:last-child td { border-bottom: none; }
.ac-t-time { color: var(--text-muted, #64748B); }
.ac-cat { font-size: 0.76rem; font-weight: 600; color: var(--text-secondary, #334155); background: var(--surface-2, #F1F5F9); padding: 3px 9px; border-radius: 99px; }
.ac-status { font-size: 0.74rem; font-weight: 700; padding: 3px 9px; border-radius: 99px; }
.ac-status.ok { color: var(--success, #059669); background: var(--success-soft, #D1FAE5); }
.ac-status.alert { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.ac-status.warn { color: var(--sev-high, #C2410C); background: var(--sev-high-soft, #FFF7ED); }

/* recent activity — compact list (fits a narrow column) */
.ac-activity { display: flex; flex-direction: column; gap: 2px; max-height: 300px; overflow-y: auto; }
.ac-activity-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle, #F1F5F9); }
.ac-activity-row:last-child { border-bottom: none; }
.ac-activity-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.ac-activity-event { font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ac-activity-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
.ac-activity-time { font-size: 0.72rem; color: var(--text-muted, #94A3B8); white-space: nowrap; }

/* top statistics */
.ac-topstats { display: grid; grid-template-columns: repeat(auto-fit, minmax(94px, 1fr)); gap: 8px; }
.ac-topstat { display: flex; flex-direction: column; gap: 2px; padding: 9px 10px; background: var(--surface-2, #F8FAFC); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 10px; }
.ac-topstat-value { font-size: 1.02rem; font-weight: 800; letter-spacing: -0.01em; }
.ac-topstat-label { font-size: 0.68rem; color: var(--text-muted, #64748B); line-height: 1.25; }

/* responsive */
@media (max-width: 1200px) {
  .ac-grid-4 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .ac-grid-2 { grid-template-columns: 1fr; }
}
@media (max-width: 640px) {
  .ac-grid-4 { grid-template-columns: 1fr; }
  .ac-title h1 { font-size: 1.1rem; }
  .ac-metric-value { font-size: 1.4rem; }
  .ac-period-tabs { width: 100%; }
  .ac-period-tab { flex: 1; text-align: center; }
}
`
