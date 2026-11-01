// Small building blocks shared by the Health records views.
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, RotateCw } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { makeStyles } from './styles'

export function useStyles() {
  const { colors } = useTheme()
  return { colors, styles: makeStyles(colors) }
}

export function Loading() {
  const { colors, styles } = useStyles()
  return <View style={styles.empty}><ActivityIndicator color={colors.primary} /></View>
}

export function Empty({ Icon, title, text, action }) {
  const { colors, styles } = useStyles()
  return (
    <View style={styles.empty}>
      {Icon && <Icon size={28} color={colors.muted} />}
      <Text style={styles.emptyTitle}>{title}</Text>
      {!!text && <Text style={styles.emptyText}>{text}</Text>}
      {action}
    </View>
  )
}

export function ErrorBox({ message, onRetry }) {
  const { colors, styles } = useStyles()
  return (
    <View style={styles.empty} accessibilityRole="alert">
      <AlertTriangle size={26} color={colors.sevEmergency} />
      <Text style={styles.errorText}>{message}</Text>
      {onRetry && <TouchableOpacity style={styles.ghostBtn} onPress={onRetry}><RotateCw size={15} color={colors.textSecondary} /><Text style={styles.ghostText}>Try again</Text></TouchableOpacity>}
    </View>
  )
}

// tone: neutral | warn | ok | danger. Always icon/word, never colour alone.
export function Badge({ tone = 'neutral', Icon, children }) {
  const { colors, styles } = useStyles()
  const bg = { warn: styles.badgeWarn, ok: styles.badgeOk, danger: styles.badgeDanger }[tone]
  return (
    <View style={[styles.badge, bg]}>
      {Icon && <Icon size={12} color={tone === 'danger' ? colors.sevEmergency : colors.textSecondary} />}
      <Text style={[styles.badgeText, tone === 'warn' && styles.badgeWarnText]}>{children}</Text>
    </View>
  )
}

export const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
export const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')
