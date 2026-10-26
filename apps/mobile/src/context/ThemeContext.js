// Single source of truth for appearance. Preference is 'system' | 'light' |
// 'dark'; the resolved scheme drives the active colour palette. Persisted in the
// device keystore. Components read colours via useTheme() / useThemedStyles().

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useColorScheme } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { palettes } from '../theme'
import { semantic, severityTokens } from '../../../../packages/shared/theme'

const KEY = 'sankatai_theme_pref'
const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const system = useColorScheme() // 'light' | 'dark' | null
  const [pref, setPref] = useState('system')

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync(KEY)
        if (saved === 'light' || saved === 'dark' || saved === 'system') setPref(saved)
      } catch { /* keep default */ }
    })()
  }, [])

  const choose = useCallback(async (next) => {
    setPref(next)
    try { await SecureStore.setItemAsync(KEY, next) } catch { /* non-fatal */ }
  }, [])

  const scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref
  // Base palette + the additive design-system tokens the web redesign uses:
  // onPrimary (dark ink on the dark-theme red, white on #D9635E is 3.56:1),
  // warning/danger/success tints, and per-severity ink/soft/border (the fills
  // fail as small text, e.g. MODERATE is 2.94:1 on white).
  const colors = useMemo(() => {
    const sem = semantic[scheme]
    return {
      ...palettes[scheme],
      onPrimary: sem.onPrimary,
      warning: sem.warning, warningSoft: sem.warningSoft, warningBorder: sem.warningBorder,
      danger: sem.danger, dangerSoft: sem.dangerSoft, dangerBorder: sem.dangerBorder,
      successSoft: sem.successSoft, successBorder: sem.successBorder,
      scrim: sem.scrim,
    }
  }, [scheme])
  const sev = severityTokens[scheme]
  const isDark = scheme === 'dark'

  const value = useMemo(() => ({ pref, setPref: choose, scheme, colors, sev, isDark }), [pref, choose, scheme, colors, sev, isDark])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}

// Build a StyleSheet from the active palette, memoised per palette.
export function useThemedStyles(factory) {
  const { colors } = useTheme()
  return useMemo(() => factory(colors), [factory, colors])
}
