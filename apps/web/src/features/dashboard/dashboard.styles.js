// Dashboard styles, extracted verbatim from the original Dashboard component.
export const DB_CSS = `
.db-shell { display: flex; height: 100vh; overflow: hidden; background: var(--bg-body, #F8FAFC); color: var(--text-primary, #0F172A); font-size: 14px; }

/* 20% tab rail */
/* The rail is sized so the disclaimer lands on the last row without scrolling:
   everything is compact and the nav list absorbs any leftover space. */
.db-tabs { width: 20%; min-width: 228px; max-width: 292px; flex-shrink: 0; display: flex; flex-direction: column; padding: 14px 12px; gap: 2px; background: var(--bg-surface, #fff); border-right: 1px solid var(--border-subtle, #E5E7EB); overflow: hidden; }
.db-tabs > .db-quick { margin-top: auto; }
.db-brand { display: flex; align-items: center; gap: 10px; padding: 2px 4px 12px; }
.db-brand-mark { width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.db-brand-text { display: flex; flex-direction: column; min-width: 0; }
.db-brand-name { font-weight: 800; font-size: 1.1rem; letter-spacing: -0.01em; }
.db-brand-name b { color: var(--primary, #C4504B); }
.db-brand-sub { font-size: 0.72rem; color: var(--text-muted, #64748B); }

.db-newchat { display: flex; align-items: center; gap: 10px; width: 100%; margin: 10px 0; padding: 10px 13px; border-radius: 12px; border: 1px solid var(--sev-emergency-border, #FBD9D7); background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); font-weight: 700; font-size: 0.92rem; cursor: pointer; transition: all 0.15s; }
.db-newchat:hover { background: var(--primary, #C4504B); border-color: var(--primary, #C4504B); color: #fff; }

/* Quick actions + disclaimer in the rail */
.db-quick { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.db-quick-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #64748B); padding: 0 4px 2px; }
.db-quick-item { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 11px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); cursor: pointer; transition: all 0.15s; }
.db-quick-item:hover { border-color: var(--primary, #C4504B); }
.db-quick-ic { width: 30px; height: 30px; border-radius: 10px; flex-shrink: 0; display: grid; place-items: center; background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); }
.db-quick-text { display: flex; flex-direction: column; min-width: 0; }
.db-quick-text b { font-size: 0.85rem; font-weight: 700; color: var(--text-primary, #0F172A); }
.db-quick-text span { font-size: 0.72rem; color: var(--text-muted, #64748B); }
.db-quick-item.danger .db-quick-ic { background: var(--sev-emergency-soft, #FEF2F2); color: var(--sev-emergency, #DC2626); }
.db-quick-item.danger .db-quick-text b { color: var(--sev-emergency, #DC2626); }

.db-disclaimer { margin-top: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--sev-moderate-border, #FDE68A); background: var(--sev-moderate-soft, #FEFCE8); }
.db-disclaimer-head { display: flex; align-items: center; gap: 7px; font-size: 0.82rem; font-weight: 700; color: var(--text-primary, #0F172A); }
.db-disclaimer-head svg { color: var(--sev-moderate, #CA8A04); }
.db-disclaimer p { margin: 5px 0 0; font-size: 0.72rem; line-height: 1.45; color: var(--text-secondary, #334155); }
.db-tab-list { display: flex; flex-direction: column; gap: 4px; padding-bottom: 4px; }
.db-tab { display: flex; align-items: center; gap: 12px; padding: 9px 13px; border-radius: 11px; border: none; background: transparent; color: var(--text-secondary, #334155); font-weight: 600; font-size: 0.92rem; cursor: pointer; text-align: left; width: 100%; transition: all 0.15s; }
.db-tab:hover { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); }
.db-tab.active { background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.db-tab.logout { color: var(--text-muted, #64748B); }
.db-tab.logout:hover { background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.db-tab-user { display: flex; align-items: center; gap: 10px; padding: 10px; margin-top: 12px; border: 1px solid var(--border-subtle, #E5E7EB); text-decoration: none; color: inherit; border-radius: 12px; }
.db-tab-user:hover { background: var(--surface-2, #F1F5F9); }
.db-tab-user-chev { color: var(--text-muted, #94A3B8); flex-shrink: 0; }
.db-tab-avatar { width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg,#C4504B,#D9635E); color: #fff; display: grid; place-items: center; font-weight: 800; flex-shrink: 0; }
.db-tab-userinfo { display: flex; flex-direction: column; min-width: 0; }
.db-tab-name { font-size: 0.85rem; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-tab-email { font-size: 0.72rem; color: var(--text-muted, #64748B); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* 80% content */
.db-content { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.db-topbar { display: flex; align-items: center; gap: 12px; padding: 14px 24px; background: var(--bg-surface, #fff); border-bottom: 1px solid var(--border-subtle, #E5E7EB); }
.db-topbar-title { font-size: 1.05rem; font-weight: 700; margin: 0; }
.db-topbrand { display: flex; flex-direction: column; min-width: 0; }
.db-topbrand-name { display: inline-flex; align-items: center; gap: 6px; font-size: 1rem; font-weight: 800; }
.db-topbrand-name svg { color: var(--primary, #C4504B); }
.db-topbrand-status { display: inline-flex; align-items: center; gap: 6px; font-size: 0.74rem; color: var(--text-muted, #64748B); }
.db-topbrand-status i { width: 7px; height: 7px; border-radius: 50%; background: var(--success, #059669); }
.db-offline { text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-size: 0.76rem; font-weight: 600; color: var(--sev-high, #EA580C); background: var(--sev-high-soft, #FFF7ED); border: 1px solid var(--sev-high-border, #FED7AA); padding: 4px 8px; border-radius: 8px; }
.db-spacer { flex: 1; }
.db-icon-ghost { background: transparent; border: none; color: var(--text-muted, #64748B); cursor: pointer; padding: 6px; border-radius: 8px; display: grid; place-items: center; }
.db-icon-ghost:hover { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); }
.db-sos { display: inline-flex; align-items: center; gap: 6px; background: var(--sev-emergency, #DC2626); color: #fff; border: none; border-radius: 10px; padding: 8px 14px; font-weight: 800; font-size: 0.82rem; cursor: pointer; box-shadow: 0 2px 8px rgba(196, 80, 75,0.25); }
.db-sos:hover { background: #B91C1C; }

.db-view { flex: 1; min-height: 0; }
.db-view.chat-view { display: flex; position: relative; }
.db-view.scroll-view { overflow-y: auto; padding: 24px; }
.db-cards { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 16px; }

/* profile / medical cards */
.dx-card { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; padding: 18px; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.dx-card-title { display: flex; align-items: center; gap: 8px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted, #64748B); margin-bottom: 14px; }
.dx-card-title svg { color: var(--primary, #C4504B); }
.dx-empty { color: var(--text-muted, #64748B); font-size: 0.85rem; }
.dx-profile-head { display: flex; align-items: center; gap: 14px; }
.dx-avatar { width: 56px; height: 56px; border-radius: 15px; background: linear-gradient(135deg,#C4504B,#D9635E); color: #fff; display: grid; place-items: center; font-size: 1.4rem; font-weight: 800; flex-shrink: 0; box-shadow: 0 4px 12px rgba(196, 80, 75,0.25); }
.dx-profile-id { flex: 1; min-width: 0; }
.dx-profile-name { margin: 0; font-size: 1.1rem; font-weight: 700; }
.dx-verified { display: inline-flex; align-items: center; gap: 3px; font-size: 0.75rem; font-weight: 600; color: var(--success, #059669); }
.dx-blood { display: inline-flex; align-items: center; gap: 3px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); border: 1px solid var(--sev-emergency-border, #F0CFCD); font-weight: 700; font-size: 0.78rem; padding: 5px 9px; border-radius: 8px; }
.dx-completion { margin: 18px 0 6px; }
.dx-completion-top { display: flex; justify-content: space-between; font-size: 0.74rem; color: var(--text-muted, #64748B); margin-bottom: 6px; font-weight: 600; }
.dx-progress { height: 6px; background: var(--surface-2, #F1F5F9); border-radius: 99px; overflow: hidden; }
.dx-progress-fill { height: 100%; background: linear-gradient(90deg,#C4504B,#E0736E); border-radius: 99px; transition: width 0.4s ease; }
.dx-facts { margin: 14px 0; }
.info-row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.info-row-label { font-size: 0.82rem; color: var(--text-muted, #64748B); }
.info-row-value { font-size: 0.85rem; font-weight: 600; text-align: right; word-break: break-word; }
.dx-med-item { display: flex; align-items: flex-start; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.dx-med-item:first-of-type { border-top: none; }
.dx-med-item > svg { color: var(--text-muted, #64748B); margin-top: 2px; flex-shrink: 0; }
.dx-med-item > div { display: flex; flex-direction: column; min-width: 0; }
.dx-med-label { font-size: 0.72rem; color: var(--text-muted, #64748B); }
.dx-med-val { font-size: 0.88rem; font-weight: 600; word-break: break-word; }
.dx-setting-btn { display: flex; align-items: center; gap: 10px; width: 100%; border: none; background: transparent; color: var(--text-secondary, #334155); padding: 11px; border-radius: 10px; cursor: pointer; font-size: 0.9rem; font-weight: 500; transition: all 0.15s; margin-top: 4px; }
.dx-setting-btn:hover { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); }
.dx-setting-btn.danger:hover { background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.dx-emerg-row { display: flex; align-items: center; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.dx-emerg-row:first-of-type { border-top: none; }
.dx-emerg-icon { width: 34px; height: 34px; border-radius: 9px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); display: grid; place-items: center; flex-shrink: 0; }
.dx-emerg-icon.dx-muted-icon { background: var(--surface-2, #F1F5F9); color: var(--text-muted, #64748B); }
.dx-emerg-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.dx-emerg-label { font-size: 0.88rem; font-weight: 600; }
.dx-emerg-num { font-size: 0.76rem; color: var(--text-muted, #64748B); }
.dx-call { display: inline-flex; align-items: center; gap: 4px; background: var(--sev-emergency, #DC2626); color: #fff; border: none; border-radius: 8px; padding: 7px 11px; font-size: 0.74rem; font-weight: 700; text-decoration: none; flex-shrink: 0; }
.dx-call:hover { background: #B91C1C; }
.dx-call.ghost { background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); padding: 8px; }

/* documents */
.db-docs { max-width: 860px; margin: 0 auto; }
.db-docs-head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }
.db-docs-head h3 { margin: 0 0 4px; font-size: 1.2rem; }
.db-docs-head p { margin: 0; color: var(--text-muted, #64748B); font-size: 0.88rem; max-width: 460px; line-height: 1.5; }
.db-docs-upload { display: flex; gap: 8px; flex-shrink: 0; }
.db-docs-upload { align-items: center; }
.dx-action.db-docs-btn { padding: 5px 12px; font-size: 0.82rem; }
.db-docs-empty { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 70px 20px; color: var(--text-muted, #94A3B8); background: var(--bg-surface, #fff); border: 1px dashed var(--border-subtle, #CBD5E1); border-radius: 16px; }
.db-docs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
.db-doc { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 20px 14px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; position: relative; }
.db-doc-ic { width: 48px; height: 48px; border-radius: 12px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); display: grid; place-items: center; }
.db-doc-name { font-size: 0.8rem; font-weight: 600; text-align: center; word-break: break-word; }
.db-doc-del { position: absolute; top: 8px; right: 8px; background: transparent; border: none; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 4px; border-radius: 6px; }
.db-doc-del:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
/* File Storage: clickable cards + states */
.db-doc { cursor: pointer; text-align: center; font: inherit; color: inherit; transition: border-color 0.15s, box-shadow 0.15s; }
.db-doc:hover { border-color: var(--primary, #C4504B); box-shadow: 0 2px 10px rgba(16,24,40,0.07); }
.db-doc-meta { font-size: 0.72rem; color: var(--text-muted, #94A3B8); }
.db-docs-error { display: flex; align-items: center; gap: 8px; background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); color: var(--primary, #C4504B); padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; font-size: 0.85rem; }
.db-docs-spinner { width: 26px; height: 26px; border-radius: 50%; border: 3px solid var(--border-subtle, #E5E7EB); border-top-color: var(--primary, #C4504B); animation: db-rotate 0.8s linear infinite; }
.dx-action.ghost { background: var(--bg-surface, #fff); color: var(--text-muted, #64748B); }
.dx-action.ghost:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.db-spin { animation: db-rotate 0.8s linear infinite; }
@keyframes db-rotate { 100% { transform: rotate(360deg); } }

/* File Storage: file rows (list items inside a category card) */
.db-file-list { display: flex; flex-direction: column; gap: 2px; }
.db-file-row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 10px 8px; background: transparent; border: none; border-radius: 10px; cursor: pointer; font: inherit; color: inherit; transition: background 0.12s; }
.db-file-row:hover { background: var(--surface-2, #F8FAFC); }
.db-file-ic { width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.db-file-main { display: flex; flex-direction: column; gap: 3px; flex: 1; min-width: 0; }
.db-file-name { display: flex; align-items: center; gap: 7px; font-size: 0.92rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-file-lock { color: var(--text-muted, #94A3B8); flex-shrink: 0; }
.db-file-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 0.76rem; color: var(--text-muted, #64748B); }
.db-file-type { font-weight: 700; letter-spacing: 0.02em; }
.db-file-dot { color: var(--text-muted, #CBD5E1); }
.db-file-del { flex-shrink: 0; display: grid; place-items: center; color: var(--text-muted, #94A3B8); padding: 8px; border-radius: 9px; }
.db-file-del:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.db-file-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
.db-file-act { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; border: none; background: transparent; color: var(--text-muted, #64748B); cursor: pointer; transition: all 0.15s; }
.db-file-act:hover { background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); }
.db-file-act.danger:hover { background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.db-file-act:disabled { opacity: 0.6; cursor: default; }
.db-file-protected { color: var(--primary, #C4504B); font-weight: 600; }
/* File Storage: grid view — thumbnail + name centred, actions revealed on hover
   over a blurred card. */
.db-file-list.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px; }
.db-file-list.grid .db-file-row { position: relative; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 10px; padding: 18px 12px; min-height: 172px; border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; background: var(--bg-surface, #fff); overflow: hidden; }
.db-file-list.grid .db-file-row:hover { border-color: var(--primary, #C4504B); background: var(--bg-surface, #fff); }
.db-file-list.grid .db-file-ic { width: 56px; height: 56px; }
.db-file-list.grid .db-file-main { width: 100%; flex: none; align-items: center; text-align: center; }
.db-file-list.grid .db-file-name { justify-content: center; white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.db-file-list.grid .db-file-meta { justify-content: center; }
.db-file-list.grid .db-file-protbadge { max-width: 100%; }
.db-file-list.grid .db-file-prottext { display: none; }
/* content blurs, actions float above it */
.db-file-list.grid .db-file-ic,
.db-file-list.grid .db-file-main,
.db-file-list.grid .db-file-protbadge { transition: filter 0.16s ease, opacity 0.16s ease; }
.db-file-list.grid .db-file-row:hover .db-file-ic,
.db-file-list.grid .db-file-row:hover .db-file-main,
.db-file-list.grid .db-file-row:hover .db-file-protbadge { filter: blur(4px); opacity: 0.55; }
.db-file-list.grid .db-file-actions { position: absolute; inset: 0; width: 100%; justify-content: center; gap: 6px; opacity: 0; pointer-events: none; transition: opacity 0.16s ease; }
.db-file-list.grid .db-file-row:hover .db-file-actions,
.db-file-list.grid .db-file-row:focus-within .db-file-actions { opacity: 1; }
/* the overlay never eats the card click — only the buttons themselves do */
.db-file-list.grid .db-file-act { pointer-events: none; }
.db-file-list.grid .db-file-row:hover .db-file-act,
.db-file-list.grid .db-file-row:focus-within .db-file-act { pointer-events: auto; }
.db-file-list.grid .db-file-act { width: 38px; height: 38px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); box-shadow: 0 1px 3px rgba(16,24,40,0.1); }
@media (max-width: 520px) { .db-file-list.grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
/* modal extras (reuse the dx-modal* base) */
.dx-modal-desc { margin: 0; font-size: 0.85rem; color: var(--text-muted, #64748B); line-height: 1.5; }
.dx-modal-label { font-size: 0.8rem; color: var(--text-secondary, #334155); }
.dx-modal-label b { color: var(--text-primary, #0F172A); }
.dx-modal-err { font-size: 0.78rem; color: var(--primary, #C4504B); font-weight: 600; margin-top: -4px; }
.dx-modal-input.invalid { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.dx-modal-hint { font-weight: 400; color: var(--text-muted, #94A3B8); }
/* File Storage: category cards (heading + files grouped inside a white card) */
.db-cat-groups { display: flex; flex-direction: column; gap: 16px; }
.db-cat-group { display: flex; flex-direction: column; gap: 4px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; padding: 10px 12px; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.db-cat-head { display: flex; align-items: center; gap: 8px; padding: 6px 8px 10px; border-bottom: 1px solid var(--border-subtle, #F1F5F9); margin-bottom: 4px; }
.db-cat-ficon { color: var(--primary, #C4504B); flex-shrink: 0; }
.db-cat-title { font-size: 0.9rem; font-weight: 700; color: var(--text-primary, #0F172A); letter-spacing: -0.01em; }
.db-cat-count { font-size: 0.7rem; font-weight: 700; color: var(--text-muted, #64748B); background: var(--surface-2, #F1F5F9); border-radius: 99px; padding: 1px 8px; min-width: 20px; text-align: center; }
.db-cat-tools { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; opacity: 0; transition: opacity 0.15s; }
.db-cat-head:hover .db-cat-tools { opacity: 1; }
.db-cat-edit, .db-cat-remove { display: grid; place-items: center; color: var(--text-muted, #94A3B8); padding: 4px; border-radius: 6px; cursor: pointer; }
.db-cat-edit:hover { color: var(--primary, #C4504B); background: var(--surface-2, #F1F5F9); }
.db-cat-remove:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.db-cat-empty { margin: 4px 8px 8px; font-size: 0.82rem; color: var(--text-muted, #94A3B8); }
/* drag & drop: draggable rows + drop-target highlight */
.db-file-row[draggable="true"]:active { cursor: grabbing; }
.db-cat-group.dragover { outline: 2px dashed var(--primary, #C4504B); outline-offset: 2px; background: var(--sev-emergency-soft, #FBF1F0); border-color: var(--primary, #C4504B); }
.db-file-protbadge { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; font-size: 0.72rem; font-weight: 600; color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); padding: 4px 9px; border-radius: 99px; }
@media (max-width: 760px) { .db-file-prottext { display: none; } }
/* Profile: security PINs */
.sp-sub { margin: 0 0 12px; font-size: 0.85rem; color: var(--text-muted, #64748B); line-height: 1.5; }
.sp-err { display: flex; align-items: center; gap: 6px; font-size: 0.8rem; color: var(--primary, #C4504B); margin: 0 0 10px; }
.sp-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 6px; }
.sp-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; background: var(--bg-surface, #fff); }
.sp-ic { width: 34px; height: 34px; border-radius: 9px; flex-shrink: 0; display: grid; place-items: center; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.sp-info { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.sp-label { font-size: 0.9rem; font-weight: 600; }
.sp-date { font-size: 0.72rem; color: var(--text-muted, #94A3B8); }
.sp-del { flex-shrink: 0; background: transparent; border: none; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 7px; border-radius: 8px; display: grid; place-items: center; }
.sp-del:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }

/* actions */
.dx-action-grid { display: flex; flex-direction: column; gap: 8px; }
.dx-action { display: inline-flex; align-items: center; gap: 8px; padding: 11px 14px; border-radius: 10px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 0.88rem; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.15s; }
.dx-action:hover:not(:disabled) { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-action.danger { background: var(--sev-emergency, #DC2626); color: #fff; border-color: var(--sev-emergency, #DC2626); }
.dx-action.danger:hover { background: #B91C1C; color: #fff; }
.dx-action:disabled { opacity: 0.5; cursor: not-allowed; }

/* history rail (chat view) */

/* drag-to-resize handle between history and chat */

/* floating tab to reopen the panel when collapsed */
.sev-emergency { background: #C4504B; } .sev-high { background: #EA580C; } .sev-moderate { background: #CA8A04; } .sev-low { background: #059669; }

/* search chats */

/* per-chat actions (rename + delete) */
.dx-history-act { color: var(--text-muted, #94A3B8); padding: 4px; border-radius: 6px; display: grid; place-items: center; cursor: pointer; }
.dx-history-act:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }

/* active-chat name bar */

/* AI Medical Assistant badge + tooltip */

/* message delivery ticks */
/* ===== Redesigned chat: brand header, AI severity cards, quick chips ===== */
.dx-brandrow { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.dx-brand { font-size: 1.05rem; font-weight: 800; color: var(--primary, #C4504B); letter-spacing: -0.01em; }
.dx-brand-sub { display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; color: var(--text-muted, #64748B); }
.dx-brand-sub svg { color: var(--primary, #C4504B); }
.dx-emergency-btn { display: inline-flex; align-items: center; gap: 6px; flex-shrink: 0; border: 1px solid var(--sev-emergency-border, #FECACA); background: var(--sev-emergency-soft, #FEF2F2); color: var(--sev-emergency, #DC2626); font-weight: 700; font-size: 0.82rem; padding: 8px 14px; border-radius: 999px; cursor: pointer; transition: all 0.15s; }
.dx-emergency-btn:hover { background: var(--sev-emergency, #DC2626); color: #fff; border-color: var(--sev-emergency, #DC2626); }
.dx-emergency-btn.ghost { color: var(--text-muted, #64748B); background: transparent; border-color: var(--border-subtle, #E5E7EB); }

.dx-aicard { width: 100%; display: flex; flex-direction: column; gap: 10px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; padding: 14px 16px; }
.dx-aicard.sev-emergency { border-color: var(--sev-emergency-border, #FECACA); }
.dx-aicard.sev-high { border-color: var(--sev-high-border, #FED7AA); }
.dx-aicard.sev-moderate { border-color: var(--sev-moderate-border, #FDE68A); }
.dx-aicard.sev-low { border-color: var(--sev-low-border, #A7F3D0); }
.dx-aicard-head { display: flex; align-items: center; gap: 10px; }
.dx-aicard-ic { width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; flex-shrink: 0; background: var(--surface-2, #F1F5F9); }
.dx-aicard-title { flex: 1; min-width: 0; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.03em; }
.dx-aicard-pill { flex-shrink: 0; font-size: 0.7rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; background: var(--surface-2, #F1F5F9); }
.dx-aicard.sev-emergency .dx-aicard-ic, .dx-aicard.sev-emergency .dx-aicard-title, .dx-aicard.sev-emergency .dx-aicard-pill { color: var(--sev-emergency, #DC2626); }
.dx-aicard.sev-emergency .dx-aicard-ic, .dx-aicard.sev-emergency .dx-aicard-pill { background: var(--sev-emergency-soft, #FEF2F2); }
.dx-aicard.sev-high .dx-aicard-ic, .dx-aicard.sev-high .dx-aicard-title, .dx-aicard.sev-high .dx-aicard-pill { color: var(--sev-high, #EA580C); }
.dx-aicard.sev-high .dx-aicard-ic, .dx-aicard.sev-high .dx-aicard-pill { background: var(--sev-high-soft, #FFF7ED); }
.dx-aicard.sev-moderate .dx-aicard-ic, .dx-aicard.sev-moderate .dx-aicard-title, .dx-aicard.sev-moderate .dx-aicard-pill { color: var(--sev-moderate, #CA8A04); }
.dx-aicard.sev-moderate .dx-aicard-ic, .dx-aicard.sev-moderate .dx-aicard-pill { background: var(--sev-moderate-soft, #FEFCE8); }
.dx-aicard.sev-low .dx-aicard-ic, .dx-aicard.sev-low .dx-aicard-title, .dx-aicard.sev-low .dx-aicard-pill { color: var(--sev-low, #059669); }
.dx-aicard.sev-low .dx-aicard-ic, .dx-aicard.sev-low .dx-aicard-pill { background: var(--sev-low-soft, #ECFDF5); }
.dx-aicard-body { margin: 0; font-size: 0.95rem; line-height: 1.55; }
.dx-aicard-callout { display: flex; align-items: center; gap: 10px; background: var(--sev-emergency-soft, #FEF2F2); border: 1px solid var(--sev-emergency-border, #FECACA); color: var(--sev-emergency, #DC2626); font-weight: 700; border-radius: 12px; padding: 12px 14px; line-height: 1.45; }
.dx-aicard-callout svg { flex-shrink: 0; }
.dx-aicard-recs h4 { margin: 0 0 4px; font-size: 0.85rem; font-weight: 700; }
.dx-aicard.sev-low .dx-aicard-recs h4 { color: var(--sev-low, #059669); }
.dx-aicard.sev-moderate .dx-aicard-recs h4 { color: var(--sev-moderate, #CA8A04); }
.dx-aicard.sev-high .dx-aicard-recs h4 { color: var(--sev-high, #EA580C); }
.dx-aicard.sev-emergency .dx-aicard-recs h4 { color: var(--sev-emergency, #DC2626); }
.dx-aicard-recs ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.dx-aicard-recs li { font-size: 0.88rem; line-height: 1.5; color: var(--text-secondary, #334155); }
.dx-aicard-follow { margin: 0; padding-top: 10px; border-top: 1px solid var(--border-subtle, #E5E7EB); font-size: 0.85rem; color: var(--text-muted, #64748B); }
.dx-aicard-disclaimer { display: flex; align-items: flex-start; gap: 8px; margin: 0; font-size: 0.75rem; line-height: 1.5; color: var(--text-muted, #64748B); }
.dx-aicard-disclaimer svg { flex-shrink: 0; margin-top: 2px; }
.dx-aicard-foot { display: flex; align-items: center; gap: 14px; padding-top: 10px; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.dx-aicard-time { font-size: 0.7rem; color: var(--text-muted, #94A3B8); margin-right: auto; }
/* Labelled feedback buttons inside the card footer: override the icon-only
   28x28 .dx-fb box, which squeezed the text onto two lines. */
.dx-aicard-foot { flex-wrap: wrap; row-gap: 8px; }
.dx-aicard-foot .dx-feedback { display: flex; align-items: center; gap: 8px; margin: 0; flex-wrap: nowrap; }
.dx-aicard-foot .dx-fb { display: inline-flex; align-items: center; justify-content: center; gap: 6px; width: auto; height: auto; min-height: 30px; padding: 5px 11px; border-radius: 999px; white-space: nowrap; flex-shrink: 0; font-size: 0.76rem; font-weight: 600; line-height: 1; }
.dx-aicard-foot .dx-fb svg { flex-shrink: 0; }

.dx-quickchips { display: flex; gap: 8px; flex-wrap: wrap; padding: 0 22px 10px; }
.dx-quickchip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-secondary, #334155); font-size: 0.8rem; font-weight: 600; padding: 8px 13px; border-radius: 999px; cursor: pointer; transition: all 0.15s; }
.dx-quickchip:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-secure { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0 0 12px; font-size: 0.72rem; color: var(--text-muted, #94A3B8); }
.dx-tick { color: var(--primary, #C4504B); margin-left: 4px; vertical-align: middle; }

/* Delivery state: "Sending…" with bouncing dots while in flight. Nothing is
   shown once delivered (no tick markers). */
.dx-delivery { display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; vertical-align: middle; color: var(--text-muted, #94A3B8); }
.dx-sending-dots { display: inline-flex; align-items: flex-end; gap: 1px; }
.dx-sending-dots span { display: inline-block; animation: dx-bounce 1.2s infinite ease-in-out; }
.dx-sending-dots span:nth-child(2) { animation-delay: 0.15s; }
.dx-sending-dots span:nth-child(3) { animation-delay: 0.3s; }

/* AI response feedback */
.dx-feedback { display: flex; align-items: center; gap: 6px; margin: 6px 2px 0; }
.dx-fb { display: inline-grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-muted, #64748B); cursor: pointer; transition: all 0.15s; }
.dx-fb:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-fb.active { background: var(--sev-emergency-soft, #FBF1F0); border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }

/* offline mode placeholder */
.dx-offline { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 48px 20px; }
.dx-offline-icon { width: 60px; height: 60px; border-radius: 16px; display: grid; place-items: center; background: var(--surface-2, #F1F5F9); color: var(--text-muted, #64748B); }
.dx-offline-title { margin: 4px 0 0; font-size: 1.2rem; font-weight: 700; }
.dx-offline-sub { margin: 0; color: var(--text-muted, #64748B); font-size: 0.9rem; }

/* rename modal */
.dx-modal-scrim { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 2000; display: grid; place-items: center; padding: 20px; }
.dx-modal { width: 100%; max-width: 420px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; box-shadow: 0 20px 50px -12px rgba(16,24,40,0.25); padding: 18px; display: flex; flex-direction: column; gap: 14px; }
.dx-modal-head { display: flex; align-items: center; justify-content: space-between; font-weight: 700; font-size: 0.95rem; }
.dx-modal-head > span { display: inline-flex; align-items: center; gap: 8px; }
.dx-modal-head svg { color: var(--primary, #C4504B); }
.dx-modal-input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 0.95rem; }
.dx-modal-input:focus { outline: none; border-color: var(--primary, #C4504B); box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.1)); }
.dx-modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
.dx-mbtn { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; font-size: 0.88rem; padding: 10px 16px; border-radius: 10px; border: 1px solid transparent; cursor: pointer; transition: all 0.15s; }
.dx-mbtn:disabled { opacity: 0.55; cursor: not-allowed; }
.dx-mbtn.primary { background: var(--primary, #C4504B); color: #fff; box-shadow: 0 2px 8px rgba(196, 80, 75,0.2); }
.dx-mbtn.primary:hover:not(:disabled) { background: var(--primary-hover, #A93F3B); }
.dx-mbtn.ghost { background: transparent; color: var(--text-secondary, #334155); border-color: var(--border-subtle, #E5E7EB); }
.dx-mbtn.ghost:hover:not(:disabled) { background: var(--surface-2, #F1F5F9); }

/* chat */
.dx-chat-col { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.dx-chat { flex: 1; overflow-y: auto; padding: 26px 30px; display: flex; flex-direction: column; gap: 18px; }
.dx-greeting { margin: auto; text-align: center; max-width: 560px; }
.dx-greeting-badge { width: 60px; height: 60px; border-radius: 18px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); display: grid; place-items: center; margin: 0 auto 16px; }
.dx-greeting h2 { margin: 0 0 8px; font-size: 1.5rem; font-weight: 700; }
.dx-greeting p { color: var(--text-muted, #64748B); font-size: 0.95rem; line-height: 1.6; }
.dx-suggestions { display: flex; flex-direction: column; gap: 10px; margin-top: 24px; }
.dx-suggest { padding: 13px 16px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-secondary, #334155); cursor: pointer; font-size: 0.9rem; text-align: left; transition: all 0.15s; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.dx-suggest:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); transform: translateY(-1px); }
.dx-msg { display: flex; gap: 10px; max-width: 80%; }
.dx-msg.user { margin-left: auto; flex-direction: row-reverse; }
.dx-msg-avatar { width: 32px; height: 32px; border-radius: 10px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); display: grid; place-items: center; flex-shrink: 0; margin-top: 2px; }
.dx-msg-body { display: flex; flex-direction: column; min-width: 0; }
.dx-msg.user .dx-msg-body { align-items: flex-end; }
.dx-bubble { padding: 12px 16px; border-radius: 16px; line-height: 1.55; font-size: 0.92rem; }
.dx-bubble p { margin: 0; }
.dx-bubble.user { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); border-bottom-right-radius: 5px; }
/* Assistant replies read as plain text on the page (ChatGPT/Claude style) — no
   card, border or shadow. Only the user's own message keeps a bubble. */
.dx-msg.bot .dx-msg-body { width: 100%; }
.dx-msg-time { font-size: 0.68rem; color: var(--text-muted, #94A3B8); margin: 4px 6px 0; }
.dx-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 0.68rem; font-weight: 700; padding: 3px 9px; border-radius: 99px; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.03em; }
.dx-pill.lg { font-size: 0.78rem; padding: 5px 12px; }
.dx-pill.sev-low { background: var(--sev-low-soft); color: var(--sev-low); } .dx-pill.sev-moderate { background: var(--sev-moderate-soft); color: var(--sev-moderate); }
.dx-pill.sev-high { background: var(--sev-high-soft); color: var(--sev-high); } .dx-pill.sev-emergency { background: var(--sev-emergency-soft); color: var(--sev-emergency); }
.dx-typing { background: transparent; border: none; padding: 10px 0; display: flex; gap: 5px; align-items: center; }
.dx-typing span { width: 7px; height: 7px; border-radius: 50%; background: #CBD5E1; animation: dx-bounce 1.2s infinite ease-in-out; }
.dx-typing span:nth-child(2) { animation-delay: 0.15s; } .dx-typing span:nth-child(3) { animation-delay: 0.3s; }
@keyframes dx-bounce { 0%,60%,100% { transform: translateY(0); opacity: 0.4; } 30% { transform: translateY(-5px); opacity: 1; } }

.dx-emergency { margin: 16px 22px 0; background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); border-radius: 14px; padding: 14px 16px; overflow: hidden; }
.dx-emergency-head { display: flex; justify-content: space-between; align-items: center; font-weight: 700; color: var(--primary, #C4504B); }
.dx-emergency-head span { display: inline-flex; align-items: center; gap: 6px; }
.dx-emergency-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.dx-ea { display: inline-flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 9px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 0.8rem; font-weight: 600; cursor: pointer; text-decoration: none; }
.dx-ea:hover:not(:disabled) { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-ea.danger { background: var(--sev-emergency, #DC2626); color: #fff; border-color: var(--sev-emergency, #DC2626); }
.dx-ea:disabled { opacity: 0.5; cursor: not-allowed; }
.dx-emergency-dismiss { background: transparent; border: none; color: var(--text-muted, #64748B); font-size: 0.78rem; cursor: pointer; text-decoration: underline; }

.dx-chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 30px 0; }
.dx-chip { display: inline-flex; align-items: center; gap: 6px; background: var(--surface-2, #F1F5F9); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 20px; padding: 5px 8px 5px 11px; font-size: 0.78rem; max-width: 220px; }
.dx-chip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-chip-thumb { width: 22px; height: 22px; border-radius: 5px; object-fit: cover; flex-shrink: 0; }
/* attachment preview cards (before sending) — thumbnail on top, name below */
.dx-attcard { position: relative; width: 132px; display: flex; flex-direction: column; gap: 6px; padding: 8px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; box-shadow: 0 1px 3px rgba(16,24,40,0.06); }
.dx-attcard.uploading { opacity: 0.75; }
.dx-attcard.failed { border-color: var(--sev-emergency-border, #F0CFCD); background: var(--sev-emergency-soft, #FBF1F0); }
.dx-attcard-thumb { width: 100%; height: 104px; border-radius: 8px; overflow: hidden; background: var(--surface-2, #F1F5F9); display: grid; place-items: center; color: var(--text-muted, #94A3B8); }
.dx-attcard-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dx-attcard-name { font-size: 0.74rem; color: var(--text-secondary, #334155); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-attcard-status { font-size: 0.68rem; color: var(--text-muted, #64748B); }
.dx-attcard-status.err { color: var(--primary, #C4504B); }
.dx-attcard-x { position: absolute; top: 5px; right: 5px; z-index: 1; width: 22px; height: 22px; border-radius: 50%; border: none; background: rgba(15,23,42,0.55); color: #fff; cursor: pointer; display: grid; place-items: center; }
.dx-attcard-x:hover { background: var(--primary, #C4504B); }
/* attachments shown inside a chat message */
.dx-msg-atts { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.dx-msg.user .dx-msg-atts { justify-content: flex-end; }
.dx-att-img { padding: 0; border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; overflow: hidden; cursor: pointer; background: var(--bg-surface, #fff); line-height: 0; }
.dx-att-img img { width: auto; height: auto; max-width: min(300px, 72vw); max-height: 340px; object-fit: contain; display: block; }
.dx-att-doc { display: inline-flex; align-items: center; gap: 8px; max-width: 240px; padding: 9px 12px; border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; background: var(--bg-surface, #fff); color: var(--text-secondary, #334155); cursor: pointer; font-size: 0.85rem; }
.dx-att-doc:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-att-doc svg { color: var(--primary, #C4504B); flex-shrink: 0; }
.dx-att-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dx-chip.uploading { opacity: 0.7; }
.dx-chip.failed { border-color: var(--sev-emergency-border, #F0CFCD); background: var(--sev-emergency-soft, #FBF1F0); }
.dx-chip-status { font-size: 0.6rem; font-weight: 800; color: var(--text-muted, #94A3B8); letter-spacing: 1px; }
.dx-chip-status.err { color: var(--primary, #C4504B); font-size: 0.85rem; letter-spacing: 0; }
.dx-chip button { border: none; background: transparent; color: var(--text-muted, #64748B); cursor: pointer; display: grid; place-items: center; padding: 2px; }
.dx-inputbar { display: flex; align-items: center; gap: 8px; margin: 14px 30px 22px; padding: 8px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; box-shadow: 0 2px 10px rgba(16,24,40,0.05); }
.dx-inputbar:focus-within { border-color: var(--primary, #C4504B); box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.1)); }
.dx-inputbar input[type=text] { flex: 1; border: none; outline: none; background: transparent; font-size: 0.95rem; padding: 8px 6px; color: var(--text-primary, #0F172A); }
.dx-attach-wrap { position: relative; display: flex; }
.dx-icon-btn { width: 40px; height: 40px; border-radius: 11px; border: none; background: transparent; color: var(--text-muted, #64748B); display: grid; place-items: center; cursor: pointer; transition: all 0.15s; flex-shrink: 0; }
.dx-icon-btn:hover { background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); }
.dx-icon-btn.active { background: var(--primary, #C4504B); color: #fff; }
.dx-icon-btn.listening { background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); animation: dx-pulse 1.2s infinite; }
@keyframes dx-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(196, 80, 75,0.4);} 50% { box-shadow: 0 0 0 6px rgba(196, 80, 75,0);} }
.dx-send { width: 44px; height: 44px; border-radius: 12px; border: none; background: var(--primary, #C4504B); color: #fff; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
.dx-send:hover:not(:disabled) { background: var(--primary-hover, #A93F3B); }
.dx-send:disabled { opacity: 0.5; cursor: not-allowed; }
.dx-attach-menu { position: absolute; bottom: calc(100% + 10px); left: 0; min-width: 175px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 12px; box-shadow: 0 10px 25px rgba(16,24,40,0.12); padding: 6px; display: flex; flex-direction: column; gap: 2px; z-index: 50; }
.dx-attach-menu button { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: none; background: transparent; color: var(--text-primary, #0F172A); border-radius: 8px; cursor: pointer; font-size: 0.9rem; text-align: left; }
.dx-attach-menu button:hover { background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); }
.dx-attach-menu svg { color: var(--primary, #C4504B); }

/* analysis drawer */
.dx-right { position: fixed; top: 0; right: 0; height: 100%; width: 360px; max-width: 90vw; z-index: 1300; transform: translateX(100%); transition: transform 0.25s ease; background: var(--bg-body, #F8FAFC); border-left: 1px solid var(--border-subtle, #E5E7EB); display: flex; flex-direction: column; box-shadow: -12px 0 40px rgba(0,0,0,0.12); }
.dx-right.open { transform: translateX(0); }
.dx-right-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 18px; border-bottom: 1px solid var(--border-subtle, #E5E7EB); font-weight: 700; }
.dx-right-head > span { display: inline-flex; align-items: center; gap: 8px; }
.dx-right-head svg { color: var(--primary, #C4504B); }
.dx-analysis { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.dx-acard { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; padding: 14px; }
.dx-acard p { margin: 0; font-size: 0.88rem; line-height: 1.6; }
.dx-acard-h { display: flex; align-items: center; gap: 7px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #64748B); margin-bottom: 9px; }
.dx-acard-h svg { color: var(--primary, #C4504B); }
.dx-acard.sev-low { border-color: var(--sev-low-border); } .dx-acard.sev-moderate { border-color: var(--sev-moderate-border); }
.dx-acard.sev-high { border-color: var(--sev-high-border); } .dx-acard.sev-emergency { border-color: var(--sev-emergency-border); }
.dx-acard-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.dx-risk { display: inline-flex; align-items: center; gap: 5px; font-weight: 800; font-size: 1.05rem; }
.dx-risk small { font-size: 0.7rem; color: var(--text-muted, #94A3B8); font-weight: 500; }
.dx-riskbar { height: 8px; background: var(--surface-2, #F1F5F9); border-radius: 99px; overflow: hidden; }
.dx-riskbar-fill { height: 100%; border-radius: 99px; transition: width 0.5s ease; }
.dx-riskbar-fill.sev-low { background: var(--sev-low); } .dx-riskbar-fill.sev-moderate { background: var(--sev-moderate); }
.dx-riskbar-fill.sev-high { background: var(--sev-high); } .dx-riskbar-fill.sev-emergency { background: var(--sev-emergency); }
.dx-muted-text { color: var(--text-muted, #64748B); font-size: 0.83rem; }
.dx-disclaimer { font-size: 0.72rem; color: var(--text-muted, #94A3B8); text-align: center; padding: 4px 8px; }
.dx-analysis-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; color: var(--text-muted, #94A3B8); text-align: center; padding: 30px; }
.dx-analysis-empty p { font-size: 0.85rem; max-width: 220px; }

.db-scrim { display: none; }
.dx-right.open ~ .db-scrim, .db-tabs.open ~ .db-scrim { display: block; }
.dx-toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #1E293B; color: #fff; padding: 11px 20px; border-radius: 12px; z-index: 3000; cursor: pointer; box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-size: 0.85rem; }

/* Appearance: theme toggle (Settings) */
.dx-theme-toggle { display: flex; gap: 10px; }
.dx-theme-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border-radius: 12px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-secondary, #334155); font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.15s; }
.dx-theme-btn:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.dx-theme-btn.active { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.dx-theme-btn svg { flex-shrink: 0; }
.only-mobile { display: none; }

/* responsive */
@media (max-width: 1024px) {
  .db-view.chat-view { flex-direction: column; }
}
@media (max-width: 760px) {
  .db-tabs { position: fixed; top: 0; left: 0; height: 100%; width: 82%; max-width: 300px; z-index: 1400; transform: translateX(-100%); transition: transform 0.25s ease; box-shadow: 12px 0 40px rgba(0,0,0,0.12); }
  .db-tabs.open { transform: translateX(0); }
  .db-scrim { display: block; position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1350; }
  .only-mobile { display: grid; }
  .dx-chat { padding: 18px; } .dx-inputbar { margin: 12px 16px 18px; } .dx-msg { max-width: 92%; }
  .db-view.scroll-view { padding: 16px; }
}

/* ===== History tab ===== */
.dh-wrap { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
.dh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; }
.dh-head h3 { margin: 0; font-size: 1.05rem; font-weight: 700; }
.dh-head p { margin: 4px 0 0; font-size: 0.84rem; color: var(--text-muted, #64748B); }
.dh-search { display: flex; align-items: center; gap: 8px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-muted, #64748B); }
.dh-search input { flex: 1; border: none; outline: none; background: transparent; font: inherit; color: var(--text-primary, #0F172A); }
.dh-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 48px 0; color: var(--text-muted, #64748B); }
.dh-empty p { margin: 0; font-size: 0.88rem; }
.dh-group { display: flex; flex-direction: column; gap: 6px; }
.dh-group-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #64748B); padding: 10px 4px 2px; }
.dh-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); cursor: pointer; transition: border-color 0.15s; }
.dh-item:hover { border-color: var(--primary, #C4504B); }
.dh-item.active { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.dh-item-ic { display: grid; place-items: center; width: 22px; color: var(--text-muted, #64748B); flex-shrink: 0; }
.dh-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--text-muted, #94A3B8); }
.dh-dot.sev-low { background: var(--sev-low, #059669); } .dh-dot.sev-moderate { background: var(--sev-moderate, #CA8A04); }
.dh-dot.sev-high { background: var(--sev-high, #EA580C); } .dh-dot.sev-emergency { background: var(--sev-emergency, #DC2626); }
.dh-item-main { display: flex; flex-direction: column; flex: 1; min-width: 0; }
.dh-item-title { font-size: 0.9rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dh-item-time { font-size: 0.72rem; color: var(--text-muted, #94A3B8); }
.dh-item-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; opacity: 0; transition: opacity 0.15s; }
.dh-item:hover .dh-item-actions, .dh-item:focus-within .dh-item-actions { opacity: 1; }
@media (max-width: 760px) { .dh-item-actions { opacity: 1; } }

/* ===== Always-legible form text (some inputs inherited the browser default,
   which disappeared against the themed surfaces) ===== */
.db-shell input, .db-shell textarea, .db-shell select { color: var(--text-primary, #0F172A); background-color: transparent; caret-color: var(--primary, #C4504B); }
.db-shell input::placeholder, .db-shell textarea::placeholder { color: var(--text-muted, #94A3B8); opacity: 1; }
.db-shell option { color: var(--text-primary, #0F172A); background: var(--bg-surface, #fff); }

/* ===== Authentication tab ===== */
.da-form { display: flex; flex-direction: column; gap: 14px; }
.da-field { display: flex; flex-direction: column; gap: 6px; }
.da-label { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary, #334155); }
.da-input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font: inherit; outline: none; transition: border-color 0.15s; }
.da-input:focus { border-color: var(--primary, #C4504B); }
.da-input.invalid { border-color: var(--sev-emergency, #DC2626); }
.da-err { font-size: 0.75rem; color: var(--sev-emergency, #DC2626); }
.da-alert { display: flex; align-items: center; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; }
.da-alert.error { background: var(--sev-emergency-soft, #FEF2F2); border: 1px solid var(--sev-emergency-border, #FECACA); color: var(--sev-emergency, #DC2626); }
.da-alert.ok { background: var(--sev-low-soft, #ECFDF5); border: 1px solid var(--sev-low-border, #A7F3D0); color: var(--sev-low, #059669); }
.da-actions { display: flex; justify-content: flex-end; }
.da-note { margin: 12px 0 0; font-size: 0.8rem; line-height: 1.55; color: var(--text-muted, #64748B); }
.info-row-label { display: inline-flex; align-items: center; gap: 6px; }

/* ===== Per-message menu (Unsend) — sits to the LEFT of your own message ===== */
.dx-userline { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
.dx-msgmenu { position: relative; flex-shrink: 0; }
.dx-msgmenu-btn { display: grid; place-items: center; width: 28px; height: 28px; border: none; border-radius: 8px; background: transparent; color: var(--text-muted, #94A3B8); cursor: pointer; opacity: 0; transition: opacity 0.15s, background 0.15s; }
.dx-msg:hover .dx-msgmenu-btn, .dx-msgmenu-btn:focus-visible, .dx-msgmenu-btn[aria-expanded="true"] { opacity: 1; }
.dx-msgmenu-btn:hover { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); }
.dx-msgmenu-pop { position: absolute; right: 0; top: 34px; z-index: 20; min-width: 150px; padding: 6px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); box-shadow: 0 10px 26px rgba(16,24,40,0.14); }
.dx-msgmenu-pop button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 10px; border: none; border-radius: 8px; background: transparent; color: var(--sev-emergency, #DC2626); font: inherit; font-weight: 600; font-size: 0.84rem; cursor: pointer; text-align: left; }
.dx-msgmenu-pop button:hover { background: var(--sev-emergency-soft, #FEF2F2); }
@media (max-width: 760px) { .dx-msgmenu-btn { opacity: 1; } }
`
