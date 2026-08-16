// Optional consent: allow Sankat AI to analyze this document. A toggle plus an
// expandable disclosure (chevron ">" that rotates to point down) explaining what
// enabling it does. Presentational — the consent value lives in the parent form.

import { useId, useState } from 'react'
import { Sparkles, ChevronRight } from 'lucide-react'

export default function AiAnalysisConsent({ enabled, onToggle }) {
  const [open, setOpen] = useState(false)
  const switchId = useId()
  const descId = useId()

  return (
    <div className="du-consent">
      <div className="du-consent-row">
        <button
          type="button"
          className="du-disclosure"
          aria-expanded={open}
          aria-controls={descId}
          onClick={() => setOpen((o) => !o)}
        >
          <ChevronRight size={16} className={`du-chev ${open ? 'open' : ''}`} />
          <span className="du-consent-label"><Sparkles size={15} /> Allow Sankat AI to analyze this document</span>
        </button>

        <button
          type="button"
          id={switchId}
          role="switch"
          aria-checked={enabled}
          className={`du-switch ${enabled ? 'on' : ''}`}
          onClick={() => onToggle(!enabled)}
        >
          <span className="du-switch-knob" />
          <span className="du-switch-text">{enabled ? 'ON' : 'OFF'}</span>
        </button>
      </div>

      {open && (
        <p id={descId} className="du-consent-desc">
          When enabled, Sankat AI&apos;s clinical model can securely access this document to
          personalize its recommendations based on your medical history. You can turn this
          off at any time.
        </p>
      )}
    </div>
  )
}
