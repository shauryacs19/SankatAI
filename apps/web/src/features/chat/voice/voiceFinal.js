import { voiceResult } from '@sankatai/shared/voice'

// VITE_VOICE_AUTO_SEND=false leaves the transcript in the box for editing.
export const VOICE_AUTO_SEND = import.meta.env.VITE_VOICE_AUTO_SEND !== 'false'

// Ends a recording: the text goes in the box and, when appropriate, through
// the normal chat send. `base` is what was typed before recording started.
// Returns whether it sent.
export function applyVoiceFinal({ base, transcript, error, autoSend = VOICE_AUTO_SEND, setInput, send }) {
  const r = voiceResult(base, transcript, { autoSend, error })
  setInput(r.text)
  if (r.send) send(r.text)
  return r.send
}
