// Play / pause an assistant reply aloud (one reply at a time, see lib/tts).
import { ActivityIndicator, Alert, TouchableOpacity } from 'react-native'
import { Pause, Volume2 } from 'lucide-react-native'
import { loadTts, tts, ttsAvailable, useTtsState } from '../lib/tts'

export default function SpeakerButton({ consultationId, messageId, color, activeColor, style }) {
  const s = useTtsState()
  if (!ttsAvailable || !consultationId || !messageId) return null
  const status = s.id === messageId ? s.status : 'idle'
  const playing = status === 'playing'

  const onPress = () => {
    if (playing) { tts.pause(); return }
    tts.play(messageId, () => loadTts(consultationId, messageId))
      .catch((e) => Alert.alert('Read aloud', e?.message || 'Could not read this reply aloud.'))
  }

  return (
    <TouchableOpacity
      style={style}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause reply' : 'Play reply'}
      accessibilityState={{ busy: status === 'loading' }}
    >
      {status === 'loading' ? <ActivityIndicator size="small" color={activeColor} />
        : playing ? <Pause size={14} color={activeColor} />
          : <Volume2 size={14} color={color} />}
    </TouchableOpacity>
  )
}
