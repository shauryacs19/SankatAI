import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import {
  ArrowRight, Menu, X, ChevronDown, Phone, Ambulance, ShieldCheck, Lock, Check, Minus,
  MessageSquareLock, Type, SunMoon, Volume2, Keyboard,
  CircleUser, LayoutDashboard, LogOut, Shield,
} from 'lucide-react'
import { AUTH_STATUS, useAuth } from '../../context/AuthContext.jsx'
import { Brand, Button, IconButton, Menu as AccountMenu, SeverityBadge, SkipLink } from '../../components/ui'
import { savePendingQuestion } from '../chat/pendingQuestion'
import { stashGuestChat } from '../chat/guestChat'
import { CHAT_CSS } from '../chat/chat.styles'
import HeroChat from './HeroChat.jsx'
import { HeroShowcase, ProductTour } from './Showcase.jsx'
import { LANDING_CSS } from './landing.styles'
import { SHOWCASE_CSS } from './showcase.styles'
import { SignOutDialog } from '../auth/components/SignOutDialog.jsx'

const NAV = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#tour' },
  { label: 'Safety', href: '#safety' },
  { label: 'FAQ', href: '#faq' },
]

const STEPS = [
  { title: 'Tell us what is wrong', text: 'Type or speak, in English or Hindi. Describe it the way you would to someone in your family.' },
  { title: 'Answer a few questions', text: 'If something is unclear, SankatAI asks short follow-up questions before it gives guidance.' },
  { title: 'Know what to do next', text: 'You get an urgency level and simple next steps: rest at home, see a doctor, or get help now.' },
]

// Only what the app actually does (see apps/web/DESIGN_SYSTEM.md, accessibility).
const EASY = [
  { Icon: Type, text: 'Large, clear text with strong contrast' },
  { Icon: SunMoon, text: 'Light or dark, or match your device' },
  { Icon: Volume2, text: 'Speak instead of typing, and hear replies read aloud' },
  { Icon: Keyboard, text: 'Works with a keyboard and screen readers' },
]

const CAN = [
  'Explain what your symptoms may mean, in simple words',
  'Suggest how urgent it may be and what to do next',
  'Help you decide whether to rest, see a doctor or get help now',
]
const CANNOT = [
  'Diagnose a condition or prescribe treatment',
  'Replace a doctor, a clinic or a hospital visit',
  'Handle a medical emergency for you',
]

const FAQS = [
  { q: 'Do I need an account?', a: 'No. You can ask SankatAI as a guest at the top of this page. Guest conversations are not stored anywhere. If you want to keep one, choose Save this chat and create an account. An account also keeps your health profile, documents and emergency contacts.' },
  { q: 'Is SankatAI a replacement for a doctor?', a: 'No. SankatAI gives health guidance to help you decide what to do next. It is not a diagnosis and never replaces professional medical care or emergency services.' },
  { q: 'What happens in an emergency?', a: 'If your answer suggests an emergency, SankatAI shows a Call 108 button straight away, along with ways to call your emergency contact, share your location and find nearby hospitals. The SOS button is always on screen. If you think it is an emergency, call 108 first.' },
  { q: 'Which languages can I use?', a: 'You can type or speak in English or Hindi, and SankatAI replies in the language you used. Any reply can also be shown in English, Hindi or Hinglish, and read aloud.' },
  { q: 'Is my health information private?', a: 'Your profile, conversations and documents are tied to your account and are only available after you sign in. Documents can also be locked with a PIN.' },
  { q: 'What if the AI is unavailable?', a: 'SankatAI switches to a simple keyword-based estimate so you still get a response. Those answers are clearly labelled as not an AI assessment. You still need an internet connection.' },
]

function Landing() {
  const navigate = useNavigate()
  const { status, user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const authed = status === AUTH_STATUS.AUTHED

  // Public page: nothing here redirects. Guests get Sign in / Get started;
  // signed-in users get their menu. While the stored session is being read,
  // neither is shown (no flash of the wrong state).
  const goLogin = () => navigate('/login')
  const goSignup = () => navigate(authed ? '/app' : '/signup')
  // Signed in: the question waits in this tab until their chat composer picks it up.
  const askSignedIn = (q) => { savePendingQuestion(q); navigate('/app') }
  // Guest: keep the conversation for the chat page to import after sign-up.
  const saveGuest = (guestId, messages) => { stashGuestChat(guestId, messages); navigate('/signup') }
  const userItems = [
    { key: 'app', label: 'Open SankatAI', icon: LayoutDashboard, onSelect: () => navigate('/app') },
    ...(user?.groups?.includes('ADMIN') ? [{ key: 'admin', label: 'Admin console', icon: Shield, onSelect: () => navigate('/admin') }] : []),
    { key: 'out', label: 'Sign out', icon: LogOut, onSelect: () => setConfirmSignOut(true), tone: 'danger' },
  ]

  const reveal = { initial: { opacity: 0, y: 16 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
  // Cards in a group arrive one after another, once.
  const group = { initial: 'hidden', whileInView: 'show', viewport: { once: true, amount: 0.25 }, variants: { hidden: {}, show: { transition: { staggerChildren: 0.12 } } } }
  const card = { variants: { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } } } }

  return (
    <div className="lx">
      <style>{CHAT_CSS + LANDING_CSS + SHOWCASE_CSS}</style>
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
                <Button variant="primary" onClick={goSignup}>Get started</Button>
              </>
            )}
            {authed && (
              <>
                <Button variant="primary" onClick={() => navigate('/app')}>Open SankatAI</Button>
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
              <div className="lx-mobile-actions">
                <Button variant="secondary" block onClick={goLogin}>Sign in</Button>
                <Button variant="primary" block onClick={goSignup}>Get started</Button>
              </div>
            )}
            {authed && (
              <div className="lx-mobile-actions">
                <Button variant="primary" block onClick={() => navigate('/app')}>Open SankatAI</Button>
                <Button variant="secondary" block icon={LogOut} onClick={() => { setMenuOpen(false); setConfirmSignOut(true) }}>Sign out</Button>
              </div>
            )}
          </div>
        )}
      </header>
      <SignOutDialog open={confirmSignOut} onClose={() => setConfirmSignOut(false)} onConfirm={() => signOut()} />

      <main id="main" tabIndex={-1}>
        <section className="lx-hero" aria-labelledby="lx-title">
          <p className="lx-eyebrow">AI health guidance · English and हिन्दी</p>
          <h1 id="lx-title">Your health questions deserve <span>clear answers.</span></h1>
          <p className="lx-hero-lead">
            Describe how you feel in your own words. SankatAI asks a few simple questions,
            tells you how urgent it may be, and explains what to do next.
          </p>
          <HeroChat authed={authed} onAskSignedIn={askSignedIn} onSaveGuest={saveGuest} />
          <p className="lx-hero-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <span>
              SankatAI gives AI-generated guidance and does not replace professional medical advice.
              In an emergency, <a className="link link--emergency" href="tel:108">call 108</a>.
            </span>
          </p>
          <HeroShowcase />
        </section>

        <section className="lx-section lx-section--surface" id="how" aria-labelledby="lx-how">
          <div className="lx-inner lx-how">
            <motion.div className="lx-section-head" {...reveal}>
              <p className="lx-eyebrow">How it works</p>
              <h2 id="lx-how">A calm conversation, one step at a time</h2>
              <p>No forms to fill in and no medical words needed.</p>
            </motion.div>
            <motion.ol className="lx-steps" {...group}>
              {STEPS.map((s, i) => (
                <motion.li key={s.title} className="lx-step" {...card}>
                  <span className="lx-step-n" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3>{s.title}</h3>
                    <p>{s.text}</p>
                  </div>
                </motion.li>
              ))}
            </motion.ol>
            <motion.aside className="lx-anatomy" aria-labelledby="lx-anatomy-title" {...reveal}>
              <h3 id="lx-anatomy-title">Every answer shows you</h3>
              <dl>
                <div>
                  <dt>How urgent it may be</dt>
                  <dd>
                    <span className="lx-levels">
                      <SeverityBadge severity="LOW" />
                      <SeverityBadge severity="MODERATE" />
                      <SeverityBadge severity="HIGH" />
                      <SeverityBadge severity="EMERGENCY" />
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>What to do now</dt>
                  <dd>Short, practical steps in plain language.</dd>
                </div>
                <div>
                  <dt>When to get help</dt>
                  <dd>If it could be an emergency, a Call 108 button appears right away.</dd>
                </div>
              </dl>
            </motion.aside>
          </div>
        </section>

        <ProductTour />

        <section className="lx-section lx-section--surface" id="safety" aria-labelledby="lx-safety">
          <div className="lx-inner">
            <motion.div className="lx-section-head" {...reveal}>
              <p className="lx-eyebrow">Safety and privacy</p>
              <h2 id="lx-safety">Clear about what SankatAI is, and what it is not</h2>
            </motion.div>
            <motion.div className="lx-limits" {...group}>
              <motion.div className="lx-limit" {...card}>
                <h3>SankatAI can</h3>
                <ul role="list">{CAN.map((t) => <li key={t}><Check size={20} aria-hidden="true" className="lx-limit-yes" />{t}</li>)}</ul>
              </motion.div>
              <motion.div className="lx-limit" {...card}>
                <h3>SankatAI cannot</h3>
                <ul role="list">{CANNOT.map((t) => <li key={t}><Minus size={20} aria-hidden="true" className="lx-limit-no" />{t}</li>)}</ul>
              </motion.div>
            </motion.div>
            <div className="lx-trust">
              <div className="lx-trust-item">
                <MessageSquareLock size={22} aria-hidden="true" />
                <div>
                  <h3>Guest chats are not stored</h3>
                  <p>Ask on this page without an account. Nothing is kept unless you choose to save the chat to an account.</p>
                </div>
              </div>
              <div className="lx-trust-item">
                <Lock size={22} aria-hidden="true" />
                <div>
                  <h3>Private to your account</h3>
                  <p>Your profile, conversations and documents are only available after you sign in. Documents can also be locked with a PIN.</p>
                </div>
              </div>
              <div className="lx-trust-item">
                <ShieldCheck size={22} aria-hidden="true" />
                <div>
                  <h3>Secure sign-in</h3>
                  <p>Sign-in is handled by Amazon Cognito, and your password is never sent to SankatAI.</p>
                </div>
              </div>
            </div>
            <div className="lx-easy" aria-labelledby="lx-easy-title">
              <h3 id="lx-easy-title">Made to be easy for everyone</h3>
              <motion.ul role="list" {...group}>
                {EASY.map((e) => <motion.li key={e.text} {...card}><span className="lx-easy-icon"><e.Icon size={20} aria-hidden="true" /></span>{e.text}</motion.li>)}
              </motion.ul>
            </div>
            <div className="lx-emergency" role="note" aria-labelledby="lx-emergency-title">
              <div>
                <h3 id="lx-emergency-title">In an emergency, do not wait for an app</h3>
                <p>Call 108 for an ambulance, or 112 for all emergency services.</p>
              </div>
              <div className="lx-emergency-actions">
                <Button variant="emergency" icon={Ambulance} href="tel:108">Call 108</Button>
                <Button variant="secondary" icon={Phone} href="tel:112">Call 112</Button>
              </div>
            </div>
          </div>
        </section>

        <section className="lx-section" id="faq" aria-labelledby="lx-faq">
          <div className="lx-inner lx-faq-layout">
            <motion.div className="lx-section-head" {...reveal}>
              <p className="lx-eyebrow">Questions</p>
              <h2 id="lx-faq">Questions people often ask</h2>
            </motion.div>
            <div className="lx-faq">
              {FAQS.map((f, i) => {
                const open = openFaq === i
                return (
                  <div key={f.q} className={`lx-faq-item ${open ? 'is-open' : ''}`}>
                    <h3>
                      <button type="button" className="lx-faq-q" aria-expanded={open} aria-controls={`faq-${i}`} id={`faq-q-${i}`} onClick={() => setOpenFaq(open ? -1 : i)}>
                        {f.q}<ChevronDown size={20} aria-hidden="true" />
                      </button>
                    </h3>
                    <div id={`faq-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!open} className="lx-faq-a"><p>{f.a}</p></div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="lx-cta" aria-labelledby="lx-cta">
          <motion.div className="lx-cta-inner" {...reveal}>
            <span className="lx-cta-mark ui-brand-mark" aria-hidden="true"><ShieldCheck size={22} /></span>
            <h2 id="lx-cta">Set up SankatAI before you need it</h2>
            <p>Add your health details and emergency contacts now, so help is faster when it matters.</p>
            <div className="lx-cta-actions">
              <Button variant="primary" iconEnd={ArrowRight} onClick={goSignup}>{authed ? 'Open SankatAI' : 'Get started'}</Button>
              {!authed && <Button variant="secondary" onClick={goLogin}>I already have an account</Button>}
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="lx-footer">
        <div className="lx-footer-inner">
          <div className="lx-foot-brand">
            <Brand size="sm" />
            <p>AI health guidance. Not a substitute for professional medical advice, diagnosis or treatment.</p>
          </div>
          <nav className="lx-foot-cols" aria-label="Footer">
            <div>
              <h2 className="lx-foot-head">Product</h2>
              {NAV.map((n) => <a key={n.href} href={n.href}>{n.label}</a>)}
              <button type="button" className="lx-foot-link" onClick={authed ? () => navigate('/app') : goLogin}>{authed ? 'Open SankatAI' : 'Sign in'}</button>
            </div>
            <div>
              <h2 className="lx-foot-head">Emergency</h2>
              <a href="tel:108"><Phone size={16} aria-hidden="true" /> Ambulance: 108</a>
              <a href="tel:112"><Phone size={16} aria-hidden="true" /> All emergencies: 112</a>
            </div>
          </nav>
        </div>
        <p className="lx-foot-bottom">© {new Date().getFullYear()} SankatAI</p>
      </footer>
    </div>
  )
}

export default Landing
