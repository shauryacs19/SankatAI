// Dependency-free wheel picker built on a snap-scrolling ScrollView (works in
// Expo Go, no native picker needed). Plus a DateWheels wrapper: day / month / year.

import { useEffect, useMemo, useRef } from 'react'
import { View, Text, ScrollView, StyleSheet } from 'react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'

const ITEM_H = 44
const VISIBLE = 5 // odd -> one centered row
const PAD = Math.floor(VISIBLE / 2) * ITEM_H

export function WheelPicker({ items, value, onChange, flex = 1 }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const ref = useRef(null)
  const index = Math.max(0, items.findIndex((it) => it.value === value))

  // Keep the selected row centered when the value changes from outside (e.g. the
  // day list shrinks when the month changes).
  useEffect(() => {
    const id = setTimeout(() => ref.current?.scrollTo({ y: index * ITEM_H, animated: false }), 0)
    return () => clearTimeout(id)
  }, [index])

  const onEnd = (e) => {
    const y = e.nativeEvent.contentOffset.y
    const i = Math.min(items.length - 1, Math.max(0, Math.round(y / ITEM_H)))
    const next = items[i]?.value
    if (next !== undefined && next !== value) onChange(next)
  }

  return (
    <View style={[styles.col, { flex }]}>
      <View pointerEvents="none" style={styles.selBand} />
      <ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: PAD }}
        contentOffset={{ x: 0, y: index * ITEM_H }}
        onMomentumScrollEnd={onEnd}
        nestedScrollEnabled
      >
        {items.map((it) => (
          <View key={String(it.value)} style={styles.item}>
            <Text style={[styles.itemText, it.value === value && styles.itemActive]} numberOfLines={1}>{it.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const daysInMonth = (m, y) => new Date(y, m, 0).getDate() // m: 1-12
const pad2 = (n) => String(n).padStart(2, '0')

export function DateWheels({ value, onChange, minYear = 1947 }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const now = new Date()
  const maxYear = now.getFullYear()
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').map(Number) : null
  const y = parsed ? parsed[0] : 2000
  const m = parsed ? parsed[1] : 1
  const d = parsed ? parsed[2] : 1

  const years = useMemo(() => {
    const arr = []
    for (let yr = maxYear; yr >= minYear; yr--) arr.push({ label: String(yr), value: yr })
    return arr
  }, [maxYear, minYear])
  const months = MONTHS.map((label, i) => ({ label, value: i + 1 }))
  const days = useMemo(() => {
    const n = daysInMonth(m, y)
    return Array.from({ length: n }, (_, i) => ({ label: pad2(i + 1), value: i + 1 }))
  }, [m, y])

  const emit = (ny, nm, nd) => {
    const clampedDay = Math.min(nd, daysInMonth(nm, ny))
    onChange(`${ny}-${pad2(nm)}-${pad2(clampedDay)}`)
  }

  return (
    <View style={styles.wrap}>
      <WheelPicker items={days} value={d} onChange={(nd) => emit(y, m, nd)} flex={1} />
      <WheelPicker items={months} value={m} onChange={(nm) => emit(y, nm, d)} flex={1.2} />
      <WheelPicker items={years} value={y} onChange={(ny) => emit(ny, m, d)} flex={1.2} />
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, height: ITEM_H * VISIBLE, marginTop: 8 },
  col: { height: ITEM_H * VISIBLE, overflow: 'hidden' },
  selBand: { position: 'absolute', left: 0, right: 0, top: PAD, height: ITEM_H, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1 },
  item: { height: ITEM_H, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 18, color: colors.muted, fontWeight: '500' },
  itemActive: { color: colors.primary, fontWeight: '800', fontSize: 20 },
})
