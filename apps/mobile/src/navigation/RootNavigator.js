import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { AUTH_STATUS, useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import LoginScreen from '../screens/LoginScreen'
import ProfileSetupScreen from '../screens/ProfileSetupScreen'
import DashboardTabs from '../screens/DashboardTabs'
import PersonalInfoScreen from '../screens/profile/PersonalInfoScreen'
import MedicalInfoScreen from '../screens/profile/MedicalInfoScreen'
import EmergencyContactsScreen from '../screens/profile/EmergencyContactsScreen'

const Stack = createNativeStackNavigator()

// Auth state (from useAuth) — not manual navigation.reset — decides which stack
// renders, so login/logout switch automatically and no screen flickers.
export default function RootNavigator() {
  const { status, initialRoute } = useAuth()
  const { colors } = useTheme()

  // native-stack scenes sit on a native container that defaults to WHITE, so in
  // dark mode a push/pop flashes white until the screen paints. Painting the
  // scene container with the theme background removes the flash.
  const screenOptions = {
    headerShown: false,
    contentStyle: { backgroundColor: colors.bg },
    navigationBarColor: colors.bg,
  }

  if (status === AUTH_STATUS.UNAUTHENTICATED) {
    return (
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Login" component={LoginScreen} />
      </Stack.Navigator>
    )
  }

  return (
    <Stack.Navigator initialRouteName={initialRoute} screenOptions={screenOptions}>
      <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
      <Stack.Screen name="App" component={DashboardTabs} />
      <Stack.Screen name="ProfilePersonal" component={PersonalInfoScreen} />
      <Stack.Screen name="ProfileMedical" component={MedicalInfoScreen} />
      <Stack.Screen name="ProfileContacts" component={EmergencyContactsScreen} />
    </Stack.Navigator>
  )
}
