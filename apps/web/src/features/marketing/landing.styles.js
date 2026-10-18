// Home page. Tokens only, so it is theme-proof in light and dark.
export const LANDING_CSS = `
.lx { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; background: var(--bg); }
.lx main { flex: 1; overflow-x: clip; } /* entrance offsets must never widen the page */
.lx main:focus { outline: none; }
.lx-inner { max-width: var(--content-page); margin: 0 auto; padding: 0 var(--space-8); }

/* ----- header ----- */
.lx-nav { position: sticky; top: 0; z-index: var(--z-sticky); background: var(--bg); border-bottom: 1px solid var(--border-subtle); padding-top: env(safe-area-inset-top); }
.lx-nav-inner { max-width: var(--content-page); margin: 0 auto; display: flex; align-items: center; gap: var(--space-8); min-height: 4.5rem; padding: 0 var(--space-8); }
.lx-logo { display: inline-flex; align-items: center; min-height: var(--touch); border-radius: var(--radius-control); }
.lx-links { display: flex; gap: var(--space-1); flex: 1; }
.lx-links a {
  display: inline-flex; align-items: center; min-height: var(--touch); padding: 0 var(--space-3); border-radius: var(--radius-pill);
  font-size: var(--fs-md); font-weight: var(--fw-medium); color: var(--text-secondary);
  transition: background-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard);
}
.lx-links a:hover { color: var(--text-primary); background: var(--surface-hover); }
.lx-nav-cta { display: flex; align-items: center; gap: var(--space-2); }
.lx-burger { display: none; margin-left: auto; }
.lx-mobile-menu { display: none; }

/* ----- eyebrow ----- */
.lx-eyebrow { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--primary-text); }

/* ----- hero ----- */
.lx-hero {
  max-width: var(--content-page); margin: 0 auto; padding: var(--space-20) var(--space-8) var(--space-16);
  display: flex; flex-direction: column; align-items: center; text-align: center;
}
.lx-hero > * { animation: sk-rise 320ms var(--ease-enter) both; }
.lx-hero > :nth-child(2) { animation-delay: 40ms; } .lx-hero > :nth-child(3) { animation-delay: 80ms; }
.lx-hero > :nth-child(4) { animation-delay: 120ms; }
.lx-hero > .lx-hero-note { animation: none; } /* carries call 108: never animated in */
.lx-hero > .sc-stage { animation: none; } /* framer handles its entrance */
.lx-hero > .lx-eyebrow {
  display: inline-flex; align-items: center; min-height: 2rem; padding: var(--space-1) var(--space-4); border-radius: 1rem; text-wrap: balance;
  background: var(--primary-soft); border: 1px solid var(--primary-border);
}
.lx-hero h1 {
  margin-top: var(--space-6); max-width: 24ch;
  font-size: clamp(2.25rem, 1.5rem + 2.6vw, 3.25rem); line-height: 1.08; font-weight: var(--fw-semibold); letter-spacing: -0.032em;
}
.lx-hero h1 span { display: block; color: var(--primary-text); }
.lx-hero-lead { margin-top: var(--space-5); max-width: 38rem; font-size: var(--fs-lg); line-height: 1.6; color: var(--text-secondary); }

/* the question box: the focal point */
.lx-ask-wrap { width: 100%; max-width: 46rem; margin-top: var(--space-10); display: flex; flex-direction: column; gap: var(--space-5); text-align: left; }
.lx-ask {
  display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-5) var(--space-5) var(--space-4);
  background: var(--surface); border: 1px solid var(--border-default); border-radius: 1.5rem;
  box-shadow: var(--shadow-lift);
  transition: border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard);
}
.lx-ask:focus-within { border-color: var(--primary); box-shadow: 0 0 0 1px var(--primary), 0 0 0 5px var(--focus-halo); }
/* Guest chat: the same card grows into a conversation. */
.lx-ask-form { display: flex; flex-direction: column; gap: var(--space-2); }
.lx-ask--chat { padding: 0; gap: 0; overflow: hidden; }
.lx-ask--chat:focus-within { border-color: var(--border-default); box-shadow: var(--shadow-lift); }
.lx-chat-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--space-3) var(--space-4); padding: var(--space-4) var(--space-5); border-bottom: 1px solid var(--border-subtle); }
.lx-chat-who { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.lx-chat-avatar { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }
.lx-chat-title { display: block; font-size: var(--fs-md); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-primary); }
.lx-chat-id { margin-left: var(--space-2); font-size: var(--fs-xs); font-weight: var(--fw-medium); color: var(--text-muted); font-variant-numeric: tabular-nums; letter-spacing: 0.02em; }
.lx-chat-sub { display: block; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.lx-chat-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.lx-chat-log {
  display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-5);
  min-height: 12rem; max-height: min(62vh, 38rem); overflow-y: auto; overscroll-behavior: contain; background: var(--bg);
}
.lx-chat-log:focus-visible { outline-offset: -3px; }
.lx-ask-form--chat { flex-direction: row; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-3) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--surface); }
.lx-ask-form--chat:focus-within { box-shadow: inset 0 0 0 2px var(--primary); }
.lx-ask-form--chat .lx-ask-input { flex: 1 1 12rem; width: auto; min-height: var(--touch); max-height: 9rem; padding: 0.5625rem 0; font-size: var(--fs-md); }
.lx-ask-form--chat .lx-ask-foot { padding-top: 0; border-top: 0; }
.lx-ask-form--chat .lx-ask-error { order: 3; flex-basis: 100%; }
.lx-chat-limit { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3) var(--space-4); padding: var(--space-4) var(--space-5); border-top: 1px solid var(--border-subtle); }
.lx-chat-limit p { flex: 1 1 18rem; font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.lx-ask-label { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); color: var(--text-primary); }
.lx-ask-input {
  width: 100%; min-height: 5.5rem; max-height: 14rem; padding: var(--space-1) 0; border: 0; background: transparent; resize: none;
  font-size: var(--fs-lg); line-height: 1.55; color: var(--text-primary); field-sizing: content;
}
.lx-ask-input:focus-visible { outline: none; }
.lx-ask-error { font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); color: var(--danger); }
.lx-ask-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--border-subtle); }
.lx-ask-help { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.lx-ask-send { flex-shrink: 0; }

.lx-starters { display: flex; flex-direction: column; gap: var(--space-3); }
.lx-starters-label { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); text-align: center; }
.lx-starters-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); list-style: none; margin: 0; padding: 0; }
.lx-starter {
  display: flex; align-items: center; gap: var(--space-3); width: 100%; height: 100%; min-height: 3.5rem; padding: var(--space-3);
  border: 1px solid var(--border-default); border-radius: var(--radius-card); background: transparent;
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); color: var(--text-primary); text-align: left;
  transition: background-color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard);
}
.lx-starter:hover { background: var(--surface); border-color: var(--primary-border); }
.lx-starter-icon { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }

.lx-hero-note { margin-top: var(--space-8); max-width: 42rem; display: flex; align-items: flex-start; gap: var(--space-2); text-align: left; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.lx-hero-note svg { color: var(--primary); margin-top: 0.125rem; }

/* ----- sections ----- */
.lx-section { padding: var(--space-24) 0; scroll-margin-top: 4rem; }
.lx-section--surface { background: var(--surface); border-block: 1px solid var(--border-subtle); }
.lx-section-head { display: flex; flex-direction: column; gap: var(--space-3); max-width: 40rem; margin-bottom: var(--space-12); }
.lx-section-head h2, .lx-cta h2 { font-size: clamp(1.75rem, 1.35rem + 1.3vw, 2.25rem); line-height: 1.18; font-weight: var(--fw-semibold); letter-spacing: -0.025em; }
.lx-section-head > p:last-child:not(.lx-eyebrow) { font-size: var(--fs-lg); line-height: 1.6; color: var(--text-secondary); }

/* how it works: steps + what an answer shows */
.lx-how { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 26rem); gap: 0 var(--space-16); align-items: start; }
.lx-how > .lx-section-head { grid-column: 1 / -1; }
.lx-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.lx-step { position: relative; display: flex; gap: var(--space-5); padding-bottom: var(--space-8); }
.lx-step:last-child { padding-bottom: 0; }
.lx-step:not(:last-child)::before { content: ""; position: absolute; left: 1.25rem; top: 3rem; bottom: var(--space-2); width: 1px; background: var(--border-default); }
.lx-step-n {
  display: grid; place-items: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: var(--radius-pill);
  background: var(--primary-soft); color: var(--primary-text); font-size: var(--fs-md); font-weight: var(--fw-semibold);
}
.lx-step h3, .lx-feature h3, .lx-limit h3, .lx-trust-item h3, .lx-anatomy h3, .lx-emergency h3 { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); }
.lx-step p, .lx-feature p, .lx-trust-item p, .lx-emergency p { margin-top: var(--space-1); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.lx-step > div { padding-top: var(--space-2); }

.lx-anatomy { padding: var(--space-6) var(--space-6) var(--space-2); border: 1px solid var(--border-subtle); border-radius: 1.25rem; background: var(--bg); }
.lx-anatomy dl { margin: var(--space-4) 0 0; display: flex; flex-direction: column; }
.lx-anatomy dl > div { padding: var(--space-4) 0; border-top: 1px solid var(--border-subtle); }
.lx-anatomy dt { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); }
.lx-anatomy dd { margin: var(--space-1) 0 0; font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-secondary); }
.lx-levels { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-1); }

/* features */
.lx-features { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-12) var(--space-10); list-style: none; margin: 0; padding: 0; }
.lx-feature { display: flex; flex-direction: column; gap: var(--space-1); }
.lx-feature-icon { display: grid; place-items: center; width: 3rem; height: 3rem; margin-bottom: var(--space-3); border-radius: var(--radius-card); background: var(--primary-soft); color: var(--primary-text); }

/* safety */
.lx-limits { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-5); }
.lx-limit { padding: var(--space-6); border: 1px solid var(--border-subtle); border-radius: 1.25rem; background: var(--bg); }
.lx-limit ul { list-style: none; margin: var(--space-4) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.lx-limit li { display: flex; align-items: flex-start; gap: var(--space-3); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); }
.lx-limit li svg { margin-top: 0.1875rem; }
.lx-limit-yes { color: var(--primary); }
.lx-limit-no { color: var(--text-muted); }
.lx-trust { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-8) var(--space-10); margin-top: var(--space-12); }
.lx-trust-item { display: flex; gap: var(--space-4); }
.lx-trust-item > svg { color: var(--primary); margin-top: 0.1875rem; }
.lx-emergency {
  display: flex; align-items: center; justify-content: space-between; gap: var(--space-6); margin-top: var(--space-12);
  padding: var(--space-6); border: 1px solid var(--sev-emergency-border); border-radius: 1.25rem; background: var(--bg);
}
.lx-emergency h3 { color: var(--text-primary); }
.lx-easy { margin-top: var(--space-12); padding-top: var(--space-10); border-top: 1px solid var(--border-subtle); }
.lx-easy h3 { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); }
.lx-easy ul { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: var(--space-4); margin: var(--space-5) 0 0; padding: 0; list-style: none; }
.lx-easy li { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); border-radius: var(--radius-card); background: var(--bg); border: 1px solid var(--border-subtle); font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); }
.lx-easy-icon { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0; border-radius: var(--radius-pill); background: var(--primary-soft); color: var(--primary-text); }
.lx-cta-mark { width: 3rem; height: 3rem; border-radius: var(--radius-card); margin-bottom: var(--space-2); }
.lx-emergency-actions { display: flex; gap: var(--space-3); flex-shrink: 0; }

/* faq */
.lx-faq-layout { display: grid; grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); gap: var(--space-16); align-items: start; }
.lx-faq-layout > .lx-section-head { margin-bottom: 0; }
.lx-faq { display: flex; flex-direction: column; border-top: 1px solid var(--border-default); }
.lx-faq-item { border-bottom: 1px solid var(--border-default); }
.lx-faq-item h3 { font-size: inherit; }
.lx-faq-q {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: 4rem; padding: var(--space-5) 0;
  border: 0; background: transparent; text-align: left; font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); color: var(--text-primary);
}
.lx-faq-q:hover { color: var(--primary-text); }
.lx-faq-q svg { color: var(--text-muted); transition: transform var(--dur-base) var(--ease-standard); }
.lx-faq-item.is-open .lx-faq-q svg { transform: rotate(180deg); }
.lx-faq-a { padding: 0 var(--space-10) var(--space-6) 0; animation: sk-rise var(--dur-base) var(--ease-enter); }
.lx-faq-a p { font-size: var(--fs-md); line-height: 1.65; color: var(--text-secondary); max-width: 40rem; }

/* closing call to action */
.lx-cta { padding: 0 var(--space-8) var(--space-24); }
.lx-cta-inner {
  max-width: var(--content-page); margin: 0 auto; padding: var(--space-16) var(--space-8); border-radius: 1.75rem;
  background: var(--surface-tint); border: 1px solid var(--primary-border);
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-4);
}
.lx-cta-inner p { max-width: 34rem; font-size: var(--fs-lg); line-height: 1.6; color: var(--text-secondary); }
.lx-cta-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: var(--space-3); margin-top: var(--space-3); }

/* ----- footer ----- */
.lx-footer { background: var(--surface); border-top: 1px solid var(--border-subtle); padding-bottom: env(safe-area-inset-bottom); }
.lx-footer-inner { max-width: var(--content-page); margin: 0 auto; padding: var(--space-12) var(--space-8) var(--space-10); display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: var(--space-10); }
.lx-foot-brand { display: flex; flex-direction: column; gap: var(--space-3); }
.lx-foot-brand p { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); max-width: 24rem; }
.lx-foot-cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-6); }
.lx-foot-cols > div { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-1); }
.lx-foot-head { margin-bottom: var(--space-2); font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); color: var(--text-primary); }
.lx-foot-cols a, .lx-foot-link {
  display: inline-flex; align-items: center; gap: var(--space-2); min-height: var(--touch); min-width: var(--touch); padding: 0; border: 0; background: transparent;
  font-size: var(--fs-md); line-height: var(--lh-sm); color: var(--text-secondary); text-align: left;
}
.lx-foot-cols a:hover, .lx-foot-link:hover { color: var(--text-primary); text-decoration: underline; text-underline-offset: 3px; }
.lx-foot-cols a[href^="tel"] { color: var(--sev-emergency-ink); font-weight: var(--fw-semibold); }
.lx-foot-bottom { max-width: var(--content-page); margin: 0 auto; padding: var(--space-5) var(--space-8); border-top: 1px solid var(--border-subtle); font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }

@media (prefers-reduced-motion: reduce) { .lx-hero > *, .lx-faq-a { animation: none; } }

@media (max-width: 1023px) {
  .lx-how, .lx-faq-layout { grid-template-columns: minmax(0, 1fr); }
  .lx-anatomy { margin-top: var(--space-10); }
  .lx-faq-layout > .lx-section-head { margin-bottom: var(--space-6); }
  .lx-features { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lx-trust { grid-template-columns: minmax(0, 1fr); }
  .lx-easy ul { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lx-links a { padding: 0 var(--space-2); }
  .lx-nav-inner { gap: var(--space-4); }
}
@media (max-width: 899px) {
  .lx-links, .lx-nav-cta { display: none; }
  .lx-burger { display: inline-grid; }
  .lx-mobile-menu { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2) var(--space-5) var(--space-5); border-top: 1px solid var(--border-subtle); background: var(--bg); animation: ui-pop var(--dur-fast) var(--ease-enter); }
  .lx-mobile-menu nav { display: flex; flex-direction: column; }
  .lx-mobile-menu nav a { display: flex; align-items: center; min-height: 3rem; font-size: var(--fs-lg); font-weight: var(--fw-medium); border-bottom: 1px solid var(--border-subtle); }
  .lx-mobile-actions { display: flex; flex-direction: column; gap: var(--space-2); }
}
@media (max-width: 767px) {
  .lx-inner, .lx-nav-inner, .lx-hero, .lx-footer-inner, .lx-foot-bottom { padding-left: var(--space-5); padding-right: var(--space-5); }
  .lx-nav-inner { min-height: 4rem; }
  .lx-hero { padding-top: var(--space-12); padding-bottom: var(--space-12); }
  .lx-hero h1 { max-width: 14ch; }
  .lx-hero h1 span { display: inline; }
  .lx-hero-lead { font-size: var(--fs-md); }
  .lx-hero > .lx-eyebrow { font-size: var(--fs-xs); line-height: var(--lh-xs); }
  .lx-ask-wrap { margin-top: var(--space-8); }
  .lx-ask { padding: var(--space-4); border-radius: 1.25rem; }
  .lx-ask--chat { padding: 0; }
  .lx-starters-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .lx-chat-head { padding: var(--space-3) var(--space-4); }
  .lx-chat-log { padding: var(--space-4) var(--space-3); max-height: 65vh; }
  .lx-ask-form--chat { padding-left: var(--space-4); }
  .lx-section { padding: var(--space-16) 0; }
  .lx-section-head { margin-bottom: var(--space-8); }
  .lx-features, .lx-limits, .lx-trust, .lx-easy ul { grid-template-columns: minmax(0, 1fr); }
  .lx-easy li { flex-direction: row; align-items: center; padding: var(--space-4); }
  .lx-features { gap: var(--space-8); }
  .lx-emergency { flex-direction: column; align-items: stretch; }
  .lx-emergency-actions { flex-direction: column; }
  .lx-cta { padding: 0 var(--space-4) var(--space-16); }
  .lx-cta-inner { padding: var(--space-10) var(--space-5); }
  .lx-cta-actions { flex-direction: column; align-self: stretch; }
  .lx-footer-inner { grid-template-columns: minmax(0, 1fr); padding-top: var(--space-10); gap: var(--space-8); }
}
@media (max-width: 479px) {
  .lx-ask-form:not(.lx-ask-form--chat) .lx-ask-foot { flex-direction: column; align-items: stretch; }
  .lx-ask-form:not(.lx-ask-form--chat) .lx-ask-send { width: 100%; }
  .lx-chat-actions { width: 100%; }
  .lx-chat-actions .ui-btn { flex: 1; }
  .lx-hero-note { margin-top: var(--space-6); }
  .lx-foot-cols { grid-template-columns: minmax(0, 1fr); }
}
`
