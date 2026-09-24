// Listening popup. Sits on the shared .ui-scrim / .ui-modal (centered; a
// bottom sheet below 480px). Ripple rings animate only while `.speaking`; the
// mic scales with --level, which useAudioLevel writes from rAF.
export const VOICE_POPUP_CSS = `
.vp-panel { position: relative; display: flex; flex-direction: column; align-items: center; gap: var(--space-3); padding: var(--space-8) var(--space-6) var(--space-6); text-align: center; }
.vp-close { position: absolute; top: var(--space-2); right: var(--space-2); }
.vp-mic-wrap { --level: 0; position: relative; display: grid; place-items: center; width: 7.5rem; height: 7.5rem; margin: var(--space-2) 0; }
.vp-ring { position: absolute; inset: 1.5rem; border-radius: 50%; background: var(--primary); opacity: 0; pointer-events: none; }
.speaking .vp-ring { animation: vp-ripple 1.2s ease-out infinite; }
.speaking .vp-ring:nth-child(2) { animation-delay: 0.4s; }
.speaking .vp-ring:nth-child(3) { animation-delay: 0.8s; }
@keyframes vp-ripple {
  0% { opacity: 0.35; transform: scale(1); }
  100% { opacity: 0; transform: scale(calc(1.6 + var(--level) * 1.2)); }
}
.vp-mic {
  position: relative; display: grid; place-items: center; width: 4.5rem; height: 4.5rem; border-radius: 50%;
  background: var(--primary); color: var(--on-primary);
  transform: scale(calc(1 + var(--level) * 0.25)); transition: transform 80ms linear;
}
.vp-mic-wrap--error .vp-mic { background: var(--danger-soft); color: var(--danger); transform: none; }
.vp-status { margin: 0; font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); color: var(--text-primary); }
.vp-status--error { color: var(--danger); }
.vp-lang {
  margin-top: calc(-1 * var(--space-2)); padding: 0 var(--space-2); border-radius: var(--radius-pill);
  background: var(--primary-soft); color: var(--primary-text); font-size: var(--fs-xs); line-height: 1.5rem; font-weight: var(--fw-semibold);
}
.vp-hint { margin: 0; max-width: 22rem; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.vp-preview { margin: 0; min-height: 3rem; max-height: 8rem; overflow-y: auto; width: 100%; font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); overflow-wrap: anywhere; }
.vp-partial { color: var(--text-muted); }
.vp-stop {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
  min-height: var(--touch); min-width: 8rem; padding: 0 var(--space-5); margin-top: var(--space-2);
  border: 0; border-radius: var(--radius-pill); background: var(--danger); color: var(--on-danger);
  font-size: var(--fs-md); font-weight: var(--fw-semibold); cursor: pointer;
}
.vp-stop:hover:not(:disabled) { background: var(--danger-hover); }
.vp-stop:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.vp-stop:disabled { opacity: 0.55; cursor: default; }
@media (prefers-reduced-motion: reduce) {
  .vp-ring { animation: none !important; display: none; }
  .vp-mic { transform: none; transition: none; }
}
`
