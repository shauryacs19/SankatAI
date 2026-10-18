import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { FileText, Image as ImageIcon, Paperclip, Mic, Send, X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { voiceFlags } from '@sankatai/shared/voice'
import { Button, IconButton, Menu, Spinner } from '../../../components/ui'
import VoicePopup from '../voice/VoicePopup.jsx'

// Grows with the text up to this height, then scrolls.
const MAX_HEIGHT_PX = 208

// Phones get a shorter placeholder so it fits on one line of the compact row.
const NARROW = '(max-width: 479px)'
const subscribeNarrow = (cb) => {
  const m = window.matchMedia?.(NARROW)
  m?.addEventListener?.('change', cb)
  return () => m?.removeEventListener?.('change', cb)
}
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => Boolean(window.matchMedia?.(NARROW)?.matches), () => false)

export default function Composer({
  input, setInput, onSubmit, isLoading, voice, attachments, onRemoveAttachment, docInputRef, photoInputRef,
}) {
  const { popupOpen, inputReadOnly } = voiceFlags(voice.state, { text: input, sending: isLoading })
  const inputRef = useRef(null)
  const formRef = useRef(null)
  const narrow = useNarrow()

  // Review: the transcript is in the box — focus it with the cursor at the end.
  useEffect(() => {
    if (voice.state !== 'review') return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [voice.state])

  // Auto-size to the content (typing, voice transcripts and suggestions alike).
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    // Empty: rest at the CSS min-height (a wrapping placeholder must not grow it).
    if (input) el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
  }, [input])

  const ready = attachments.filter((a) => a.status === 'uploaded')
  const uploading = attachments.some((a) => a.status === 'uploading')
  // Voice never sends by itself; Send is off while the listening popup is open.
  const canSend = (input.trim() || ready.length > 0) && !isLoading && !popupOpen
  const sendLabel = isLoading ? 'Analysing your symptoms…' : uploading && !input.trim() ? 'Waiting for uploads to finish' : 'Send message'

  // Enter sends; Shift+Enter adds a line. Never mid-IME composition.
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (canSend) formRef.current?.requestSubmit()
  }

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        {attachments.length > 0 && (
          <ul role="list" className="att-tray" aria-label="Attachments">
            {attachments.map((a) => (
              <li key={a.localId} className={`att-card ${a.status === 'failed' ? 'att-card--failed' : ''}`}>
                <span className="att-remove"><IconButton label={`Remove ${a.name}`} icon={X} size={14} variant="secondary" tooltip={false} onClick={() => onRemoveAttachment(a.localId)} /></span>
                <span className="att-thumb">
                  {a.kind === 'photo' && a.previewUrl ? <img src={a.previewUrl} alt="" /> : a.kind === 'photo' ? <ImageIcon size={24} aria-hidden="true" /> : <FileText size={24} aria-hidden="true" />}
                </span>
                <span className="att-name" title={a.name}>{a.name}</span>
                {a.status === 'uploading' && <span className="att-status" role="status"><Spinner size={12} /> Uploading…</span>}
                {a.status === 'failed' && <span className="att-status att-status--err" role="status"><AlertTriangle size={12} aria-hidden="true" /> Upload failed</span>}
                {a.status === 'uploaded' && <span className="att-status">Ready</span>}
              </li>
            ))}
          </ul>
        )}

        <form ref={formRef} className="composer" onSubmit={(e) => (canSend ? onSubmit(e) : e.preventDefault())} aria-label="Describe your symptoms">
          <label htmlFor="composer-input" className="sr-only">Describe your symptoms</label>
          <textarea
            ref={inputRef}
            id="composer-input"
            className="composer-input"
            rows={1}
            autoComplete="off"
            enterKeyHint="send"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            readOnly={inputReadOnly}
            aria-describedby="composer-keys"
            placeholder={narrow ? 'Describe symptoms…' : 'Describe your symptoms…'}
          />
          <span id="composer-keys" className="sr-only">Press Enter to send. Press Shift and Enter for a new line.</span>
          <div className="composer-actions">
            <Menu
              label="Attach a file"
              text="Attach"
              icon={Paperclip}
              placement="top"
              align="start"
              items={[
                { key: 'doc', label: 'Document', icon: FileText, onSelect: () => docInputRef.current?.click() },
                { key: 'photo', label: 'Photo', icon: ImageIcon, onSelect: () => photoInputRef.current?.click() },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={Mic}
              aria-haspopup="dialog"
              disabled={popupOpen}
              onClick={voice.open}
            >
              <span className="ui-btn-text">{voice.state === 'review' ? 'Record more' : 'Voice input'}</span>
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              icon={Send}
              className="composer-send"
              aria-label={sendLabel}
              loading={isLoading}
              loadingText={<span className="ui-btn-text">Send</span>}
              disabled={!canSend}
            >
              <span className="ui-btn-text">Send</span>
            </Button>
          </div>
        </form>

        <VoicePopup voice={voice} />

        <p className="composer-note">
          <ShieldCheck size={16} aria-hidden="true" />
          <span>SankatAI gives guidance, not a diagnosis. In an emergency, <a className="link link--emergency" href="tel:108">call 108</a>.</span>
        </p>
      </div>
    </div>
  )
}
