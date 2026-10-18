// Product showcase (home page): device frames, hero composition, tour rows.
// Tokens only. Floating chips are the only looping motion; reduced motion stops it.
export const SHOWCASE_CSS = `
.sc-img { display: block; width: 100%; height: auto; }
.sc-img--dark { display: none; }
:root[data-theme="dark"] .sc-img--light { display: none; }
:root[data-theme="dark"] .sc-img--dark { display: block; }

/* ----- frames ----- */
.sc-browser { position: relative; overflow: hidden; border-radius: var(--radius-card); border: 1px solid var(--border-default); background: var(--surface); box-shadow: var(--shadow-device); }
.sc-browser-bar { display: flex; align-items: center; gap: var(--space-3); height: 2.25rem; padding: 0 var(--space-3); background: var(--surface-sunken); border-bottom: 1px solid var(--border-subtle); }
.sc-dots { display: inline-flex; gap: 0.375rem; flex-shrink: 0; }
.sc-dots span { width: 0.625rem; height: 0.625rem; border-radius: var(--radius-pill); background: var(--border-default); }
.sc-url { flex: 1; max-width: 20rem; margin: 0 auto; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 var(--space-3); border-radius: var(--radius-pill); background: var(--surface); font-size: var(--fs-xs); line-height: 1.5rem; color: var(--text-muted); text-align: center; }
.sc-phone { padding: 0.625rem; border-radius: 2.5rem; background: var(--device-bezel); box-shadow: var(--shadow-device); }
.sc-phone-screen { overflow: hidden; border-radius: 1.9rem; background: var(--bg); }

/* ----- hero composition ----- */
.sc-stage { position: relative; isolation: isolate; width: 100%; max-width: 64rem; margin: var(--space-16) auto 0; padding: 0 0 var(--space-2); }
.sc-stage::before { content: ""; position: absolute; z-index: -1; inset: 14% -3% 3.5rem -3%; border-radius: 2rem; background: var(--surface-tint); border: 1px solid var(--primary-border); }
.sc-stage-browser { width: 86%; }
.sc-stage-phone { position: absolute; right: 0; bottom: 3rem; width: 23%; min-width: 9rem; }
.sc-chips { position: absolute; inset: 0; pointer-events: none; }
.sc-chip {
  position: absolute; display: inline-flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2);
  border-radius: var(--radius-pill); background: var(--surface); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-2);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-primary); white-space: nowrap;
  animation: sc-float 7s ease-in-out infinite;
}
.sc-chip--a { top: 9%; left: -4%; }
.sc-chip--b { top: 2%; right: 4%; padding-left: var(--space-4); animation-delay: -2.4s; }
.sc-chip--c { bottom: 22%; left: 3%; animation-delay: -4.6s; }
.sc-chip-icon { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }
.sc-chip-icon--sos { background: var(--sev-emergency-soft); color: var(--sev-emergency-ink); }
.sc-scale { display: inline-flex; gap: var(--space-1); }
.sc-scale i { display: block; width: 0.75rem; height: 0.75rem; border-radius: 0.25rem; }
.sc-scale .sev-low { background: var(--sev-low); } .sc-scale .sev-moderate { background: var(--sev-moderate); }
.sc-scale .sev-high { background: var(--sev-high); } .sc-scale .sev-emergency { background: var(--sev-emergency); }
@keyframes sc-float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
.sc-caption { margin-top: var(--space-6); text-align: center; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }

/* ----- guided tour ----- */
.sc-tour { display: flex; flex-direction: column; gap: 8rem; max-width: var(--content-page); margin: 0 auto; padding: var(--space-24) var(--space-8); }
.sc-row { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: var(--space-16); align-items: center; scroll-margin-top: 5rem; }
.sc-row--reverse .sc-row-text { order: 2; }
.sc-row-text h2 { margin-top: var(--space-3); font-size: clamp(1.75rem, 1.35rem + 1.3vw, 2.25rem); line-height: 1.18; font-weight: var(--fw-semibold); letter-spacing: -0.025em; }
.sc-row-lead { margin-top: var(--space-4); font-size: var(--fs-lg); line-height: 1.6; color: var(--text-secondary); }
.sc-points { display: flex; flex-direction: column; gap: var(--space-3); margin: var(--space-6) 0 0; padding: 0; list-style: none; }
.sc-points li { display: flex; align-items: flex-start; gap: var(--space-3); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); }
.sc-point-icon { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; flex-shrink: 0; margin-top: 0.125rem; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }
.sc-row-visual { min-width: 0; }

/* symptom check: a short conversation that plays once */
.sc-demo { max-width: 34rem; margin-left: auto; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); border-radius: 1.5rem; background: var(--surface); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-device); }
.sc-demo-head { display: flex; align-items: center; gap: var(--space-3); padding-bottom: var(--space-3); border-bottom: 1px solid var(--border-subtle); font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }
.sc-demo-head .ui-brand-mark { width: 1.75rem; height: 1.75rem; border-radius: var(--radius-pill); }
.sc-demo-user { align-self: flex-end; max-width: 85%; padding: var(--space-3) var(--space-4); border-radius: 1.125rem 1.125rem 0.375rem 1.125rem; background: var(--user-bubble); font-size: var(--fs-md); line-height: 1.5; }
.sc-demo-ai { align-self: flex-start; max-width: 92%; display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: 0.375rem 1.125rem 1.125rem 1.125rem; background: var(--bg); border: 1px solid var(--border-subtle); font-size: var(--fs-md); line-height: 1.55; }
.sc-demo-ai-h { font-weight: var(--fw-semibold); }
.sc-demo-ai ol { margin: 0; padding-left: var(--space-5); display: flex; flex-direction: column; gap: var(--space-1); }
.sc-demo-ai li::marker { color: var(--primary); font-weight: var(--fw-semibold); }
.sc-demo-compose { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-1); padding: var(--space-3) var(--space-4); border-radius: var(--radius-pill); border: 1px solid var(--border-strong); font-size: var(--fs-md); color: var(--text-muted); }

/* personal guidance: profile + analysis panel */
.sc-pair { position: relative; padding: 0 16% 12% 0; }
.sc-pair-panel { position: absolute; right: 0; bottom: 0; width: 34%; overflow: hidden; border-radius: 1.25rem; border: 1px solid var(--border-subtle); background: var(--surface); box-shadow: var(--shadow-device); }
.sc-float-tag { position: absolute; left: 6%; bottom: 3%; display: inline-flex; align-items: center; gap: var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-pill); background: var(--surface); border: 1px solid var(--border-subtle); box-shadow: var(--shadow-2); font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--text-primary); animation: sc-float 7s ease-in-out infinite -1.2s; }
.sc-float-tag svg { color: var(--primary); }

/* history + documents, overlapped */
.sc-stack { position: relative; padding: 0 12% 16% 0; }
.sc-stack-front { position: absolute; right: 0; bottom: 0; width: 76%; }

/* emergency: calm frame, the phone does the talking */
.sc-emergency { display: flex; justify-content: center; padding: var(--space-8) var(--space-6); border-radius: 2rem; background: var(--surface); border: 1px solid var(--border-subtle); }
.sc-emergency .sc-phone { width: min(17rem, 72%); }

@media (prefers-reduced-motion: reduce) { .sc-chip, .sc-float-tag { animation: none; } }

@media (max-width: 1023px) {
  .sc-tour { gap: 6rem; }
  .sc-row { grid-template-columns: minmax(0, 1fr); gap: var(--space-10); }
  .sc-row--reverse .sc-row-text { order: 0; }
  .sc-demo { margin: 0 auto; }
  .sc-chip--a { left: 0; }
}
@media (max-width: 767px) {
  .sc-stage { margin-top: var(--space-12); }
  .sc-stage-browser { width: 100%; }
  .sc-stage-phone { width: 34%; min-width: 0; right: -2%; bottom: 1.5rem; }
  .sc-stage::before { inset: 20% -4% 2rem -4%; border-radius: 1.5rem; }
  .sc-chips { display: none; }
  .sc-tour { padding: var(--space-16) var(--space-5); gap: 5rem; }
  .sc-row-lead { font-size: var(--fs-md); }
  .sc-phone { padding: 0.4rem; border-radius: 1.75rem; }
  .sc-phone-screen { border-radius: 1.4rem; }
  .sc-browser-bar { height: 1.75rem; }
  .sc-url { display: none; }
  .sc-float-tag { display: none; }
  .sc-emergency { padding: var(--space-6) var(--space-4); }
}
/* Phones: the phone screen alone, large enough to read. */
@media (max-width: 639px) {
  .sc-stage-browser { display: none; }
  .sc-stage-phone { position: relative; right: auto; bottom: auto; width: min(17rem, 72%); margin: 0 auto; }
  .sc-stage::before { inset: 18% -1rem 3rem -1rem; }
}
`
