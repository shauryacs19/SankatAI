import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import {
  Activity, ShieldCheck, Siren, MessageSquare, Stethoscope, CloudOff, ArrowRight, Menu, X, ChevronDown, Phone, Ambulance, HeartPulse,
  CircleUser, LayoutDashboard, LogOut, Shield,
} from 'lucide-react'
import { EMERGENCY_CALLOUT } from '@sankatai/shared'
import { AUTH_STATUS, useAuth } from '../../context/AuthContext.jsx'
import { Brand, Button, IconButton, Menu as AccountMenu, SeverityBadge, SkipLink, listContainer, listItem } from '../../components/ui'
import { LANDING_CSS } from './landing.styles'
import { SignOutDialog } from '../auth/components/SignOutDialog.jsx'

const NAV = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'FAQ', href: '#faq' },
]

const FEATURES = [
  { Icon: Activity, title: 'Symptom triage', text: 'Describe symptoms in plain language and get a severity level, a risk score and clear next steps.' },
  { Icon: Siren, title: 'Emergency help, one tap away', text: 'Call 108, call or send your location to an emergency contact, and find nearby hospitals.' },
  { Icon: Stethoscope, title: 'Your medical profile', text: 'Blood group, allergies and conditions give the assessment the context it needs.' },
  { Icon: CloudOff, title: 'Keeps responding if the AI is down', text: 'A keyword-based estimate keeps triage running, clearly labelled as not an AI assessment. It still needs an internet connection.' },
  { Icon: MessageSquare, title: 'Consultation history', text: 'Every conversation is saved to your account so you can come back to past assessments.' },
  { Icon: ShieldCheck, title: 'Secure sign-in', text: 'Sign-in is handled by Amazon Cognito. Your data is tied to your verified account.' },
]

const STEPS = [
  { n: '1', title: 'Set up your profile', text: 'Sign in and add your key medical details. It takes about two minutes.' },
  { n: '2', title: 'Describe your symptoms', text: 'Chat naturally. SankatAI asks follow-up questions and assesses urgency.' },
  { n: '3', title: 'Know what to do next', text: 'Get a severity level, guidance, and emergency actions when they matter.' },
]

const FAQS = [
  { q: 'Is SankatAI a replacement for a doctor?', a: 'No. SankatAI gives guidance and triage to help you decide what to do next. It is not a diagnosis and never replaces professional medical care or emergency services.' },
  { q: 'What happens in a real emergency?', a: 'If the assessment suggests an emergency, the app shows one-tap actions to call an ambulance (108), call your emergency contact, share your location, and find nearby hospitals. The SOS button is always available.' },
  { q: 'Is my medical information private?', a: 'Your profile, chats and documents are tied to your verified account and are only accessible after you sign in. Documents can also be protected with a PIN.' },
  { q: 'What if the AI service is down?', a: 'SankatAI switches to a simple keyword-based estimate so you still get a response. Those answers are clearly labelled as not an AI assessment. You still need an internet connection.' },
]

function Landing() {
  const navigate = useNavigate()
  const { status, user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const authed = status === AUTH_STATUS.AUTHED

  // Public page: nothing here redirects. Guests get Sign in / Sign up;
  // signed-in users get their menu. While the stored session is being read,
  // neither is shown (no flash of the wrong state).
  const goLogin = () => navigate('/login')
  const goSignup = () => navigate(authed ? '/app' : '/signup')
  const userItems = [
    { key: 'app', label: 'Open SankatAI', icon: LayoutDashboard, onSelect: () => navigate('/app') },
    ...(user?.groups?.includes('ADMIN') ? [{ key: 'admin', label: 'Admin console', icon: Shield, onSelect: () => navigate('/admin') }] : []),
    { key: 'out', label: 'Sign out', icon: LogOut, onSelect: () => setConfirmSignOut(true), tone: 'danger' },
  ]

  const reveal = { initial: { opacity: 0, y: 8 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' }, transition: { duration: 0.24 } }

  return (
    <div className="lx">
      <style>{LANDING_CSS}</style>
      <SkipLink />

      <header className="lx-nav">
        <div className="lx-nav-inner">
          <Link to="/" className="lx-logo" aria-label="SankatAI home"><Brand /></Link>
          <nav className="lx-links" aria-label="Sections">
            {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
          </nav>
          <div className="lx-nav-cta" aria-busy={status === AUTH_STATUS.LOADING || undefined}>
            {status === AUTH_STATUS.GUEST && (
              <>
                <Button variant="ghost" onClick={goLogin}>Sign in</Button>
                <Button variant="primary" onClick={goSignup}>Sign up</Button>
              </>
            )}
            {authed && (
              <>
                <Button variant="primary" onClick={() => navigate('/app')}>Open app</Button>
                <AccountMenu label={`Account menu${user?.email ? ` for ${user.email}` : ''}`} icon={CircleUser} items={userItems} />
              </>
            )}
          </div>
          <IconButton
            className="lx-burger"
            label={menuOpen ? 'Close menu' : 'Open menu'}
            icon={menuOpen ? X : Menu}
            aria-expanded={menuOpen}
            aria-controls="lx-mobile-menu"
            tooltip={false}
            onClick={() => setMenuOpen((o) => !o)}
          />
        </div>
        {menuOpen && (
          <div className="lx-mobile-menu" id="lx-mobile-menu">
            <nav aria-label="Sections">{NAV.map((n) => <a key={n.href} href={n.href} onClick={() => setMenuOpen(false)}>{n.label}</a>)}</nav>
            {status === AUTH_STATUS.GUEST && (
              <>
                <Button variant="secondary" block onClick={goLogin}>Sign in</Button>
                <Button variant="primary" block onClick={goSignup}>Sign up</Button>
              </>
            )}
            {authed && (
              <>
                <Button variant="primary" block onClick={() => navigate('/app')}>Open app</Button>
                <Button variant="secondary" block icon={LogOut} onClick={() => { setMenuOpen(false); setConfirmSignOut(true) }}>Sign out</Button>
              </>
            )}
          </div>
        )}
      </header>
      <SignOutDialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)} onConfirm={() => signOut()} />

      <main id="main" tabIndex={-1}>
        <section className="lx-hero" aria-labelledby="lx-title">
          <div className="lx-hero-copy">
            <p className="ui-overline">AI symptom triage for India</p>
            <h1 id="lx-title">Know how urgent it is, and what to do next.</h1>
            <p className="lx-hero-lead">Describe your symptoms in your own words. SankatAI assesses how serious they could be and tells you what to do now, with emergency help one tap away.</p>
            <div className="lx-hero-actions">
              <Button variant="primary" iconEnd={ArrowRight} onClick={goSignup}>Get started</Button>
              <Button variant="secondary" href="#how">How it works</Button>
            </div>
            <p className="lx-hero-note"><ShieldCheck size={16} aria-hidden="true" /><span>Guidance, not a diagnosis. In an emergency, <a href="tel:108">call 108</a>.</span></p>
          </div>

          <figure className="lx-mock" aria-label="Example of a SankatAI assessment">
            <div className="lx-mock-user">I have chest pain spreading to my left arm and I'm short of breath.</div>
            <div className="lx-mock-ai">
              <div className="lx-mock-head">
                <span className="lx-mock-who"><span className="lx-mock-mark"><HeartPulse size={14} aria-hidden="true" /></span>SankatAI</span>
                <SeverityBadge severity="EMERGENCY" score={95} />
              </div>
              <p>These symptoms can be a sign of a heart problem that needs urgent care.</p>
              <div className="lx-mock-call">
                <p>{EMERGENCY_CALLOUT}</p>
                <span className="ui-btn ui-btn--emergency ui-btn--sm" aria-hidden="true"><Ambulance size={16} /> Call 108 now</span>
              </div>
            </div>
            <figcaption className="lx-mock-cap">Example only.</figcaption>
          </figure>
        </section>

        <section className="lx-section" id="features" aria-labelledby="lx-features">
          <motion.div className="lx-section-head" {...reveal}>
            <p className="ui-overline">Features</p>
            <h2 id="lx-features">Built to be calm, clear and fast when it matters</h2>
          </motion.div>
          <motion.ul role="list" className="lx-grid" {...listContainer} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }} animate={undefined}>
            {FEATURES.map((f) => (
              <motion.li key={f.title} className="lx-card" {...listItem}>
                <span className="lx-card-icon"><f.Icon size={20} aria-hidden="true" /></span>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </motion.li>
            ))}
          </motion.ul>
        </section>

        <section className="lx-section lx-section--band" id="how" aria-labelledby="lx-how">
          <div className="lx-band-inner">
            <motion.div className="lx-section-head" {...reveal}>
              <p className="ui-overline">How it works</p>
              <h2 id="lx-how">Three steps to a clear answer</h2>
            </motion.div>
            <ol className="lx-steps">
              {STEPS.map((s) => (
                <li key={s.n} className="lx-step">
                  <span className="lx-step-n" aria-hidden="true">{s.n}</span>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lx-section" id="faq" aria-labelledby="lx-faq">
          <motion.div className="lx-section-head" {...reveal}>
            <p className="ui-overline">FAQ</p>
            <h2 id="lx-faq">Questions, answered</h2>
          </motion.div>
          <div className="lx-faq">
            {FAQS.map((f, i) => {
              const open = openFaq === i
              return (
                <div key={f.q} className="lx-faq-item">
                  <h3>
                    <button type="button" className="lx-faq-q" aria-expanded={open} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpenFaq(open ? -1 : i)}>
                      {f.q}<ChevronDown size={18} aria-hidden="true" className={open ? 'is-open' : ''} />
                    </button>
                  </h3>
                  <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!open} className="lx-faq-a">{f.a}</div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="lx-cta" aria-labelledby="lx-cta">
          <h2 id="lx-cta">Set up SankatAI before you need it.</h2>
          <p>Add your medical details and emergency contacts now, so help is faster later.</p>
          <Button variant="primary" iconEnd={ArrowRight} onClick={goSignup}>Get started</Button>
        </section>
      </main>

      <footer className="lx-footer">
        <div className="lx-footer-inner">
          <div className="lx-foot-brand">
            <Brand size="sm" />
            <p>AI symptom triage. Not a substitute for professional medical advice.</p>
          </div>
          <nav className="lx-foot-cols" aria-label="Footer">
            <div>
              <h2 className="ui-overline">Product</h2>
              <a href="#features">Features</a><a href="#how">How it works</a><a href="#faq">FAQ</a>
              <button type="button" className="lx-foot-link" onClick={authed ? () => navigate('/app') : goLogin}>{authed ? 'Open app' : 'Sign in'}</button>
            </div>
            <div>
              <h2 className="ui-overline">Emergency</h2>
              <a href="tel:108"><Phone size={14} aria-hidden="true" /> Ambulance — 108</a>
              <a href="tel:112"><Phone size={14} aria-hidden="true" /> Emergency — 112</a>
            </div>
          </nav>
        </div>
        <p className="lx-foot-bottom">© {new Date().getFullYear()} SankatAI</p>
      </footer>
    </div>
  )
}

export default Landing
