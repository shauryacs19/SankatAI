// Chat surface. Tokens only.
export const CHAT_CSS = `
.chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
.chat-thread { width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }

/* ----- empty state ----- */
.chat-empty { display: flex; flex-direction: column; gap: var(--space-4); padding-top: var(--space-8); }
.chat-empty .ui-overline { margin-top: var(--space-2); }
.chat-empty h2 { font-size: var(--fs-2xl); line-height: var(--lh-2xl); letter-spacing: -0.01em; }
.chat-empty-lead { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); max-width: 36rem; }
.chat-empty-lead a { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 2px; }
.chat-examples { display: flex; flex-direction: column; gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.chat-example {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; min-height: var(--touch); padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface);
  font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); text-align: left;
  transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
}
.chat-example svg { color: var(--text-muted); }
.chat-example:hover { border-color: var(--border-strong); background: var(--surface-hover); }
.chat-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }

/* ----- user message ----- */
.msg-user { align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-1); max-width: min(80%, 34rem); }
.msg-user-row { display: flex; align-items: flex-start; gap: var(--space-1); }
.msg-bubble {
  padding: var(--space-3) var(--space-4); border-radius: var(--radius-card) var(--radius-card) var(--space-1) var(--radius-card);
  background: var(--surface-sunken); color: var(--text-primary); font-size: var(--fs-md); line-height: var(--lh-md);
  white-space: pre-wrap; overflow-wrap: anywhere;
}
.msg-meta { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
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
  display: inline-flex; align-items: center; gap: var(--space-2); max-width: 15rem; min-height: var(--touch); padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--surface); color: var(--text-primary); font-size: var(--fs-sm);
}
.msg-att-doc svg { color: var(--text-muted); }
.msg-att-doc span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ----- assistant card ----- */
.msg-ai {
  display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5);
  background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card);
}
.msg-ai--sev { border-left-width: 3px; }
.msg-ai--low { border-left-color: var(--sev-low); }
.msg-ai--moderate { border-left-color: var(--sev-moderate); }
.msg-ai--high { border-left-color: var(--sev-high); }
.msg-ai--emergency { border-color: var(--sev-emergency-border); border-left-color: var(--sev-emergency); }
/* Offline fallback: visibly NOT an AI answer. */
.msg-ai--offline { border-style: dashed; border-left-width: 1px; border-color: var(--warning-border); background: var(--surface); }
.msg-ai-head { display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; }
.msg-ai-who { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.msg-ai-mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--primary); flex-shrink: 0; }
.msg-ai--offline .msg-ai-mark { color: var(--warning); }
.msg-ai-name { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); }
.msg-ai-time { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.msg-ai-head .ui-sev { margin-left: auto; }
.msg-ai-body { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); white-space: pre-wrap; overflow-wrap: anywhere; }
.msg-ai-body strong { font-weight: var(--fw-semibold); }
.msg-ai-call { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-control); background: var(--sev-emergency-soft); }
.msg-ai-call p { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--sev-emergency-ink); }
.msg-ai-call .ui-btn { align-self: flex-start; }
.msg-ai-disclaimer { display: flex; gap: var(--space-2); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
.msg-ai-disclaimer svg { margin-top: 0.125rem; }
.msg-ai-translated { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); font-style: italic; }
.msg-ai-foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); }
.msg-ai-foot-label { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); margin-right: var(--space-1); }
.msg-ai-foot .ui-btn[aria-pressed="true"] { background: var(--surface-hover); color: var(--text-primary); border-color: var(--border-strong); }
.msg-ai-fb { display: flex; gap: var(--space-1); }
.msg-ai-share { margin-left: auto; }

/* ----- error row (a failed send — not an AI message) ----- */
.msg-error {
  display: flex; align-items: flex-start; gap: var(--space-3); padding: var(--space-4);
  border: 1px solid var(--danger-border); border-radius: var(--radius-card); background: var(--danger-soft);
}
.msg-error > svg { color: var(--danger); margin-top: 0.125rem; }
.msg-error-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.msg-error-title { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); }
.msg-error-desc { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.msg-error-actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }

/* ----- thinking ----- */
.msg-thinking { display: flex; align-items: center; gap: var(--space-3); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.msg-dots { display: inline-flex; gap: var(--space-1); }
.msg-dots span { width: 0.375rem; height: 0.375rem; border-radius: var(--radius-pill); background: var(--text-muted); animation: msg-dot 1.2s var(--ease-standard) infinite; }
.msg-dots span:nth-child(2) { animation-delay: 0.15s; } .msg-dots span:nth-child(3) { animation-delay: 0.3s; }
@keyframes msg-dot { 0%, 60%, 100% { opacity: 0.35; } 30% { opacity: 1; } }

/* ----- composer ----- */
.composer-wrap { flex-shrink: 0; background: var(--bg); padding: 0 var(--space-6) var(--space-3); }
.composer-inner { max-width: var(--content-reading); margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-2); }
.composer {
  display: flex; align-items: center; gap: var(--space-1); padding: var(--space-1);
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--radius-card);
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.composer:focus-within { border-color: var(--focus-ring); box-shadow: 0 0 0 1px var(--focus-ring); }
/* Buttons inside the composer keep their own ring; the input's ring is the container's. */
.composer-input {
  flex: 1; min-width: 0; min-height: var(--touch); padding: 0 var(--space-2); border: 0; background: transparent;
  font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary);
}
.composer-input:focus-visible { outline: none; }
.composer-note { display: flex; gap: var(--space-2); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); padding: 0 var(--space-1); }
.composer-note svg { margin-top: 0.0625rem; }
.composer-note a { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); text-decoration: underline; text-underline-offset: 2px; }
.att-tray { display: flex; gap: var(--space-2); overflow-x: auto; padding: var(--space-1) 0; }
.att-card {
  position: relative; flex-shrink: 0; width: 8rem; display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2);
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
.an { display: flex; flex-direction: column; gap: var(--space-5); }
.an-section { display: flex; flex-direction: column; gap: var(--space-2); }
.an-section h3 { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }
.an-section p { font-size: var(--fs-md); line-height: var(--lh-md); }
.an-meter { height: 0.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.an-meter span { display: block; height: 100%; width: 100%; transform-origin: left center; background: var(--text-muted); }
.an-meter .sev-low { background: var(--sev-low); } .an-meter .sev-moderate { background: var(--sev-moderate); }
.an-meter .sev-high { background: var(--sev-high); } .an-meter .sev-emergency { background: var(--sev-emergency); }
.an-risk { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-3); }
.an-score { font-size: var(--fs-2xl); line-height: var(--lh-2xl); font-weight: var(--fw-semibold); font-variant-numeric: tabular-nums; }
.an-score small { font-size: var(--fs-sm); color: var(--text-muted); font-weight: var(--fw-regular); }
.an-actions { display: flex; flex-direction: column; gap: var(--space-2); }

@media (max-width: 767px) {
  .chat-thread { padding: var(--space-4); gap: var(--space-5); }
  .chat-empty { padding-top: var(--space-2); }
  .chat-empty h2 { font-size: var(--fs-xl); line-height: var(--lh-xl); }
  .composer-wrap { padding: 0 var(--space-3) var(--space-2); }
  .msg-user { max-width: 88%; }
  .msg-ai { padding: var(--space-4); }
}
`
