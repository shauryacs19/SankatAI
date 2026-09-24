import { Navigate, Route, Routes } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { Phone } from 'lucide-react'
import Landing from '../features/marketing/Landing.jsx'
import Login from '../features/auth/components/Login.jsx'
import ProfileSetup from '../features/profile/pages/ProfileSetup.jsx'
import DashboardLayout from '../features/dashboard/DashboardLayout.jsx'
import ChatPage from '../features/dashboard/pages/ChatPage.jsx'
import HistoryPage from '../features/dashboard/pages/HistoryPage.jsx'
import FilesPage from '../features/dashboard/pages/FilesPage.jsx'
import ProfilePage from '../features/dashboard/pages/ProfilePage.jsx'
import EmergencyPage from '../features/dashboard/pages/EmergencyPage.jsx'
import SettingsPage from '../features/dashboard/pages/SettingsPage.jsx'
import OfflinePage from '../features/dashboard/pages/OfflinePage.jsx'
import DocumentUploadPage from '../features/medical-documents/pages/DocumentUploadPage.jsx'
import AdminDashboard from '../features/admin/AdminDashboard.jsx'
import { AUTH_STATUS, AuthProvider, useAuth } from '../context/AuthContext.jsx'
import { ProfileProvider, useProfile, isProfileComplete } from '../features/profile/context/ProfileContext.jsx'
import { Brand, Spinner, ToastProvider } from '../components/ui'
import '../App.css'

// Shown while the session is restored (which can bounce through Cognito).
// Emergency calling is never gated behind it.
function Loading() {
  return (
    <main className="app-status" aria-busy="true">
      <Brand />
      <p className="app-status-line" role="status"><Spinner /> Checking your sign-in…</p>
      <a className="app-status-sos" href="tel:108"><Phone size={16} aria-hidden="true" /> Emergency? Call 108</a>
    </main>
  )
}

function RequireAuth({ children }) {
  const { status } = useAuth()
  if (status === AUTH_STATUS.INITIALIZING) return <Loading />
  if (status !== AUTH_STATUS.AUTHENTICATED) return <Navigate to="/login" replace />
  return children
}

function Gate() {
  const { status } = useAuth()
  const { profile, loading } = useProfile()
  if (status === AUTH_STATUS.INITIALIZING) return <Loading />
  if (status !== AUTH_STATUS.AUTHENTICATED) return <Navigate to="/login" replace />
  if (loading) return <Loading />
  return <Navigate to={isProfileComplete(profile) ? '/dashboard' : '/profile-setup'} replace />
}

// Cognito redirects back here with ?code=&state=. AuthProvider's bootstrap does
// the PKCE exchange before this renders, so by the time `status` settles the
// tokens are already in memory — this route only has to show something while
// that happens and then hand off to the gate.
function AuthCallback() {
  const { status } = useAuth()
  if (status === AUTH_STATUS.INITIALIZING) return <Loading />
  return <Navigate to={status === AUTH_STATUS.AUTHENTICATED ? '/app' : '/login'} replace />
}

function AppRoutes() {
  const { status } = useAuth()
  const authenticated = status === AUTH_STATUS.AUTHENTICATED

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/app" element={<Gate />} />
      <Route path="/login" element={status === AUTH_STATUS.INITIALIZING ? <Loading /> : authenticated ? <Navigate to="/app" replace /> : <Login />} />
      <Route path="/profile-setup" element={<RequireAuth><ProfileSetup /></RequireAuth>} />

      <Route path="/dashboard" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
        <Route index element={<Navigate to="chat" replace />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="offline" element={<OfflinePage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="files" element={<FilesPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="emergency" element={<EmergencyPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard/chat" replace />} />
      </Route>

      <Route path="/documents/upload" element={<RequireAuth><DocumentUploadPage /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth><AdminDashboard /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

// Exported for the dev-only preview harness (src/dev/preview.jsx).
export function App() {
  return (
    <ProfileProvider>
      <ToastProvider>
        <AppRoutes />
      </ToastProvider>
    </ProfileProvider>
  )
}

export default function AppWithAuth() {
  return (
    <MotionConfig reducedMotion="user">
      <AuthProvider>
        <App />
      </AuthProvider>
    </MotionConfig>
  )
}
