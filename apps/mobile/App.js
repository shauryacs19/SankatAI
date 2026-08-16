import { useEffect, useRef, useState } from 'react'
import { View, Text, Animated, Easing, Platform, StyleSheet } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { NavigationContainer, DefaultTheme } from '@react-navigation/native'
import { HeartPulse } from 'lucide-react-native'
import { ProfileProvider } from './src/context/ProfileContext'
import { ChatProvider } from './src/context/ChatContext'
import { AuthProvider, AUTH_STATUS, useAuth } from './src/context/AuthContext'
import { ThemeProvider, useTheme } from './src/context/ThemeContext'
import ShakeSOS from './src/components/ShakeSOS'
import RootNavigator from './src/navigation/RootNavigator'

// Hide the Android system navigation bar (swipe up to reveal it). Guarded with a
// runtime require so the app still runs before expo-navigation-bar is installed.
function useImmersiveNav() {
  useEffect(() => {
    if (Platform.OS !== 'android') return
    let NavBar = null
    try { NavBar = require('expo-navigation-bar') } catch { NavBar = null }
    if (!NavBar) return
    try {
      NavBar.setVisibilityAsync('hidden')
    } catch { /* not supported here */ }
  }, [])
}

// Animated open splash: the Sankat.AI mark fades + springs in, then gently pulses.
function Splash() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const fade = useRef(new Animated.Value(0)).current
  const scale = useRef(new Animated.Value(0.8)).current
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
    ]).start()
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => loop.stop()
  }, [fade, scale, pulse])

  return (
    <View style={styles.splash}>
      <Animated.View style={{ opacity: fade, transform: [{ scale: Animated.multiply(scale, pulse) }] }}>
        <View style={styles.logoBadge}><HeartPulse size={44} color="#fff" /></View>
      </Animated.View>
      <Animated.Text style={[styles.brand, { opacity: fade }]}>Sankat<Text style={{ color: colors.primary }}>.AI</Text></Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: fade }]}>AI-powered medical triage</Animated.Text>
    </View>
  )
}

// Gates rendering on the single auth source of truth. While INITIALIZING (tokens
// being restored/refreshed) or before the min splash time, only the splash shows
// — the login screen never flashes for an already-signed-in user.
function Gate() {
  const { status } = useAuth()
  const { colors, isDark } = useTheme()
  const [minElapsed, setMinElapsed] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), 1300)
    return () => clearTimeout(t)
  }, [])

  const navTheme = {
    ...DefaultTheme,
    dark: isDark,
    colors: { ...DefaultTheme.colors, background: colors.bg, card: colors.surface, text: colors.text, border: colors.border, primary: colors.primary },
  }

  if (status === AUTH_STATUS.INITIALIZING || !minElapsed) return <Splash />

  if (status === AUTH_STATUS.AUTHENTICATED) {
    return (
      <ProfileProvider>
        <ChatProvider>
          {/* themed backdrop behind the navigator — stops white flashes on transitions */}
          <View style={{ flex: 1, backgroundColor: colors.bg }}>
            <NavigationContainer theme={navTheme}>
              <StatusBar style={isDark ? 'light' : 'dark'} />
              <RootNavigator />
            </NavigationContainer>
          </View>
          {/* Global panic gesture — shake the phone to open emergency SOS. */}
          <ShakeSOS />
        </ChatProvider>
      </ProfileProvider>
    )
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <NavigationContainer theme={navTheme}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <RootNavigator />
      </NavigationContainer>
    </View>
  )
}

export default function App() {
  useImmersiveNav()
  return (
    <ThemeProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </ThemeProvider>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, gap: 16 },
  logoBadge: { width: 88, height: 88, borderRadius: 26, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
  brand: { fontSize: 30, fontWeight: '800', color: colors.text, marginTop: 6 },
  tagline: { fontSize: 14, color: colors.muted, marginTop: -6 },
})
