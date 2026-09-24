// Documents page. Tokens only.
export const DOCS_CSS = `
.doc-groups { display: flex; flex-direction: column; gap: var(--space-5); }
.doc-group {
  background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card);
  transition: border-color var(--dur-fast) var(--ease-standard);
}
.doc-group.is-dragover { border-color: var(--focus-ring); outline: 2px dashed var(--border-strong); outline-offset: 2px; }
.doc-group-head { display: flex; align-items: center; gap: var(--space-2); min-height: 3.25rem; padding: var(--space-2) var(--space-2) var(--space-2) var(--space-5); border-bottom: 1px solid var(--border-subtle); }
.doc-group-ic { color: var(--text-muted); }
.doc-group-title { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.doc-group-tools { margin-left: auto; display: flex; gap: var(--space-1); }
.doc-group-empty { padding: var(--space-4) var(--space-5); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }

.doc-list { list-style: none; margin: 0; padding: 0; }
.doc { display: flex; align-items: center; gap: var(--space-2); padding-right: var(--space-2); }
.doc + .doc { border-top: 1px solid var(--border-subtle); }
.doc[draggable="true"] { cursor: grab; }
.doc[draggable="true"]:active { cursor: grabbing; }
.doc--skel { gap: var(--space-3); padding: var(--space-3) var(--space-5); }
.doc-open {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); min-height: 4rem;
  padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5);
  border: 0; background: transparent; text-align: left; color: var(--text-primary);
}
.doc-open:hover .doc-name { text-decoration: underline; text-underline-offset: 2px; }
.doc-open:focus-visible { outline-offset: -2px; }
.doc-ic { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
.doc-main { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1; }
.doc-name { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.doc-meta { display: inline-flex; align-items: center; gap: var(--space-1); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.doc-meta-lock { display: none; }
.doc-lock { flex-shrink: 0; }
.doc-actions { display: flex; gap: var(--space-1); flex-shrink: 0; }
.doc-act-menu { display: none; }

/* grid view: cards, actions always visible (no hover-only controls, no blur) */
.doc-list--grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: var(--space-3); padding: var(--space-4); }
.doc-list--grid .doc { position: relative; flex-direction: column; align-items: stretch; gap: 0; padding: 0; border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.doc-list--grid .doc + .doc { border-top: 1px solid var(--border-subtle); }
.doc-list--grid .doc-open { flex-direction: column; align-items: flex-start; gap: var(--space-3); min-height: 0; padding: var(--space-4); padding-right: var(--space-12); border-radius: var(--radius-card); }
.doc-list--grid .doc-main { width: 100%; }
.doc-list--grid .doc-name { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
.doc-list--grid .doc-lock { position: absolute; left: var(--space-4); bottom: var(--space-3); }
.doc-list--grid .doc-actions { position: absolute; top: var(--space-2); right: var(--space-2); }
.doc-list--grid .doc-act-wide { display: none; }
.doc-list--grid .doc-act-menu { display: inline-flex; }
.doc-list--grid .doc:has(.doc-lock) .doc-open { padding-bottom: var(--space-10); }

@media (max-width: 767px) {
  .doc-act-wide { display: none; }
  .doc-act-menu { display: inline-flex; }
  .doc-lock { display: none; }
  .doc-meta-lock { display: inline; }
  .doc-list--grid .doc-lock { display: inline-flex; }
  .doc-open { padding-left: var(--space-4); }
  .doc-group-head { padding-left: var(--space-4); }
  .doc-list--grid { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: var(--space-3); gap: var(--space-2); }
}
`
