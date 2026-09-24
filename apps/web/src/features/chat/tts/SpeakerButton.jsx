// Play / pause a reply aloud. Keyboard operable (it's a button); the label
// tracks the state for screen readers.
import { Pause, Volume2 } from 'lucide-react'
import { IconButton, Spinner, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { fetchTts } from '../services/chatApi'
import { ttsPlayer, useTtsState } from './ttsPlayer'

export default function SpeakerButton({ consultationId, messageId }) {
  const toast = useToast()
  const s = useTtsState()
  const status = s.id === messageId ? s.status : 'idle'
  const playing = status === 'playing'
  const loading = status === 'loading'

  const onClick = () => {
    if (playing) { ttsPlayer.pause(); return }
    ttsPlayer.play(messageId, () => fetchTts(consultationId, messageId))
      .catch((e) => toast.error(errText(e, 'Could not read this reply aloud.')))
  }

  return (
    <IconButton
      className="msg-ai-speak"
      label={playing ? 'Pause reply' : 'Play reply'}
      icon={playing ? Pause : Volume2}
      size={16}
      aria-busy={loading || undefined}
      disabled={!consultationId || !messageId}
      onClick={onClick}
    >
      {loading ? <Spinner size={16} /> : undefined}
    </IconButton>
  )
}
