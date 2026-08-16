import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Siren, Ambulance, MoreVertical, Trash2,
  Phone, MapPin, Stethoscope, HeartPulse, Activity, FileText, Image as ImageIcon,
  Paperclip, Mic, Send, ClipboardList, Gauge, AlertTriangle,
  ThumbsUp, ThumbsDown, ShieldCheck, CheckCheck, Share2, Lock,
} from 'lucide-react'
import { sevMeta, AI_DISCLAIMER, EMERGENCY_CALLOUT, CHAT_SUGGESTIONS } from '@sankatai/shared'

import { formatBold, parseAnalysis, fmtTime, SEV } from '../../chat/utils/format.jsx'

export default function ChatPage() {
  const {
    messages, input, setInput, isLoading,
    isEmergency, setIsEmergency, lastRiskScore, analysisOpen, setAnalysisOpen,
    attachMenuOpen, setAttachMenuOpen, attachments, removeAttachment, isListening,
    docInputRef, photoInputRef,
    handleSend, handleVoice, handleFindHospitals, handleSendLocationAlert, submitFeedback,
    primaryContact, firstName, chatAttachmentMap, unsendMessageById,
  } = useOutletContext()

  // Resolve a message's attachments: optimistic messages carry `attachments`
  // (with local preview URLs); history messages carry `attachmentIds` resolved
  // via the chat's attachment map (with fresh presigned URLs).
  const shareMessage = async (m) => {
    const text = [m.severity ? sevMeta(m.severity).title : 'SankatAI', m.text].filter(Boolean).join('\n\n')
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch { /* cancelled */ }
  }

  const msgAttachments = (m) => {
    if (m.attachments?.length) return m.attachments
    if (m.attachmentIds?.length) {
      return m.attachmentIds
        .map((id) => { const a = chatAttachmentMap?.[id]; return a ? { attachmentId: id, kind: a.kind, name: a.filename, url: a.downloadUrl } : null })
        .filter(Boolean)
    }
    return []
  }
  const openAtt = (att) => { if (att.url) window.open(att.url, '_blank', 'noopener') }

  // three-dot menu on your own messages (Unsend)
  const [menuFor, setMenuFor] = useState(null)
  useEffect(() => {
    if (!menuFor) return undefined
    const close = () => setMenuFor(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [menuFor])

  const chatRef = useRef(null)
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, isLoading])

  const latestAnalysis = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.sender === 'bot' && m.raw) {
        const p = parseAnalysis(m.raw)
        if (p && (p.severity || p.followUpQuestions?.length)) return p
      }
    }
    return null
  }, [messages])

  const showEmpty = messages.length === 0 && !isLoading

  return (
    <div className="db-view chat-view">
      <div className="dx-chat-col">
        <AnimatePresence>
          {isEmergency && (
            <motion.section className="dx-emergency" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <div className="dx-emergency-head"><span><Siren size={16} /> Possible emergency</span><span className="dx-emergency-risk">Risk {lastRiskScore ?? 0}</span></div>
              <div className="dx-emergency-actions">
                <a href="tel:108" className="dx-ea danger"><Ambulance size={15} /> Ambulance</a>
                <button className="dx-ea" onClick={() => primaryContact?.phone && (window.location.href = `tel:${primaryContact.phone}`)} disabled={!primaryContact?.phone}><Phone size={15} /> Contact</button>
                <button className="dx-ea" onClick={handleSendLocationAlert} disabled={!primaryContact?.phone}><MapPin size={15} /> Location</button>
                <button className="dx-ea" onClick={handleFindHospitals}><MapPin size={15} /> Hospital</button>
              </div>
              <button className="dx-emergency-dismiss" onClick={() => setIsEmergency(false)}>Dismiss</button>
            </motion.section>
          )}
        </AnimatePresence>

        <div className="dx-chat" ref={chatRef}>
          {showEmpty ? (
            <motion.div className="dx-greeting" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
              <div className="dx-greeting-badge"><Stethoscope size={26} /></div>
              <h2>Hi {firstName}, how can I help?</h2>
              <p>Describe your symptoms and I'll assess the urgency. This isn't a substitute for professional medical care.</p>
              <div className="dx-suggestions">
                {['I have chest pain and shortness of breath', 'High fever and headache for 2 days', "Deep cut that won't stop bleeding"].map((s) => (
                  <button key={s} className="dx-suggest" onClick={() => setInput(s)}>{s}</button>
                ))}
              </div>
            </motion.div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((m) => (
                <motion.div key={m.id} className={`dx-msg ${m.sender}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
                  {m.sender === 'bot' && <div className="dx-msg-avatar"><HeartPulse size={16} /></div>}
                  <div className="dx-msg-body">
                    {(() => { const atts = msgAttachments(m); return atts.length > 0 && (
                      <div className="dx-msg-atts">
                        {atts.map((att) => (att.kind === 'photo' && att.url ? (
                          <button key={att.attachmentId} type="button" className="dx-att-img" onClick={() => openAtt(att)} title={att.name}><img src={att.url} alt={att.name} /></button>
                        ) : (
                          <button key={att.attachmentId} type="button" className="dx-att-doc" onClick={() => openAtt(att)} title={att.name}><FileText size={15} /><span className="dx-att-name">{att.name}</span></button>
                        )))}
                      </div>
                    ) })()}

                    {m.sender === 'user' ? (
                      <>
                        <div className="dx-userline">
                          <div className="dx-msgmenu">
                            <button
                              type="button"
                              className="dx-msgmenu-btn"
                              aria-label="Message options"
                              aria-haspopup="menu"
                              aria-expanded={menuFor === m.id}
                              onClick={(e) => { e.stopPropagation(); setMenuFor(menuFor === m.id ? null : m.id) }}
                            ><MoreVertical size={16} /></button>
                            {menuFor === m.id && (
                              <div className="dx-msgmenu-pop" role="menu" onClick={(e) => e.stopPropagation()}>
                                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); unsendMessageById(m.id) }}>
                                  <Trash2 size={14} /> Unsend
                                </button>
                              </div>
                            )}
                          </div>
                          {m.text && <div className="dx-bubble user"><p>{formatBold(m.text)}</p></div>}
                        </div>
                        <span className="dx-msg-time">
                          {fmtTime(m.createdAt)}
                          {m.status === 'sent'
                            ? <span className="dx-delivery" role="status">Sending<span className="dx-sending-dots"><span>.</span><span>.</span><span>.</span></span></span>
                            : <CheckCheck size={13} className="dx-tick" />}
                        </span>
                      </>
                    ) : (
                      <div className={`dx-aicard ${m.severity && SEV[m.severity] ? `sev-${SEV[m.severity].cls}` : ''}`}>
                        {m.severity && SEV[m.severity] && (
                          <div className="dx-aicard-head">
                            <span className="dx-aicard-ic">{m.severity === 'EMERGENCY' ? <Siren size={16} /> : <HeartPulse size={16} />}</span>
                            <span className="dx-aicard-title">
                              {sevMeta(m.severity).title}{m.riskScore != null && <> &nbsp;•&nbsp; {m.riskScore}/100</>}
                            </span>
                            <span className="dx-aicard-pill">{sevMeta(m.severity).label}</span>
                          </div>
                        )}

                        {m.text && <p className="dx-aicard-body">{formatBold(m.text)}</p>}

                        {m.severity === 'EMERGENCY' && (
                          <div className="dx-aicard-callout"><Phone size={16} /><span>{EMERGENCY_CALLOUT}</span></div>
                        )}

                        {Array.isArray(m.recommendations) && m.recommendations.length > 0 && (
                          <div className="dx-aicard-recs">
                            <h4>Recommendations</h4>
                            <ul>{m.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
                          </div>
                        )}

                        {m.followUp && <p className="dx-aicard-follow">{m.followUp}</p>}

                        {m.severity && (
                          <p className="dx-aicard-disclaimer"><ShieldCheck size={13} /> <span>{AI_DISCLAIMER}</span></p>
                        )}

                        <div className="dx-aicard-foot">
                          <span className="dx-aicard-time">{fmtTime(m.createdAt)}</span>
                          {m.id && !String(m.id).startsWith('err-') && (
                            <div className="dx-feedback" role="group" aria-label="Was this AI response helpful?">
                              <button
                                type="button"
                                className={`dx-fb ${m.feedback === 'like' ? 'active' : ''}`}
                                onClick={() => submitFeedback(m.id, 'like')}
                                aria-pressed={m.feedback === 'like'}
                                title="Helpful"
                              ><ThumbsUp size={14} /> Helpful</button>
                              <button
                                type="button"
                                className={`dx-fb ${m.feedback === 'dislike' ? 'active dislike' : ''}`}
                                onClick={() => submitFeedback(m.id, 'dislike')}
                                aria-pressed={m.feedback === 'dislike'}
                                title="Not helpful"
                              ><ThumbsDown size={14} /> Not helpful</button>
                              <button type="button" className="dx-fb" onClick={() => shareMessage(m)} title="Share" aria-label="Share this response"><Share2 size={14} /></button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
          {isLoading && <div className="dx-msg bot"><div className="dx-msg-avatar"><HeartPulse size={16} /></div><div className="dx-typing"><span /><span /><span /></div></div>}
        </div>

        <div className="dx-quickchips">
          {CHAT_SUGGESTIONS.map((c) => (
            <button
              key={c.key}
              type="button"
              className="dx-quickchip"
              onClick={() => (c.action === 'hospital' ? handleFindHospitals() : setInput(c.prompt))}
            >
              {c.action === 'hospital' ? <MapPin size={14} /> : <ClipboardList size={14} />} {c.label}
            </button>
          ))}
        </div>

        {attachments.length > 0 && (
          <div className="dx-chips">
            {attachments.map((a, i) => (
              <div key={a.localId || i} className={`dx-attcard ${a.status || ''}`} title={a.name}>
                <button type="button" className="dx-attcard-x" onClick={() => removeAttachment(i)} aria-label="Remove attachment"><X size={13} /></button>
                <div className="dx-attcard-thumb">
                  {a.kind === 'photo' && a.previewUrl ? <img src={a.previewUrl} alt="" /> : (a.kind === 'photo' ? <ImageIcon size={26} /> : <FileText size={26} />)}
                </div>
                <span className="dx-attcard-name">{a.name}</span>
                {a.status === 'uploading' && <span className="dx-attcard-status">Uploading…</span>}
                {a.status === 'failed' && <span className="dx-attcard-status err">Failed</span>}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSend} className="dx-inputbar">
          <div className="dx-attach-wrap">
            <AnimatePresence>
              {attachMenuOpen && (
                <motion.div className="dx-attach-menu" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }}>
                  <button type="button" onClick={() => docInputRef.current?.click()}><FileText size={16} /> Documents</button>
                  <button type="button" onClick={() => photoInputRef.current?.click()}><ImageIcon size={16} /> Photos</button>
                </motion.div>
              )}
            </AnimatePresence>
            <button type="button" className={`dx-icon-btn ${attachMenuOpen ? 'active' : ''}`} onClick={() => setAttachMenuOpen((o) => !o)} title="Attach"><Paperclip size={18} /></button>
          </div>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Describe your symptoms…" />
          <button type="button" className={`dx-icon-btn ${isListening ? 'listening' : ''}`} onClick={handleVoice} title="Voice"><Mic size={18} /></button>
          <button type="submit" className="dx-send" disabled={isLoading}><Send size={18} /></button>
        </form>
        <p className="dx-secure"><Lock size={12} /> Your data is encrypted and secure</p>
      </div>

      {/* AI analysis drawer */}
      <aside className={`dx-right ${analysisOpen ? 'open' : ''}`}>
        <div className="dx-right-head"><span><ClipboardList size={16} /> AI Analysis</span><button className="db-icon-ghost" onClick={() => setAnalysisOpen(false)}><X size={16} /></button></div>
        <AnimatePresence mode="wait">
          {latestAnalysis && latestAnalysis.severity ? (
            <motion.div key="a" className="dx-analysis" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>
              <div className={`dx-acard sev-${(SEV[latestAnalysis.severity]?.cls) || 'low'}`}>
                <div className="dx-acard-top">
                  <span className={`dx-pill lg sev-${(SEV[latestAnalysis.severity]?.cls) || 'low'}`}><AlertTriangle size={13} /> {SEV[latestAnalysis.severity]?.label || latestAnalysis.severity}</span>
                  <span className="dx-risk"><Gauge size={13} /> {latestAnalysis.riskScore ?? '—'}<small>/100</small></span>
                </div>
                <div className="dx-riskbar"><div className={`dx-riskbar-fill sev-${(SEV[latestAnalysis.severity]?.cls) || 'low'}`} style={{ width: `${Math.min(100, Math.max(0, latestAnalysis.riskScore || 0))}%` }} /></div>
              </div>
              {latestAnalysis.advice && <div className="dx-acard"><div className="dx-acard-h"><HeartPulse size={14} /> Recommendation</div><p>{formatBold(latestAnalysis.advice)}</p></div>}
              {latestAnalysis.reasoning && <div className="dx-acard"><div className="dx-acard-h"><ClipboardList size={14} /> Clinical reasoning</div><p className="dx-muted-text">{latestAnalysis.reasoning}</p></div>}
              <div className="dx-acard"><div className="dx-acard-h"><Siren size={14} /> Quick actions</div><div className="dx-action-grid">
                <a href="tel:108" className="dx-action danger"><Ambulance size={15} /> Ambulance</a>
                <button className="dx-action" onClick={handleSendLocationAlert} disabled={!primaryContact?.phone}><MapPin size={15} /> Share location</button>
                <button className="dx-action" onClick={handleFindHospitals}><MapPin size={15} /> Find hospital</button>
              </div></div>
              {latestAnalysis.disclaimer && <p className="dx-disclaimer">{latestAnalysis.disclaimer}</p>}
            </motion.div>
          ) : (
            <motion.div key="e" className="dx-analysis-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Activity size={30} /><p>AI analysis will appear here once you describe your symptoms.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
      {analysisOpen && <div className="db-scrim" onClick={() => setAnalysisOpen(false)} />}
    </div>
  )
}
