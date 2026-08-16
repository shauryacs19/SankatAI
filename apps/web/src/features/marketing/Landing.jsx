import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  HeartPulse, Stethoscope, Activity, ShieldCheck, Siren, MapPin,
  MessageSquare, Lock, Zap, ArrowRight, Menu, X, ChevronDown,
  BookOpen, Cpu, Server, FileText, Phone, Image as ImageIcon,
} from 'lucide-react'

const FLOW = [
  { Icon: MessageSquare, label: 'Prompt' },
  { Icon: Cpu, label: 'NLP & Vision', sub: true },
  { Icon: Server, label: 'ML models' },
  { Icon: Activity, label: 'Severity score' },
]
import { AUTH_STATUS, useAuth } from '../../context/AuthContext.jsx'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Documentation', href: '#docs' },
  { label: 'FAQ', href: '#faq' },
]

const FEATURES = [
  { Icon: Activity, title: 'AI symptom triage', text: 'Describe symptoms in plain language and get a severity rating, risk score, and clear next steps in seconds.' },
  { Icon: Zap, title: 'Works offline', text: 'A built-in keyword engine keeps triage running even when the AI service is unavailable.' },
  { Icon: Stethoscope, title: 'Personal medical profile', text: 'Blood group, allergies, conditions and medications give the AI the context it needs.' },
  { Icon: Siren, title: 'One-tap emergency', text: 'Instant ambulance dialing, contact alerts, location sharing and nearby-hospital search.' },
  { Icon: MessageSquare, title: 'Consultation history', text: 'Every conversation is saved and organised so you can revisit past assessments any time.' },
  { Icon: ShieldCheck, title: 'Secure by design', text: 'Sign-in is backed by Amazon Cognito; your data is tied to your verified account.' },
]

const STEPS = [
  { n: '01', title: 'Create your profile', text: 'Sign in and add your medical details — takes under two minutes.' },
  { n: '02', title: 'Describe your symptoms', text: 'Chat naturally. The AI asks follow-ups and assesses urgency.' },
  { n: '03', title: 'Act with confidence', text: 'Get a severity level, guidance, and emergency actions when it matters.' },
]

const DOCS = [
  { Icon: BookOpen, title: 'Getting started', text: 'Set up the app, sign in, and run your first consultation.' },
  { Icon: Cpu, title: 'Architecture', text: 'How the React frontend, FastAPI backend and AI triage fit together.' },
  { Icon: Lock, title: 'Security', text: 'Authentication, data handling and our privacy approach.' },
  { Icon: Server, title: 'Deployment', text: 'Containers, infrastructure and how the platform runs on AWS.' },
]

const FAQS = [
  { q: 'Is Sankat.AI a replacement for a doctor?', a: 'No. Sankat.AI provides guidance and triage to help you decide what to do next. It is not a diagnosis and never replaces professional medical care or emergency services.' },
  { q: 'What happens in a real emergency?', a: 'If the AI detects a possible emergency, the app surfaces one-tap actions to call an ambulance (108), alert your emergency contact, share your location, and find nearby hospitals.' },
  { q: 'Is my medical information private?', a: 'Your profile and consultations are tied to your verified account and are only accessible after you sign in.' },
  { q: 'Does it work without internet or the AI service?', a: 'Core triage still runs via an offline keyword engine, clearly marked as an estimate, so you always get a response.' },
]

function Landing() {
  const navigate = useNavigate()
  const { status } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)

  // Login: straight to the dashboard if the token is still valid, else sign-in.
  const goLogin = () => navigate(status === AUTH_STATUS.AUTHENTICATED ? '/app' : '/login')
  // Get started: open the login page in create-account mode.
  const goSignup = () => navigate('/login', { state: { mode: 'signup' } })

  const fadeUp = {
    initial: { opacity: 0, y: 24 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-80px' },
    transition: { duration: 0.5 },
  }

  return (
    <div className="lx">
      <style>{LX_CSS}</style>

      {/* Nav */}
      <header className="lx-nav">
        <div className="lx-nav-inner">
          <a href="#top" className="lx-logo"><HeartPulse size={22} /> Sankat<span>.AI</span></a>

          <nav className="lx-links">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>

          <div className="lx-nav-cta">
            <button className="lx-btn ghost" onClick={goLogin}>Login</button>
            <button className="lx-btn primary" onClick={goSignup}>Get started <ArrowRight size={16} /></button>
          </div>

          <button className="lx-burger" onClick={() => setMenuOpen((o) => !o)} aria-label="Menu">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="lx-mobile-menu">
            {NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.label}</a>)}
            <button className="lx-btn ghost full" onClick={goLogin}>Login</button>
            <button className="lx-btn primary full" onClick={goSignup}>Get started</button>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="lx-hero" id="top">
        <motion.div className="lx-hero-copy" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <span className="lx-badge"><Activity size={14} /> AI-powered medical triage</span>
          <h1>Know the right care, <span className="lx-hl">right away</span>.</h1>
          <p>Describe your symptoms and Sankat.AI gives you clear, personalised guidance — what to do now, first-aid steps, and instant emergency actions when they're needed.</p>
          <div className="lx-hero-actions">
            <button className="lx-btn primary lg" onClick={goSignup}>Get started <ArrowRight size={18} /></button>
            <a className="lx-btn ghost lg" href="#how">See how it works</a>
          </div>
          <div className="lx-hero-note"><ShieldCheck size={15} /> Not a substitute for professional medical care.</div>

          <div className="lx-flow">
            <span className="lx-flow-title">How it works under the hood</span>
            <div className="lx-flow-track">
              {FLOW.map((f, i) => (
                <div className="lx-flow-cell" key={f.label}>
                  <motion.div
                    className="lx-flow-node"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.5 + i * 0.12 }}
                  >
                    <span className="lx-flow-ic">
                      <f.Icon size={18} />
                      {f.sub && <span className="lx-flow-ic-badge"><ImageIcon size={11} /></span>}
                    </span>
                    <span className="lx-flow-label">{f.label}</span>
                  </motion.div>
                  {i < FLOW.length - 1 && <ArrowRight className="lx-flow-arrow" size={16} />}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        <motion.div className="lx-hero-visual" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.1 }}>
          <div className="lx-mock">
            <div className="lx-mock-head"><HeartPulse size={16} /> AI Triage</div>
            <div className="lx-mock-msg user">I have chest pain and shortness of breath</div>
            <div className="lx-mock-msg bot">
              <span className="lx-mock-pill">Emergency · 95</span>
              Call emergency services immediately. Sit down, stay calm, and chew an aspirin if not allergic.
            </div>
            <div className="lx-mock-actions">
              <span className="lx-mock-action danger"><Siren size={13} /> Ambulance</span>
              <span className="lx-mock-action"><MapPin size={13} /> Hospital</span>
            </div>
          </div>

          {/* Floating accent panels */}
          <motion.div
            className="lx-float top"
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: [0, -7, 0] }}
            transition={{ opacity: { duration: 0.5, delay: 0.4 }, y: { duration: 4, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <div className="lx-float-icon danger"><Activity size={16} /></div>
            <div className="lx-float-body">
              <span className="lx-float-label">Risk score</span>
              <span className="lx-float-value">95<small>/100</small></span>
              <div className="lx-float-bar"><span style={{ width: '95%' }} /></div>
            </div>
          </motion.div>

          <motion.div
            className="lx-float bottom"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: [0, 7, 0] }}
            transition={{ opacity: { duration: 0.5, delay: 0.55 }, y: { duration: 4.5, repeat: Infinity, ease: 'easeInOut' } }}
          >
            <div className="lx-float-icon"><MapPin size={16} /></div>
            <div className="lx-float-body">
              <span className="lx-float-label">Nearest hospital</span>
              <span className="lx-float-value sm">City Care · 1.2 km</span>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="lx-section" id="features">
        <motion.div className="lx-section-head" {...fadeUp}>
          <span className="lx-eyebrow">Features</span>
          <h2>Everything you need in a medical emergency</h2>
          <p>Built to be calm, clear and fast when it matters most.</p>
        </motion.div>
        <div className="lx-grid">
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} className="lx-card" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.4, delay: i * 0.05 }} whileHover={{ y: -4 }}>
              <div className="lx-card-icon"><f.Icon size={22} /></div>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="lx-section alt" id="how">
        <motion.div className="lx-section-head" {...fadeUp}>
          <span className="lx-eyebrow">How it works</span>
          <h2>Three steps to a clear answer</h2>
        </motion.div>
        <div className="lx-steps">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} className="lx-step" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.4, delay: i * 0.1 }}>
              <span className="lx-step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Documentation */}
      <section className="lx-section" id="docs">
        <motion.div className="lx-section-head" {...fadeUp}>
          <span className="lx-eyebrow">Documentation</span>
          <h2>Learn how Sankat.AI works</h2>
          <p>Guides for using the app and understanding the platform underneath.</p>
        </motion.div>
        <div className="lx-docs-grid">
          {DOCS.map((d, i) => (
            <motion.button key={d.title} className="lx-doc" onClick={goLogin} initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.35, delay: i * 0.05 }} whileHover={{ y: -3 }}>
              <div className="lx-doc-icon"><d.Icon size={20} /></div>
              <div className="lx-doc-body">
                <h3>{d.title} <ArrowRight size={15} /></h3>
                <p>{d.text}</p>
              </div>
            </motion.button>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="lx-section alt" id="faq">
        <motion.div className="lx-section-head" {...fadeUp}>
          <span className="lx-eyebrow">FAQ</span>
          <h2>Questions, answered</h2>
        </motion.div>
        <div className="lx-faq">
          {FAQS.map((f, i) => (
            <div key={i} className={`lx-faq-item ${openFaq === i ? 'open' : ''}`}>
              <button className="lx-faq-q" onClick={() => setOpenFaq(openFaq === i ? -1 : i)}>
                {f.q} <ChevronDown size={18} />
              </button>
              {openFaq === i && (
                <motion.p className="lx-faq-a" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.2 }}>
                  {f.a}
                </motion.p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="lx-footer">
        <div className="lx-footer-inner">
          <div className="lx-foot-brand">
            <span className="lx-logo"><HeartPulse size={20} /> Sankat<span>.AI</span></span>
            <p>AI-powered emergency triage. Not a substitute for professional medical advice. In an emergency, call your local emergency number.</p>
          </div>
          <div className="lx-foot-cols">
            <div>
              <h4>Product</h4>
              <a href="#features">Features</a><a href="#how">How it works</a><a href="#faq">FAQ</a>
            </div>
            <div>
              <h4>Resources</h4>
              <a href="#docs">Documentation</a><button className="lx-foot-link" onClick={goLogin}>Sign in</button>
            </div>
            <div>
              <h4>Emergency</h4>
              <a href="tel:108"><Phone size={13} /> Ambulance 108</a><a href="tel:112"><Phone size={13} /> Emergency 112</a>
            </div>
          </div>
        </div>
        <div className="lx-foot-bottom">© {new Date().getFullYear()} Sankat.AI — All rights reserved.</div>
      </footer>
    </div>
  )
}

const LX_CSS = `
.lx { background: var(--bg-body, #F8FAFC); color: var(--text-primary, #0F172A); min-height: 100vh; }
.lx a { color: inherit; text-decoration: none; }

/* buttons */
.lx-btn { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.9rem; border-radius: 12px; padding: 10px 18px; cursor: pointer; border: 1px solid transparent; transition: all 0.15s; white-space: nowrap; }
.lx-btn.lg { padding: 14px 24px; font-size: 0.98rem; }
.lx-btn.full { width: 100%; justify-content: center; }
.lx-btn.primary { background: var(--primary, #C4504B); color: #fff; box-shadow: 0 4px 14px rgba(196, 80, 75,0.25); }
.lx-btn.primary:hover { background: var(--primary-hover, #A93F3B); transform: translateY(-1px); }
.lx-btn.ghost { background: var(--bg-surface, #fff); color: var(--text-secondary, #334155); border-color: var(--border-subtle, #E5E7EB); }
.lx-btn.ghost:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }

/* nav */
.lx-nav { position: sticky; top: 0; z-index: 100; background: rgba(248,250,252,0.85); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border-subtle, #E5E7EB); }
.lx-nav-inner { max-width: 1160px; margin: 0 auto; display: flex; align-items: center; gap: 24px; padding: 14px 24px; }
.lx-logo { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.2rem; }
.lx-logo svg { color: var(--primary, #C4504B); }
.lx-logo span { color: var(--primary, #C4504B); }
.lx-links { display: flex; gap: 6px; margin-left: 12px; flex: 1; }
.lx-links a { padding: 8px 12px; border-radius: 8px; font-size: 0.9rem; font-weight: 500; color: var(--text-secondary, #334155); transition: all 0.15s; }
.lx-links a:hover { background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); }
.lx-nav-cta { display: flex; gap: 10px; }
.lx-burger { display: none; background: transparent; border: none; color: var(--text-primary, #0F172A); cursor: pointer; }
.lx-mobile-menu { display: none; }

/* hero */
.lx-hero { max-width: 1160px; margin: 0 auto; padding: 40px 24px; min-height: calc(100vh - 72px); min-height: calc(100dvh - 72px); display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 48px; align-items: center; }
.lx-badge { display: inline-flex; align-items: center; gap: 6px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); border: 1px solid var(--sev-emergency-border, #F0CFCD); font-size: 0.78rem; font-weight: 700; padding: 6px 12px; border-radius: 99px; }
.lx-hero-copy h1 { font-size: 3rem; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; margin: 18px 0 16px; }
.lx-hl { color: var(--primary, #C4504B); }
.lx-hero-copy > p { font-size: 1.1rem; line-height: 1.6; color: var(--text-muted, #64748B); max-width: 520px; }
.lx-hero-actions { display: flex; gap: 12px; margin: 28px 0 16px; flex-wrap: wrap; }
.lx-hero-note { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; color: var(--text-muted, #64748B); }
.lx-hero-note svg { color: var(--success, #059669); }

/* under-the-hood pipeline */
.lx-flow { margin-top: 34px; }
.lx-flow-title { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted, #94A3B8); }
.lx-flow-track { display: flex; align-items: flex-start; gap: 4px; margin-top: 14px; flex-wrap: wrap; }
.lx-flow-cell { display: flex; align-items: center; gap: 4px; }
.lx-flow-node { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 80px; text-align: center; }
.lx-flow-ic { position: relative; width: 46px; height: 46px; border-radius: 13px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); color: var(--primary, #C4504B); display: grid; place-items: center; box-shadow: 0 3px 10px rgba(16,24,40,0.06); }
.lx-flow-ic-badge { position: absolute; bottom: -5px; right: -5px; width: 20px; height: 20px; border-radius: 7px; background: var(--primary, #C4504B); color: #fff; display: grid; place-items: center; border: 2px solid var(--bg-body, #F8FAFC); }
.lx-flow-label { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary, #334155); line-height: 1.25; }
.lx-flow-arrow { color: var(--sev-emergency-border, #FCA5A5); flex-shrink: 0; margin-top: 15px; }
.lx-hero-visual { display: flex; justify-content: center; position: relative; }
.lx-mock { width: 100%; max-width: 380px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 20px; padding: 18px; box-shadow: 0 20px 50px -12px rgba(16,24,40,0.18); position: relative; z-index: 2; }

/* floating accent panels */
.lx-float { position: absolute; z-index: 3; display: flex; align-items: center; gap: 10px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; padding: 12px 14px; box-shadow: 0 12px 30px -8px rgba(16,24,40,0.2); }
.lx-float.top { top: -22px; right: -14px; }
.lx-float.bottom { bottom: -24px; right: 4px; }
.lx-float-icon { width: 36px; height: 36px; border-radius: 10px; background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); display: grid; place-items: center; flex-shrink: 0; }
.lx-float-icon.danger { background: var(--sev-emergency-soft, #FBF1F0); color: var(--sev-emergency, #C4504B); }
.lx-float-body { display: flex; flex-direction: column; min-width: 0; }
.lx-float-label { font-size: 0.68rem; font-weight: 600; color: var(--text-muted, #64748B); text-transform: uppercase; letter-spacing: 0.04em; }
.lx-float-value { font-size: 1.05rem; font-weight: 800; color: var(--text-primary, #0F172A); }
.lx-float-value small { font-size: 0.7rem; font-weight: 500; color: var(--text-muted, #94A3B8); }
.lx-float-value.sm { font-size: 0.85rem; font-weight: 700; }
.lx-float-bar { width: 100px; height: 5px; background: var(--surface-2, #F1F5F9); border-radius: 99px; margin-top: 4px; overflow: hidden; }
.lx-float-bar span { display: block; height: 100%; background: var(--sev-emergency, #C4504B); border-radius: 99px; }
.lx-mock-head { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 0.85rem; padding-bottom: 14px; border-bottom: 1px solid var(--border-subtle, #E5E7EB); margin-bottom: 14px; }
.lx-mock-head svg { color: var(--primary, #C4504B); }
.lx-mock-msg { font-size: 0.85rem; line-height: 1.5; padding: 11px 14px; border-radius: 14px; margin-bottom: 10px; }
.lx-mock-msg.user { background: var(--primary, #C4504B); color: #fff; margin-left: 40px; border-bottom-right-radius: 4px; }
.lx-mock-msg.bot { background: var(--surface-2, #F1F5F9); margin-right: 20px; border-bottom-left-radius: 4px; }
.lx-mock-pill { display: inline-block; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); font-weight: 800; font-size: 0.68rem; padding: 3px 9px; border-radius: 99px; margin-bottom: 8px; }
.lx-mock-actions { display: flex; gap: 8px; }
.lx-mock-action { display: inline-flex; align-items: center; gap: 5px; font-size: 0.75rem; font-weight: 600; padding: 7px 12px; border-radius: 9px; border: 1px solid var(--border-subtle, #E5E7EB); }
.lx-mock-action.danger { background: var(--primary, #C4504B); color: #fff; border-color: var(--primary, #C4504B); }

/* sections */
.lx-section { max-width: 1160px; margin: 0 auto; padding: 72px 24px; }
.lx-section.alt { max-width: none; background: var(--bg-surface, #fff); border-top: 1px solid var(--border-subtle, #E5E7EB); border-bottom: 1px solid var(--border-subtle, #E5E7EB); }
.lx-section.alt > * { max-width: 1160px; margin-left: auto; margin-right: auto; }
.lx-section-head { text-align: center; max-width: 640px; margin: 0 auto 44px; }
.lx-eyebrow { font-size: 0.76rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: var(--primary, #C4504B); }
.lx-section-head h2 { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.02em; margin: 12px 0 10px; }
.lx-section-head p { color: var(--text-muted, #64748B); font-size: 1.02rem; }

.lx-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; }
.lx-card { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 18px; padding: 24px; box-shadow: 0 1px 2px rgba(16,24,40,0.04); }
.lx-card-icon { width: 46px; height: 46px; border-radius: 13px; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); display: grid; place-items: center; margin-bottom: 14px; }
.lx-card h3 { margin: 0 0 8px; font-size: 1.05rem; font-weight: 700; }
.lx-card p { margin: 0; color: var(--text-muted, #64748B); font-size: 0.9rem; line-height: 1.55; }

.lx-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.lx-step { text-align: left; }
.lx-step-n { font-size: 2.2rem; font-weight: 800; color: var(--sev-emergency-border, #F0CFCD); }
.lx-step h3 { margin: 8px 0; font-size: 1.15rem; }
.lx-step p { color: var(--text-muted, #64748B); font-size: 0.92rem; line-height: 1.55; }

.lx-docs-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; }
.lx-doc { display: flex; gap: 16px; text-align: left; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 16px; padding: 20px; cursor: pointer; transition: all 0.15s; }
.lx-doc:hover { border-color: var(--primary, #C4504B); box-shadow: 0 8px 24px rgba(16,24,40,0.08); }
.lx-doc-icon { width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; background: var(--surface-2, #F1F5F9); color: var(--primary, #C4504B); display: grid; place-items: center; }
.lx-doc-body h3 { margin: 0 0 6px; font-size: 1rem; display: flex; align-items: center; gap: 6px; }
.lx-doc-body h3 svg { color: var(--primary, #C4504B); }
.lx-doc-body p { margin: 0; color: var(--text-muted, #64748B); font-size: 0.88rem; line-height: 1.5; }

.lx-faq { max-width: 760px; margin: 0 auto; display: flex; flex-direction: column; gap: 10px; }
.lx-faq-item { background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; overflow: hidden; }
.lx-faq-item.open { border-color: var(--sev-emergency-border, #F0CFCD); }
.lx-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; background: transparent; border: none; cursor: pointer; font-size: 1rem; font-weight: 600; text-align: left; color: var(--text-primary, #0F172A); }
.lx-faq-q svg { transition: transform 0.2s; flex-shrink: 0; color: var(--text-muted, #64748B); }
.lx-faq-item.open .lx-faq-q svg { transform: rotate(180deg); color: var(--primary, #C4504B); }
.lx-faq-a { margin: 0; padding: 0 20px 18px; color: var(--text-muted, #64748B); font-size: 0.92rem; line-height: 1.6; }

.lx-cta { padding: 20px 24px 80px; }
.lx-cta-inner { max-width: 900px; margin: 0 auto; text-align: center; background: linear-gradient(135deg, #C4504B, #A93F3B); color: #fff; border-radius: 24px; padding: 56px 32px; box-shadow: 0 20px 50px -12px rgba(196, 80, 75,0.4); }
.lx-cta-inner h2 { font-size: 2rem; font-weight: 800; margin: 0 0 10px; }
.lx-cta-inner p { opacity: 0.92; font-size: 1.05rem; margin: 0 0 26px; }
.lx-cta .lx-btn.primary { background: #fff; color: var(--primary, #C4504B); box-shadow: none; }
.lx-cta .lx-btn.primary:hover { background: #fff; opacity: 0.94; }

/* footer */
.lx-footer { background: var(--text-primary, #0F172A); color: #CBD5E1; }
.lx-footer-inner { max-width: 1160px; margin: 0 auto; padding: 54px 24px 30px; display: grid; grid-template-columns: 1.4fr 2fr; gap: 40px; }
.lx-foot-brand .lx-logo { color: #fff; }
.lx-foot-brand .lx-logo span, .lx-foot-brand .lx-logo svg { color: #E0736E; }
.lx-foot-brand p { margin: 14px 0 0; font-size: 0.85rem; line-height: 1.6; max-width: 340px; color: #94A3B8; }
.lx-foot-cols { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; }
.lx-foot-cols h4 { color: #fff; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 12px; }
.lx-foot-cols a, .lx-foot-link { display: flex; align-items: center; gap: 6px; color: #94A3B8; font-size: 0.88rem; padding: 5px 0; background: transparent; border: none; cursor: pointer; text-align: left; }
.lx-foot-cols a:hover, .lx-foot-link:hover { color: #fff; }
.lx-foot-bottom { border-top: 1px solid rgba(255,255,255,0.08); text-align: center; padding: 18px; font-size: 0.8rem; color: #64748B; }

/* responsive */
@media (max-width: 900px) {
  .lx-links, .lx-nav-cta { display: none; }
  .lx-burger { display: block; margin-left: auto; }
  .lx-mobile-menu { display: flex; flex-direction: column; gap: 4px; padding: 12px 24px 18px; border-top: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); }
  .lx-mobile-menu a { padding: 12px; border-radius: 8px; font-weight: 500; }
  .lx-mobile-menu a:hover { background: var(--surface-2, #F1F5F9); }
  .lx-hero { grid-template-columns: 1fr; padding: 44px 24px; }
  .lx-hero-copy h1 { font-size: 2.3rem; }
  .lx-hero-visual { order: -1; }
  .lx-float { display: none; }
  .lx-grid, .lx-steps, .lx-docs-grid { grid-template-columns: 1fr; }
  .lx-footer-inner { grid-template-columns: 1fr; gap: 28px; }
  .lx-foot-cols { grid-template-columns: repeat(3, 1fr); }
}
`

export default Landing
