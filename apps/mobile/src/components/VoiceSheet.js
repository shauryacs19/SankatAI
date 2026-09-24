// Listening bottom sheet: opens when the mic is pressed, closes on Stop (after
// the last final result) or Cancel. The transcript is never sent from here —
// it lands in the chat input for review.
//
// A11y: announced as a modal; status is a polite live region; Android back =
// Cancel. Tapping the dimmed backdrop does nothing, so a stray tap can't end a
// recording. Ripple rings animate only while speech is detected, and not at
// all with Reduce Motion on.
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Animated, Easing, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Mic, MicOff, Square, X } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { voiceLanguageLabel } from '../../../../packages/shared/voice'

const RING_DELAYS = [0, 400, 800]

function useReduceMotion() {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {})
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce)
    return () => sub.remove()
  }, [])
  return reduce
}

function Ripple({ active, level, color }) {
  const rings = useRef(RING_DELAYS.map(() => new Animated.Value(0))).current
  useEffect(() => {
    if (!active) { rings.forEach((r) => r.setValue(0)); return undefined }
    const loops = rings.map((r, i) => Animated.sequence([
      Animated.delay(RING_DELAYS[i]),
      Animated.loop(Animated.timing(r, { toValue: 1, duration: 1200, easing: Easing.out(Easing.ease), useNativeDriver: true })),
    ]))
    loops.forEach((l) => l.start())
    return () => { loops.forEach((l) => l.stop()); rings.forEach((r) => r.setValue(0)) }
  }, [active, rings])
  // Scale 1 -> 1.6 + level * 1.2, fading out.
  const reach = Animated.add(0.6, Animated.multiply(level, 1.2))
  return rings.map((r, i) => (
    <Animated.View
      key={i}
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          borderRadius: 36, backgroundColor: color,
          opacity: r.interpolate({ inputRange: [0, 1], outputRange: [active ? 0.35 : 0, 0] }),
          transform: [{ scale: Animated.add(1, Animated.multiply(r, reach)) }],
        },
      ]}
    />
  ))
}

export default function VoiceSheet({ voice }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const reduce = useReduceMotion()
  const { state, preview, error, live, speaking, level, stop, cancel } = voice
  const open = state === 'recording' || state === 'finalizing'
  const finalizing = state === 'finalizing'
  const starting = !live && !error && !finalizing
  const status = error ? error.message
    : finalizing ? 'Processing…'
      : starting ? 'Starting microphone…'
        : speaking ? 'Listening…' : 'Say something…'
  const micScale = reduce || error ? 1 : Animated.add(1, Animated.multiply(level, 0.25))

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={cancel} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <TouchableOpacity style={styles.close} onPress={cancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={error ? 'Close' : 'Cancel recording'}>
            <X size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.micWrap}>
            {!reduce && !error && <Ripple active={speaking && live} level={level} color={colors.primary} />}
            <Animated.View style={[styles.mic, error && styles.micError, { transform: [{ scale: micScale }] }]}>
              {error ? <MicOff size={32} color={colors.primary} /> : <Mic size={32} color="#fff" />}
            </Animated.View>
          </View>

          <Text style={[styles.status, error && { color: colors.primary }]} accessibilityLiveRegion="polite">{status}</Text>
          {!error && !!preview.language && (
            <Text style={styles.langChip} accessibilityLabel={`Detected language: ${voiceLanguageLabel(preview.language)}`}>
              {voiceLanguageLabel(preview.language)}
            </Text>
          )}
          {error ? (
            <>
              {error.hint ? <Text style={styles.hint}>{error.hint}</Text> : null}
              {error.settings && (
                <TouchableOpacity style={styles.settingsBtn} onPress={() => Linking.openSettings()} accessibilityRole="button">
                  <Text style={styles.settingsText}>Open settings</Text>
                </TouchableOpacity>
              )}
            </>
          ) : (
            <>
              <Text style={styles.preview} accessibilityLiveRegion="polite" numberOfLines={5}>
                {preview.final}{preview.final && preview.partial ? ' ' : ''}
                <Text style={{ color: colors.muted }}>{preview.partial}</Text>
              </Text>
              <TouchableOpacity
                style={[styles.stopBtn, (finalizing || starting) && { opacity: 0.55 }]}
                onPress={stop}
                disabled={finalizing || starting}
                accessibilityRole="button"
                accessibilityLabel="Stop"
              >
                <Square size={16} color="#fff" fill="#fff" />
                <Text style={styles.stopText}>Stop</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36,
    backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  close: { position: 'absolute', top: 16, right: 16, padding: 4 },
  micWrap: { width: 72, height: 72, marginVertical: 28, alignItems: 'center', justifyContent: 'center' },
  mic: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  micError: { backgroundColor: colors.primarySoft },
  status: { fontSize: 18, fontWeight: '600', color: colors.text },
  langChip: {
    marginTop: -6, paddingHorizontal: 10, paddingVertical: 2, borderRadius: 12, overflow: 'hidden',
    backgroundColor: colors.primarySoft, color: colors.primary, fontSize: 12, fontWeight: '600',
  },
  hint: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', maxWidth: 300 },
  preview: { minHeight: 44, fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center' },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8,
    minWidth: 140, height: 48, paddingHorizontal: 24, borderRadius: 24, backgroundColor: colors.sevEmergency,
  },
  stopText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  settingsBtn: { marginTop: 8, height: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.primary },
  settingsText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})
