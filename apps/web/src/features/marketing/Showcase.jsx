// Product showcase for the home page: real SankatAI screens (captured from the
// app with sample data) in device frames, a hero composition, and a guided
// tour whose sections reveal as they scroll into view. Motion is transform +
// opacity only, runs once per section, and collapses under reduced motion
// (MotionConfig reducedMotion="user" plus the checks below).
import { useRef } from 'react'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion, useScroll, useTransform } from 'framer-motion'
import { Check, HeartPulse, Mic, Siren, Languages } from 'lucide-react'
import { SeverityBadge, useReducedMotion } from '../../components/ui'

// Every capture exists in a light and a dark version; the page shows the one
// matching the active theme (CSS), and the other is never downloaded (lazy).
const FILES = import.meta.glob('../../assets/showcase/*.webp', { eager: true, query: '?url', import: 'default' })
const src = (name, theme) => FILES[`../../assets/showcase/${name}-${theme}.webp`]

const SIZES = {
  chat: [1440, 912], profile: [1440, 912], history: [1440, 912], files: [1440, 912],
  analysis: [512, 1013], 'chat-phone': [560, 1212], 'emergency-phone': [560, 1212],
}

export function Shot({ name, alt, eager = false }) {
  const [w, h] = SIZES[name]
  const common = { width: w, height: h, decoding: 'async', loading: eager ? 'eager' : 'lazy', draggable: false }
  return (
    <>
      <img className="sc-img sc-img--light" src={src(name, 'light')} alt={alt} {...common} />
      <img className="sc-img sc-img--dark" src={src(name, 'dark')} alt={alt} {...common} />
    </>
  )
}

export function BrowserFrame({ name, alt, label = 'SankatAI', eager, className = '' }) {
  return (
    <div className={`sc-browser ${className}`}>
      <div className="sc-browser-bar" aria-hidden="true">
        <span className="sc-dots"><span /><span /><span /></span>
        <span className="sc-url">{label}</span>
      </div>
      <Shot name={name} alt={alt} eager={eager} />
    </div>
  )
}

export function PhoneFrame({ name, alt, className = '' }) {
  return (
    <div className={`sc-phone ${className}`}>
      <div className="sc-phone-screen"><Shot name={name} alt={alt} /></div>
    </div>
  )
}

const EASE = [0.22, 1, 0.36, 1]

// ── Hero composition ───────────────────────────────────────────────────────
export function HeroShowcase() {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  // Gentle depth: the phone and chips drift at different speeds while scrolling.
  const phoneY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [40, -40])
  const chipY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [24, -24])

  return (
    <motion.figure
      ref={ref}
      className="sc-stage"
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
    >
      <BrowserFrame
        name="chat"
        className="sc-stage-browser"
        label="SankatAI · Symptom chat"
        alt="The SankatAI chat on a computer. A sample conversation about a fever ends with a Moderate risk assessment and simple next steps."
      />
      <motion.div className="sc-stage-phone" style={{ y: phoneY }}>
        <PhoneFrame name="chat-phone" alt="The same assessment on a phone, with the SOS button at the top and the message box at the bottom." />
      </motion.div>
      <motion.div className="sc-chips" style={{ y: chipY }} aria-hidden="true">
        <span className="sc-chip sc-chip--a"><span className="sc-chip-icon"><Mic size={18} /></span>Speak or type, in English or हिन्दी</span>
        <span className="sc-chip sc-chip--b">
          <span className="sc-chip-text">An urgency level with every answer</span>
          <span className="sc-scale"><i className="sev-low" /><i className="sev-moderate" /><i className="sev-high" /><i className="sev-emergency" /></span>
        </span>
        <span className="sc-chip sc-chip--c"><span className="sc-chip-icon sc-chip-icon--sos"><Siren size={18} /></span>Call 108 in one tap</span>
      </motion.div>
      <figcaption className="sc-caption">Sample screens. Names and health details are illustrative.</figcaption>
    </motion.figure>
  )
}

// ── Guided tour ────────────────────────────────────────────────────────────
const textList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
}
const textItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
}

function TourRow({ id, eyebrow, title, text, points, visual, reverse = false }) {
  const from = reverse ? -48 : 48
  return (
    <section id={id} className={`sc-row ${reverse ? 'sc-row--reverse' : ''}`} aria-labelledby={`${id}-title`}>
      <motion.div className="sc-row-text" variants={textList} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.35 }}>
        <motion.p className="lx-eyebrow" variants={textItem}>{eyebrow}</motion.p>
        <motion.h2 id={`${id}-title`} variants={textItem}>{title}</motion.h2>
        <motion.p className="sc-row-lead" variants={textItem}>{text}</motion.p>
        <motion.ul role="list" className="sc-points" variants={textList}>
          {points.map((p) => (
            <motion.li key={p} variants={textItem}><span className="sc-point-icon"><Check size={16} aria-hidden="true" /></span>{p}</motion.li>
          ))}
        </motion.ul>
      </motion.div>
      <motion.div
        className="sc-row-visual"
        initial={{ opacity: 0, x: from, scale: 0.96 }}
        whileInView={{ opacity: 1, x: 0, scale: 1 }}
        viewport={{ once: true, amount: 0.25 }}
        transition={{ duration: 0.8, ease: EASE }}
      >
        {visual}
      </motion.div>
    </section>
  )
}

// A short, illustrative conversation that plays once as it scrolls into view.
// Decorative (aria-hidden): the text beside it says the same in words.
const demoStep = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
}
function ConversationDemo() {
  return (
    <motion.div
      className="sc-demo"
      aria-hidden="true"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.55, delayChildren: 0.4 } } }}
    >
      <div className="sc-demo-head"><span className="ui-brand-mark"><HeartPulse size={16} /></span>Sample conversation</div>
      <motion.div className="sc-demo-user" variants={demoStep}>I have had a fever and a headache for two days.</motion.div>
      <motion.div className="sc-demo-ai" variants={demoStep}>
        <p className="sc-demo-ai-h">To understand better, please tell me:</p>
        <ol><li>How high has your temperature been?</li><li>Do you have a stiff neck, a rash or any trouble breathing?</li></ol>
      </motion.div>
      <motion.div className="sc-demo-user" variants={demoStep}>Around 101°F. No rash or stiff neck.</motion.div>
      <motion.div className="sc-demo-ai" variants={demoStep}>
        <SeverityBadge severity="MODERATE" score={40} />
        <p>This may be a viral infection, which often settles in a few days. See a doctor if it lasts more than three days.</p>
      </motion.div>
      <motion.div className="sc-demo-compose" variants={demoStep}><span>Reply, or add more detail…</span><Mic size={18} /></motion.div>
    </motion.div>
  )
}

export function ProductTour() {
  return (
    <div className="sc-tour" id="tour">
      <TourRow
        id="tour-assessment"
        eyebrow="Symptom check"
        title="Describe it in your own words"
        text="Type or speak the way you would to someone in your family. If something is unclear, SankatAI asks a few short questions before it gives guidance."
        points={['Type or speak, in English or Hindi', 'Short follow-up questions when they are needed', 'An urgency level and clear next steps']}
        visual={<ConversationDemo />}
      />
      <TourRow
        id="tour-insights"
        reverse
        eyebrow="Personal guidance"
        title="Guidance that fits you, explained simply"
        text="Your health profile, including allergies, conditions and medicines, is taken into account. Every assessment shows how urgent it may be, a risk score and a short explanation."
        points={['Urgency, risk score and the reason, side by side', 'Show any reply in English, हिन्दी or Hinglish', 'Have replies read aloud']}
        visual={(
          <div className="sc-pair">
            <BrowserFrame name="profile" label="SankatAI · Health profile" alt="The Health profile screen with sample personal and medical details." />
            <div className="sc-pair-panel">
              <Shot name="analysis" alt="The AI analysis panel: Moderate risk, 40 out of 100, the recommendation, the reasoning and a Call 108 button." />
            </div>
            <span className="sc-float-tag" aria-hidden="true"><Languages size={16} /> English · हिन्दी · Hinglish</span>
          </div>
        )}
      />
      <TourRow
        id="tour-history"
        eyebrow="History and records"
        title="Your conversations and reports, in one place"
        text="Look back at earlier conversations, grouped by day with their urgency. Keep prescriptions and lab reports safe, and lock the private ones with a PIN."
        points={['Search inside past conversations', 'Sort reports into your own folders', 'PIN-protected documents, checked by the server']}
        visual={(
          <div className="sc-stack">
            <BrowserFrame name="history" label="SankatAI · Chat history" alt="Chat history grouped into Today and Earlier, each conversation with its urgency level." />
            <BrowserFrame name="files" className="sc-stack-front" label="SankatAI · Documents" alt="The Documents screen with folders for lab reports and prescriptions; one report is PIN-protected." />
          </div>
        )}
      />
      <TourRow
        id="tour-emergency"
        reverse
        eyebrow="Emergency help"
        title="When it is serious, help is one tap away"
        text="If an answer suggests an emergency, a Call 108 button appears straight away. The SOS button stays on screen everywhere in the app, even while it loads."
        points={['Call 108, 112 or your emergency contact', 'Send your location to your emergency contact', 'Find hospitals near you']}
        visual={(
          <div className="sc-emergency">
            <PhoneFrame name="emergency-phone" alt="The Emergency screen on a phone: a Call 108 button, sending your location to an emergency contact, and nearby hospitals." />
          </div>
        )}
      />
    </div>
  )
}
