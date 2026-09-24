import { FileText, Image as ImageIcon, Paperclip, Mic, Send, Square, X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { VOICE_LANGUAGES } from '@sankatai/shared/voice'
import { IconButton, Menu, Spinner } from '../../../components/ui'

export default function Composer({
  input, setInput, onSubmit, isLoading, voice, attachments, onRemoveAttachment, docInputRef, photoInputRef,
}) {
  const recording = voice.state === 'recording'
  const processing = voice.state === 'processing'
  const voiceBusy = voice.state !== 'idle'
  const ready = attachments.filter((a) => a.status === 'uploaded')
  const uploading = attachments.some((a) => a.status === 'uploading')
  // While voice is active the transcript owns the box and sends itself.
  const canSend = (input.trim() || ready.length > 0) && !isLoading && !voiceBusy
  const sendLabel = isLoading ? 'Analysing your symptoms…' : uploading && !input.trim() ? 'Waiting for uploads to finish' : 'Send message'

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

        <form className="composer" onSubmit={(e) => (voiceBusy ? e.preventDefault() : onSubmit(e))} aria-label="Describe your symptoms">
          <Menu
            label="Attach a file"
            icon={Paperclip}
            placement="top"
            align="start"
            items={[
              { key: 'doc', label: 'Document', icon: FileText, onSelect: () => docInputRef.current?.click() },
              { key: 'photo', label: 'Photo', icon: ImageIcon, onSelect: () => photoInputRef.current?.click() },
            ]}
          />
          <label htmlFor="composer-input" className="sr-only">Describe your symptoms</label>
          <input
            id="composer-input"
            className="composer-input"
            type="text"
            autoComplete="off"
            enterKeyHint="send"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            readOnly={voiceBusy}
            placeholder={recording ? 'Listening…' : processing ? 'Finishing transcription…' : 'Describe your symptoms…'}
          />
          <label htmlFor="composer-lang" className="sr-only">Voice input language</label>
          <select id="composer-lang" className="composer-lang" value={voice.language} onChange={(e) => voice.setLanguage(e.target.value)} disabled={voiceBusy}>
            {VOICE_LANGUAGES.map((l) => <option key={l.code} value={l.code} title={l.label}>{l.short}</option>)}
          </select>
          <IconButton
            label={recording ? 'Stop recording' : processing ? 'Transcribing…' : 'Voice input'}
            icon={recording ? Square : Mic}
            className={recording ? 'composer-mic--rec' : ''}
            aria-pressed={recording}
            disabled={processing}
            onClick={voice.toggle}
          >
            {processing && <Spinner size={18} />}
          </IconButton>
          <span className="sr-only" role="status">{recording ? 'Recording. Speak now.' : processing ? 'Transcribing.' : ''}</span>
          <IconButton type="submit" variant="primary" label={sendLabel} disabled={!canSend} aria-busy={isLoading || undefined} tooltipAlign="end">
            {isLoading ? <Spinner size={18} /> : <Send size={18} aria-hidden="true" />}
          </IconButton>
        </form>

        <p className="composer-note">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>SankatAI gives guidance, not a diagnosis. In an emergency, <a href="tel:108">call 108</a>.</span>
        </p>
      </div>
    </div>
  )
}
