// Full-screen in-app image preview. Non-image files are handled by
// `lib/preview.js` -> openInAppBrowser (expo-web-browser), so nothing ever
// leaves the app.

import { useState } from 'react'
import { View, Text, Modal, Image, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { X } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

export default function FilePreview({ file, onClose }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  return (
    <Modal visible={!!file} animationType="fade" transparent={false} onRequestClose={onClose} onShow={() => { setLoading(true); setFailed(false) }}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.head}>
          <Text numberOfLines={1} style={styles.title}>{file?.name || 'Preview'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close preview"><X size={20} color="#fff" /></TouchableOpacity>
        </View>
        <View style={styles.body}>
          {!!file?.url && !failed && (
            <Image
              source={{ uri: file.url }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              onLoadEnd={() => setLoading(false)}
              onError={() => { setLoading(false); setFailed(true) }}
            />
          )}
          {loading && !failed && <ActivityIndicator color={colors.primary} />}
          {failed && <Text style={styles.err}>This image could not be loaded.</Text>}
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  title: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.muted, fontSize: 13 },
})
