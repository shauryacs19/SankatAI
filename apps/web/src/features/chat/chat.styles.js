// Chat surface. Tokens only.
export const CHAT_CSS = `
.chat { flex: 1; min-height: 0; display: flex; flex-direction: column; }
.chat-scroll { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
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

/* v2 assessment: severity + confidence, structured sections, safety note */
.msg-ai-sev { margin-left: auto; display: inline-flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
.msg-ai-head .msg-ai-sev .ui-sev { margin-left: 0; }
.msg-ai-conf { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.msg-ai-details { display: flex; flex-direction: column; gap: var(--space-4); }
.msg-ai-sec { display: flex; flex-direction: column; gap: var(--space-2); }
.msg-ai-sec h3 { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); }
.msg-ai-sec p, .msg-ai-sec li { font-size: var(--fs-md); line-height: 1.65; overflow-wrap: anywhere; }
.msg-ai-sec--care { padding: var(--space-3) var(--space-4); border-radius: var(--radius-card); background: var(--surface-tint); }
.msg-ai-note { display: flex; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-radius: var(--radius-card); background: var(--warning-soft); border: 1px solid var(--warning-border); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.msg-ai-note svg { color: var(--warning); flex-shrink: 0; margin-top: 0.125rem; }

/* follow-up questionnaire: one question at a time (‹ › to move, 1-9 to pick) */
.qn { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface-tint); }
.qn-head { display: flex; align-items: center; gap: var(--space-3); }
.qn-progress { font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--text-secondary); white-space: nowrap; }
.qn-dots { flex: 1; display: flex; justify-content: center; align-items: center; gap: 6px; }
.qn-dot { width: 8px; height: 8px; border-radius: var(--radius-pill); background: var(--border-default); transition: background-color 150ms, transform 150ms; }
.qn-dot.is-done { background: var(--primary-border); }
.qn-dot.is-current { background: var(--primary); transform: scale(1.35); }
.qn-dot--review { border-radius: 2px; }
.qn-nav { display: flex; gap: var(--space-1); }
.qn-nav .ui-iconbtn:disabled { opacity: 0.35; cursor: default; }
.qn-stage { overflow: hidden; }
.qn-step { border: 0; margin: 0; padding: 0; min-width: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.qn-q { padding: 0; font-size: var(--fs-lg); line-height: 1.45; font-weight: var(--fw-semibold); color: var(--text-primary); }
.qn-list { display: flex; flex-direction: column; gap: var(--space-2); }
.qn-row {
  position: relative; display: flex; align-items: center; gap: var(--space-3); min-height: 3rem; padding: var(--space-2) var(--space-4);
  border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface); cursor: pointer;
  font-size: var(--fs-md); line-height: 1.35; color: var(--text-primary); transition: border-color 120ms, background-color 120ms;
}
.qn-row:hover { border-color: var(--primary-border); background: var(--surface-hover); }
.qn-row.is-checked { border-color: var(--primary); background: var(--primary-soft); color: var(--primary-text); font-weight: var(--fw-semibold); }
/* the radio stays in the accessibility tree and keyboard order; the row is what you see */
.qn-row input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
.qn-row:has(input:focus-visible) { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.qn-key { flex: none; display: inline-grid; place-items: center; width: 1.625rem; height: 1.625rem; border-radius: 6px; border: 1px solid var(--border-default); font-size: var(--fs-xs); font-weight: var(--fw-semibold); color: var(--text-muted); }
.qn-row.is-checked .qn-key { border-color: var(--primary); background: var(--primary); color: var(--on-primary); }
.qn-label { flex: 1; }
.qn-tick { flex: none; color: var(--primary); }
.qn-type { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); }
.qn-type textarea, .qn-note { width: 100%; }
.qn-review { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--surface); overflow: hidden; }
.qn-review li + li { border-top: 1px solid var(--border-subtle); }
.qn-review-row {
  width: 100%; min-height: 2.75rem; display: flex; align-items: center; justify-content: space-between; gap: var(--space-3);
  padding: var(--space-2) var(--space-4); border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer;
}
.qn-review-row:hover { background: var(--surface-hover); }
.qn-review-row:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: -2px; }
.qn-review-q { font-size: var(--fs-sm); color: var(--text-secondary); }
.qn-review-a { font-weight: var(--fw-semibold); text-align: right; overflow-wrap: anywhere; }
.qn-review-a.is-skipped { font-weight: var(--fw-regular); font-style: italic; color: var(--text-muted); }
.qn-foot { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3); }
.qn-count { font-size: var(--fs-sm); color: var(--text-muted); }
@media (max-width: 479px) { .qn { padding: var(--space-3); } .qn-dots { display: none; } }

/* feedback: an animated "thanks" popup above the Yes / No buttons */
.msg-ai-fb-wrap { position: relative; display: inline-flex; align-items: center; gap: var(--space-2); }
.fb-pop {
  position: absolute; left: 0; bottom: calc(100% + var(--space-2)); z-index: 5; width: max-content; max-width: min(20rem, 80vw);
  display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) var(--space-4);
  border: 1px solid var(--primary-border); border-radius: var(--radius-card); background: var(--surface);
  box-shadow: var(--shadow-lift, 0 8px 24px rgba(0, 0, 0, 0.12)); font-size: var(--fs-sm); line-height: 1.4; color: var(--text-primary);
}
.fb-pop strong { display: block; font-size: var(--fs-md); }
.fb-pop-icon { position: relative; flex: none; display: inline-grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary); }
.fb-pop-ring { position: absolute; inset: 0; border-radius: var(--radius-pill); border: 2px solid var(--primary); }

/* "No" follow-up: optional reason + comment */
.msg-fb-more { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-4); border-radius: var(--radius-card); background: var(--surface-tint); }
.msg-fb-more-title { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); }
.msg-fb-more-title span, .msg-fb-more-sub { font-weight: var(--fw-regular, 400); color: var(--text-muted); font-size: var(--fs-sm); }
.msg-fb-chips { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
.msg-fb-chips .ui-chip[aria-pressed="true"] { background: var(--primary-soft); color: var(--primary-text); border-color: var(--primary-border); }
.msg-fb-actions { display: flex; gap: var(--space-2); }

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

.chat-empty-head { display: flex; align-items: center; gap: var(--space-3); }
.chat-empty-head .chat-empty-hello, .chat-empty-head .chat-empty-mark { margin: 0; }

/* ----- composer ----- */
.composer-wrap { flex-shrink: 0; background: var(--bg); padding: var(--space-2) var(--space-6) var(--space-4); }
.composer-inner { max-width: 46rem; margin: 0 auto; display: flex; flex-direction: column; gap: var(--space-2); }
.composer {
  display: flex; flex-direction: row; align-items: flex-end; gap: var(--space-1); padding: var(--space-2);
  background: var(--surface); border: 1px solid var(--border-strong); border-radius: 1.25rem; box-shadow: var(--shadow-lift);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.composer:focus-within { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary), 0 0 0 5px var(--focus-halo); }
/* The input's ring is the container's; buttons inside keep their own. */
.composer-input {
  flex: 1; min-width: 0; min-height: 2.5rem; max-height: calc(5 * 1.6em + 1rem); padding: 0.5rem var(--space-2); border: 0; background: transparent; resize: none;
  font-size: var(--fs-md); line-height: 1.6; color: var(--text-primary); overflow-y: auto;
}
.composer-input:focus-visible { outline: none; }
/* One row: [Attach] [text] [Voice] [Send]. */
.composer-actions { display: contents; }
.composer-actions > .ui-menu-anchor { order: -1; }
.composer-actions .ui-btn, .composer-actions .ui-menu-anchor { flex-shrink: 0; }
.composer-actions .ui-btn--ghost { color: var(--text-secondary); padding: 0 var(--space-3); }
.composer-send { padding: 0; }
.composer-actions .ui-btn-text { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.composer-actions .ui-btn { width: 2.5rem; min-width: 2.5rem; min-height: 2.5rem; padding: 0; justify-content: center; }
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

/* ----- Nearby care: a reply-like card with the top places, a map and links ----- */
.msg-ai-nearby { display: flex; }
.nb-wait { align-self: flex-start; }
.nb-error p { margin-bottom: var(--space-3); }
.nb-actions, .nb-item-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.nb-sos { display: flex; gap: var(--space-2); align-items: flex-start; padding: var(--space-3) var(--space-4); border-radius: var(--radius-card); background: var(--sev-emergency-soft); color: var(--sev-emergency-ink); font-size: var(--fs-sm); line-height: var(--lh-sm); }
.nb-sos svg { flex-shrink: 0; margin-top: 0.125rem; }
.nb-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: hidden; }
.nb-item { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); }
.nb-item + .nb-item { border-top: 1px solid var(--border-subtle); }
.nb-num { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border-radius: var(--radius-pill); background: var(--primary); color: var(--on-primary); font-size: var(--fs-sm); font-weight: var(--fw-semibold); }
.nb-info { min-width: 0; display: flex; flex-direction: column; gap: 0.125rem; }
.nb-name { font-size: var(--fs-md); line-height: var(--lh-sm); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
.nb-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1) var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.nb-meta strong { color: var(--text-primary); font-weight: var(--fw-semibold); }
.nb-addr { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); overflow-wrap: anywhere; }
.nb-tag { display: inline-flex; padding: 0 var(--space-2); border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); font-size: var(--fs-xs); line-height: 1.5rem; font-weight: var(--fw-semibold); }
.nb-tag--er { background: var(--sev-emergency-soft); color: var(--sev-emergency-ink); }
.nb-map { height: 16rem; border-radius: var(--radius-card); border: 1px solid var(--border-subtle); overflow: hidden; background: var(--surface-tint); z-index: 0; isolation: isolate; }
.nb-map--loading { animation: nb-pulse 1.2s ease-in-out infinite; }
@keyframes nb-pulse { 50% { opacity: 0.6; } }
.nb-map .leaflet-container { font: inherit; }
:root[data-theme="dark"] .nb-map .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.85) contrast(0.9); }
.nb-pin span { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; background: var(--primary); color: var(--on-primary); font: 600 13px/1 system-ui, sans-serif; border: 2px solid #fff; box-shadow: 0 2px 6px rgb(0 0 0 / 0.35); }
.nb-pin-you span { display: block; width: 18px; height: 18px; border-radius: 50%; background: #2563eb; border: 3px solid #fff; box-shadow: 0 0 0 6px rgb(37 99 235 / 0.25), 0 1px 4px rgb(0 0 0 / 0.3); }
.nb-foot { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2) var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border-subtle); }
.nb-source { font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
@media (max-width: 479px) {
  .nb-item { grid-template-columns: auto 1fr; }
  .nb-item-actions { grid-column: 2; }
  .nb-map { height: 13rem; }
}
@media (prefers-reduced-motion: reduce) { .nb-map--loading { animation: none; } }

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
