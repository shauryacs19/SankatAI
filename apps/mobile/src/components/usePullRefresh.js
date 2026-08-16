// Pull-to-refresh (drag down from the top) for screens that load server data.
// Returns a themed <RefreshControl/> to pass to a ScrollView's `refreshControl`.
// The chat screen deliberately does not use this (its list is inverted and the
// gesture would fight message loading).
//
// Usage:
//   const onRefresh = useCallback(async () => { await load() }, [load])
//   <ScrollView refreshControl={usePullRefresh(onRefresh)} …>

import { useCallback, useState } from 'react'
import { RefreshControl } from 'react-native'
import { useTheme } from '../context/ThemeContext'

// `enabled` (default true) lets a screen suppress the gesture — e.g. while a file
// is being held and dragged, so the drag can't also trigger a reload.
// `progressViewOffset` pins the spinner to the top of the scroll area (Android),
// so nested lists show it in the same place as full-screen ones.
export default function usePullRefresh(onRefresh, enabled = true, progressViewOffset = 0) {
  const { colors } = useTheme()
  const [refreshing, setRefreshing] = useState(false)

  const handle = useCallback(async () => {
    if (!enabled) return
    setRefreshing(true)
    try { await onRefresh?.() } catch { /* screens surface their own errors */ }
    finally { setRefreshing(false) }
  }, [onRefresh, enabled])

  return (
    <RefreshControl
      refreshing={enabled && refreshing}
      onRefresh={handle}
      enabled={enabled}
      progressViewOffset={progressViewOffset}
      tintColor={colors.primary}
      colors={[colors.primary]}
      progressBackgroundColor={colors.surface}
    />
  )
}
