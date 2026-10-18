// Share a reply with the system share sheet, or copy it where that is missing.
import { sevMeta } from '@sankatai/shared'

export const shareReply = async (m) => {
  const text = [m.severity ? sevMeta(m.severity).title : 'SankatAI', String(m.text || '').replace(/\*\*/g, '')].filter(Boolean).join('\n\n')
  try {
    if (navigator.share) await navigator.share({ text })
    else await navigator.clipboard.writeText(text)
  } catch { /* cancelled */ }
}
