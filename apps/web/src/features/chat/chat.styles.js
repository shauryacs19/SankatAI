// Chat surface. Tokens only.
export const CHAT_CSS = `
.chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }
.chat-thread { width: 100%; max-width: 46rem; margin: 0 auto; padding: var(--space-8) var(--space-6) var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }

/* ----- empty state ----- */
/* No entrance motion: it carries a call-108 link (emergency actions never animate in). */
.chat-empty { display: flex; flex-direction: column; gap: var(--space-3); padding-top: var(--space-8); }
.chat-empty-mark { display: grid; place-items: center; width: 3rem; height: 3rem; margin-bottom: var(--space-2); border-radius: var(--radius-card); background: var(--primary); color: var(--on-primary); }
.chat-empty-hello { font-size: var(--fs-lg); line-height: var(--lh-lg); color: var(--text-secondary); }
.chat-empty h2 { font-size: clamp(1.625rem, 1.3rem + 1vw, 2rem); line-height: 1.2; letter-spacing: -0.025em; }
.chat-empty-lead { max-width: 38rem; font-size: var(--fs-md); line-height: 1.65; color: var(--text-secondary); }
.chat-empty-label { margin-top: var(--space-5); font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }
.chat-examples { display: flex; flex-direction: column; list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: hidden; }
.chat-examples li + li { border-top: 1px solid var(--border-subtle); }
.chat-example {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); width: 100%; min-height: 3.5rem; padding: var(--space-3) var(--space-5);
  border: 0; background: transparent; font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); text-align: left;
  transition: background-color var(--dur-fast) var(--ease-standard);
}
.chat-example > svg { color: var(--primary); flex-shrink: 0; transition: transform var(--dur-fast) var(--ease-standard); }
.chat-example-icon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }
.chat-example-text { flex: 1; min-width: 0; font-weight: var(--fw-medium); }
.chat-example:disabled { cursor: progress; opacity: 0.6; }
.chat-example:hover:not(:disabled) { background: var(--surface-hover); }
.chat-example:hover:not(:disabled) > svg { transform: translateX(2px); }
.chat-example:focus-visible { outline-offset: -2px; }
.chat-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-2); }

/* ----- user message: a quiet sage bubble ----- */
.msg-user { align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); max-width: min(85%, 36rem); }
.msg-user-row { display: flex; align-items: flex-start; gap: var(--space-1); }
.msg-bubble {
  padding: var(--space-3) var(--space-5); border-radius: 1.25rem 1.25rem 0.375rem 1.25rem;
  background: var(--user-bubble); color: var(--text-primary); font-size: var(--fs-md); line-height: 1.6;
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.msg-meta { display: inline-flex; align-items: center; gap: var(--space-1); padding-right: var(--space-1); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.msg-meta--failed { color: var(--danger); font-weight: var(--fw-medium); }
.msg-options { opacity: 1; }
@media (hover: hover) and (pointer: fine) {
  .msg-options { opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); }
  .msg-user:hover .msg-options, .msg-user:focus-within .msg-options { opacity: 1; }
}
.msg-atts { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: flex-end; }
.msg-att-img { padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: hidden; background: var(--surface); }
.msg-att-img img { max-width: min(18rem, 60vw); max-height: 20rem; object-fit: contain; }
.msg-att-doc {
  display: inline-flex; align-items: center; gap: var(--space-2); max-width: 16rem; min-height: var(--touch); padding: 0 var(--space-4);
  border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface); color: var(--text-primary); font-size: var(--fs-sm);
}
.msg-att-doc svg { color: var(--primary); }
.msg-att-doc span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ----- SankatAI reply: a clean white reading surface ----- */
.msg-ai {
  display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-6);
  background: var(--surface); border: 1px solid var(--border-subtle); border-radius: 1.25rem;
}
/* Severity is carried by the badge (icon + word); only an emergency changes the frame. */
.msg-ai--emergency { border-color: var(--sev-emergency-border); box-shadow: inset 0 3px 0 var(--sev-emergency); }
/* Offline fallback: visibly NOT an AI answer. */
.msg-ai--offline { border-style: dashed; border-color: var(--warning-border); background: var(--surface); }
.msg-ai-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.msg-ai-who { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.msg-ai-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); flex-shrink: 0; }
.msg-ai--offline .msg-ai-mark { background: var(--warning-soft); color: var(--warning); }
.msg-ai-name { font-size: var(--fs-md); line-height: var(--lh-sm); font-weight: var(--fw-semibold); }
.msg-ai-time { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.msg-ai-head .ui-sev { margin-left: auto; }
.msg-ai-body { font-size: var(--fs-md); line-height: 1.7; color: var(--text-primary); overflow-wrap: anywhere; }

/* rich reply text */
.rt { display: flex; flex-direction: column; gap: var(--space-3); }
.rt p { white-space: pre-line; }
.rt strong { font-weight: var(--fw-semibold); }
.rt ul, .rt ol { margin: 0; padding-left: var(--space-6); display: flex; flex-direction: column; gap: var(--space-2); }
.rt li { padding-left: var(--space-1); }
.rt li::marker { color: var(--primary); font-weight: var(--fw-semibold); }
.rt-h { font-weight: var(--fw-semibold); color: var(--text-primary); }
.rt-h + ul, .rt-h + ol { margin-top: calc(-1 * var(--space-1)); }

.msg-ai-call { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3) var(--space-4); padding: var(--space-4) var(--space-5); border-radius: var(--radius-card); background: var(--sev-emergency-soft); border: 1px solid var(--sev-emergency-border); }
.msg-ai-call p { flex: 1 1 16rem; font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); color: var(--sev-emergency-ink); }
.msg-ai-disclaimer { display: flex; gap: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.msg-ai-disclaimer svg { margin-top: 0.1875rem; flex-shrink: 0; }
.msg-ai-translated { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); font-style: italic; }
.msg-ai-foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.msg-ai-foot-label { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); margin-right: var(--space-1); }
.msg-ai-foot .ui-btn[aria-pressed="true"] { background: var(--primary-soft); color: var(--primary-text); border-color: var(--primary-border); }
.msg-ai-fb { display: flex; gap: var(--space-1); }
.msg-ai-share { margin-left: auto; }

/* ----- error row (a failed send — not an AI message) ----- */
.msg-error {
  display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4) var(--space-5);
  border: 1px solid var(--danger-border); border-radius: var(--radius-card); background: var(--danger-soft);
}
.msg-error > svg { color: var(--danger); margin-top: 0.25rem; }
.msg-error-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.msg-error-title { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); }
.msg-error-desc { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.msg-error-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }

/* ----- thinking ----- */
.msg-thinking { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) 0; font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); animation: sk-rise 200ms var(--ease-enter) both; }
.msg-dots { display: inline-flex; gap: var(--space-1); }
.msg-dots span { width: 0.375rem; height: 0.375rem; border-radius: var(--radius-pill); background: var(--primary); animation: msg-dot 1.4s var(--ease-standard) infinite; }
.msg-dots span:nth-child(2) { animation-delay: 0.2s; } .msg-dots span:nth-child(3) { animation-delay: 0.4s; }
@keyframes msg-dot { 0%, 70%, 100% { opacity: 0.25; } 35% { opacity: 1; } }

/* ----- composer ----- */
.composer-wrap { flex-shrink: 0; background: var(--bg); padding: var(--space-2) var(--space-6) var(--space-4); }
.composer-inner { max-width: 46rem; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-2); }
.composer {
  display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-3) var(--space-3) var(--space-2) var(--space-3);
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 1.25rem; box-shadow: var(--shadow-lift);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.composer:focus-within { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary), 0 0 0 5px var(--focus-halo); }
/* The input's ring is the container's; buttons inside keep their own. */
.composer-input {
  width: 100%; min-height: 3rem; max-height: 13rem; padding: var(--space-2) var(--space-2) var(--space-1); border: 0; background: transparent; resize: none;
  font-size: var(--fs-md); line-height: 1.6; color: var(--text-primary); overflow-y: auto;
}
.composer-input:focus-visible { outline: none; }
.composer-actions { display: flex; align-items: center; gap: var(--space-1); }
.composer-actions .ui-btn--ghost { color: var(--text-secondary); padding: 0 var(--space-3); }
.composer-send { margin-left: auto; padding: 0 var(--space-5); }
.composer-note { display: flex; justify-content: center; gap: var(--space-2); padding: 0 var(--space-1); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); text-align: center; }
.composer-note svg { margin-top: 0.1875rem; flex-shrink: 0; }
.att-tray { display: flex; gap: var(--space-2); overflow-x: auto; padding: var(--space-1) 0; }
.att-card {
  position: relative; flex-shrink: 0; width: 8.5rem; display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface);
}
.att-card--failed { border-color: var(--danger-border); background: var(--danger-soft); }
.att-thumb { height: 5rem; border-radius: var(--radius-control); background: var(--surface-sunken); display: grid; place-items: center; color: var(--text-muted); overflow: hidden; }
.att-thumb img { width: 100%; height: 100%; object-fit: cover; }
.att-name { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.att-status { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.att-status--err { color: var(--danger); font-weight: var(--fw-medium); }
.att-remove { position: absolute; top: var(--space-1); right: var(--space-1); }
.att-remove .ui-iconbtn { background: var(--surface-raised); border-color: var(--border-default); width: 2rem; height: 2rem; }
@media (pointer: coarse) { .att-remove .ui-iconbtn { width: 2.5rem; height: 2.5rem; } }

/* ----- analysis drawer ----- */
.an { display: flex; flex-direction: column; gap: var(--space-6); }
.an-section { display: flex; flex-direction: column; gap: var(--space-2); }
.an-section h3 { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }
.an-section p { font-size: var(--fs-md); line-height: 1.65; }
.an-meter { height: 0.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.an-meter span { display: block; height: 100%; width: 100%; transform-origin: left center; background: var(--text-muted); }
.an-meter .sev-low { background: var(--sev-low); } .an-meter .sev-moderate { background: var(--sev-moderate); }
.an-meter .sev-high { background: var(--sev-high); } .an-meter .sev-emergency { background: var(--sev-emergency); }
.an-risk { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.an-score { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
.an-score small { font-size: var(--fs-sm); color: var(--text-muted); font-weight: var(--fw-regular); }
.an-actions { display: flex; flex-direction: column; gap: var(--space-2); }

@media (prefers-reduced-motion: reduce) { .msg-thinking { animation: none; } .msg-dots span { animation: none; opacity: 0.6; } }

@media (max-width: 767px) {
  .chat-thread { padding: var(--space-5) var(--space-4); gap: var(--space-5); }
  .chat-empty { padding-top: var(--space-2); }
  .composer-wrap { padding: var(--space-2) var(--space-3) var(--space-2); }
  .msg-user { max-width: 90%; }
  .msg-ai { padding: var(--space-5) var(--space-4); }
  .composer-note { justify-content: flex-start; text-align: left; }
}
/* Phones: one compact row (attach, text, voice, send) so the conversation keeps the room. */
@media (max-width: 479px) {
  .composer { flex-direction: row; align-items: flex-end; gap: 0; padding: var(--space-1); border-radius: 1.5rem; }
  .composer-actions { display: contents; }
  .composer-actions > .ui-menu-anchor { order: -1; }
  .composer-input { flex: 1; min-width: 0; min-height: var(--touch); padding: 0.625rem var(--space-1); }
  .composer-actions .ui-btn-text {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  .composer-actions .ui-btn { width: var(--touch); min-height: var(--touch); padding: 0; flex-shrink: 0; }
  .composer-send { margin-left: var(--space-1); }
  .msg-ai-call .ui-btn { width: 100%; }
}
`
