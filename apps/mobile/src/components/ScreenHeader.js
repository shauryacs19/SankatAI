// Compact top bar with a ☰ button that opens the drawer. Used by the pages that
// live behind the drawer (Profile, Documents, Emergency, Settings).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Menu } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

export default function ScreenHeader({ title, navigation, right = null }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.bar}>
      <TouchableOpacity onPress={() => navigation?.openDrawer?.()} hitSlop={10} style={styles.menuBtn}>
        <Menu size={22} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.title}>{title}</Text>
      <View style={{ flex: 1 }} />
      {right}
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  menuBtn: { padding: 2 },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
})
