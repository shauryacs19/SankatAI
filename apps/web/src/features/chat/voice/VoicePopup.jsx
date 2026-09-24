// Listening popup: opens when the mic is pressed, closes on Stop (after the
// last final result) or Cancel. The transcript is never sent from here — it
// lands in the chat input for review.
//
// A11y: role="dialog" + aria-modal; focus starts on Stop and Tab cycles
// Stop <-> Cancel; Esc = Cancel. Clicking the backdrop does nothing, so a stray
// tap can't end a recording. Status and preview are aria-live="polite".
import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { Mic, MicOff, Square, X } from 'lucide-react'
import { voiceLanguageLabel } from '@sankatai/shared/voice'
import { IconButton, useReducedMotion, useScrollLock } from '../../../components/ui'
import { fade, modalPanel } from '../../../components/ui/motion'
import { useAudioLevel } from './useAudioLevel'
import { VOICE_POPUP_CSS } from './voicePopup.styles'

export default function VoicePopup({ voice }) {
  const open = voice.state === 'recording' || voice.state === 'finalizing'
  return createPortal(
    <AnimatePresence>{open && <Panel voice={voice} />}</AnimatePresence>,
    document.body,
  )
}

function Panel({ voice }) {
  const { state, mic, preview, error, stop, cancel } = voice
  const titleId = useId()
  const panelRef = useRef(null)
  const stopRef = useRef(null)
  const cancelRef = useRef(null)
  const wrapRef = useRef(null)
  const reduced = useReducedMotion()
  const { isSpeaking } = useAudioLevel(error ? null : mic, wrapRef)
  useScrollLock(true)

  const finalizing = state === 'finalizing'
  const starting = !mic && !error && !finalizing
  const stopDisabled = finalizing || starting || Boolean(error)

  // Focus lands on Stop (or Cancel when Stop can't be used).
  useEffect(() => {
    (stopDisabled ? cancelRef : stopRef).current?.focus({ preventScroll: true })
  }, [stopDisabled])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); return }
    if (e.key !== 'Tab') return
    const items = [stopRef.current, cancelRef.current].filter((el) => el && !el.disabled)
    if (!items.length) return
    e.preventDefault()
    const i = items.indexOf(document.activeElement)
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus()
  }

  const status = error ? error.message
    : finalizing ? 'Processing…'
      : starting ? 'Starting microphone…'
        : isSpeaking ? 'Listening…' : 'Say something…'

  return (
    <motion.div className="ui-scrim vp-scrim" {...fade}>
      <style>{VOICE_POPUP_CSS}</style>
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="ui-modal vp-panel"
        onKeyDown={onKeyDown}
        {...modalPanel}
      >
        <h2 id={titleId} className="sr-only">Voice input</h2>
        <div className="vp-close">
          <IconButton ref={cancelRef} label={error ? 'Close' : 'Cancel recording'} icon={X} onClick={cancel} tooltip={false} />
        </div>

        <div ref={wrapRef} className={`vp-mic-wrap ${isSpeaking && !reduced ? 'speaking' : ''} ${error ? 'vp-mic-wrap--error' : ''}`}>
          {!reduced && !error && (
            <>
              <span className="vp-ring" aria-hidden="true" />
              <span className="vp-ring" aria-hidden="true" />
              <span className="vp-ring" aria-hidden="true" />
            </>
          )}
          <span className="vp-mic" aria-hidden="true">{error ? <MicOff size={32} /> : <Mic size={32} />}</span>
        </div>

        <p className={`vp-status ${error ? 'vp-status--error' : ''}`} aria-live="polite">{status}</p>
        {!error && preview.language && (
          <span className="vp-lang" aria-label={`Detected language: ${voiceLanguageLabel(preview.language)}`}>{voiceLanguageLabel(preview.language)}</span>
        )}
        {error ? (
          error.hint && <p className="vp-hint">{error.hint}</p>
        ) : (
          <p className="vp-preview" aria-live="polite">
            {preview.final}{preview.final && preview.partial ? ' ' : ''}
            <span className="vp-partial">{preview.partial}</span>
          </p>
        )}

        {!error && (
          <button ref={stopRef} type="button" className="vp-stop" onClick={stop} disabled={stopDisabled}>
            <Square size={16} fill="currentColor" aria-hidden="true" />
            <span>Stop</span>
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
