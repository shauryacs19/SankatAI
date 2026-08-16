// App configuration. Override via EXPO_PUBLIC_* env vars (Expo inlines these).
//
// Precedence:
//   1. EXPO_PUBLIC_API_URL: shared deployed API or an explicit LAN URL.
//   2. Metro's LAN host during Expo development.
//   3. localhost for an Android/iOS simulator only.

import Constants from 'expo-constants'

const BACKEND_PORT = process.env.EXPO_PUBLIC_API_PORT || '5174'

// The Metro/dev host (the PC's LAN IP during `expo start`) via the Expo-supported
// API — avoids the deprecated deep import of react-native's getDevServer.
function metroHost() {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    ''
  const host = hostUri.split('@').pop().split(':')[0]
  return host || null
}

function resolveApiBaseUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '')
  const host = metroHost()
  const isLanIp = host && /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  if (isLanIp) return `http://${host}:${BACKEND_PORT}`
  return `http://localhost:${BACKEND_PORT}`
}

export const API_BASE_URL = resolveApiBaseUrl()

export const COGNITO = {
  region: process.env.EXPO_PUBLIC_COGNITO_REGION || 'ap-south-1',
  userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || 'ap-south-1_gxKpxpsyl',
  clientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || 'tm62pjk48amoj3c3l6i9m135e',
}
