// Lightweight toast (web parity: failures/successes that used to be silent now
// say so). One at a time, auto-hides; error toasts stay a little longer.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Text, TouchableOpacity, StyleSheet, AccessibilityInfo } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'

const ToastContext = createContext(null)
const NOOP = { success: () => {}, error: () => {}, info: () => {} }

export function ToastProvider({ children }) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [toast, setToast] = useState(null) // { id, tone, text }
  const a = useRef(new Animated.Value(0)).current
  const timer = useRef(null)

  const hide = useCallback(() => {
    Animated.timing(a, { toValue: 0, duration: 160, useNativeDriver: true }).start(() => setToast(null))
  }, [a])

  const show = useCallback((tone, text) => {
    if (!text) return
    if (timer.current) clearTimeout(timer.current)
    setToast({ id: Date.now(), tone, text })
    AccessibilityInfo.announceForAccessibility?.(text)
    Animated.timing(a, { toValue: 1, duration: 180, useNativeDriver: true }).start()
    timer.current = setTimeout(hide, tone === 'error' ? 5000 : 3000)
  }, [a, hide])
  useEffect(() => () => timer.current && clearTimeout(timer.current), [])

  const api = useMemo(() => ({
    success: (t) => show('success', t), error: (t) => show('error', t), info: (t) => show('info', t),
  }), [show])

  const tone = toast?.tone
  const Icon = tone === 'error' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Info
  const ink = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.text

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { bottom: insets.bottom + 90, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }]}
        >
          <TouchableOpacity
            activeOpacity={0.9}
            onPress={hide}
            accessibilityRole="alert"
            style={[styles.toast, { backgroundColor: colors.surface, borderColor: tone === 'error' ? colors.dangerBorder : colors.border }]}
          >
            <Icon size={16} color={ink} />
            <Text style={[styles.text, { color: colors.text }]}>{toast.text}</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext) || NOOP

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 500, elevation: 20 },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 480, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  text: { flexShrink: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
})
