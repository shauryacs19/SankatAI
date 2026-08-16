import 'react-native-get-random-values' // crypto polyfill for Cognito SRP (must be first)
import { registerRootComponent } from 'expo'
import App from './App'

registerRootComponent(App)
