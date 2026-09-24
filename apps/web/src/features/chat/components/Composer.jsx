import { FileText, Image as ImageIcon, Paperclip, Mic, Send, X, ShieldCheck, AlertTriangle } from 'lucide-react'
import { IconButton, Menu, Spinner } from '../../../components/ui'

export default function Composer({
  input, setInput, onSubmit, isLoading, isListening, onVoice, attachments, onRemoveAttachment, docInputRef, photoInputRef,
}) {
  const ready = attachments.filter((a) => a.status === 'uploaded')
  const uploading = attachments.some((a) => a.status === 'uploading')
  const canSend = (input.trim() || ready.length > 0) && !isLoading
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

        <form className="composer" onSubmit={onSubmit} aria-label="Describe your symptoms">
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
            placeholder="Describe your symptoms…"
          />
          <IconButton label={isListening ? 'Stop voice input' : 'Voice input'} icon={Mic} aria-pressed={isListening} onClick={onVoice} />
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
