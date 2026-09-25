import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useSearchParams } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import Landing from '../features/marketing/Landing.jsx'
import Login from '../features/auth/components/Login.jsx'
import Signup from '../features/auth/components/Signup.jsx'
import Verify from '../features/auth/components/Verify.jsx'
import ForgotPassword from '../features/auth/components/ForgotPassword.jsx'
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
import { AUTH_STATUS, AuthProvider, useAuth } from '../context/AuthContext.jsx'
import { ProfileProvider, useProfile, isProfileComplete } from '../features/profile/context/ProfileContext.jsx'
import { ToastProvider } from '../components/ui'
import { safeReturnTo } from '../services/auth/authErrors'
import { Loading, ProtectedRoute, RequireAdmin } from './guards.jsx'

// The admin console is admin-only, so it is split out of the main bundle.
const AdminLayout = lazy(() => import('../features/admin/AdminLayout.jsx'))
const OverviewPage = lazy(() => import('../features/admin/pages/OverviewPage.jsx'))
const AnalyticsPage = lazy(() => import('../features/admin/pages/AnalyticsPage.jsx'))
const UsersPage = lazy(() => import('../features/admin/pages/UsersPage.jsx'))
const FeedbackPage = lazy(() => import('../features/admin/pages/FeedbackPage.jsx'))
const HealthPage = lazy(() => import('../features/admin/pages/HealthPage.jsx'))
const AccessPage = lazy(() => import('../features/admin/pages/AccessPage.jsx'))
const AuditPage = lazy(() => import('../features/admin/pages/AuditPage.jsx'))
const InviteAcceptPage = lazy(() => import('../features/admin/pages/InviteAcceptPage.jsx'))

// Signed-in users land in the app; profile completeness decides where.
function Gate() {
  const { profile, loading } = useProfile()
  if (loading) return <Loading />
  return <Navigate to={isProfileComplete(profile) ? '/dashboard' : '/profile-setup'} replace />
}

// Auth pages are for guests. A signed-in visitor (including the moment a
// sign-in completes) goes to the sanitised returnTo, else the app, so this
// and the login form always agree on the destination.
function GuestOnly({ children }) {
  const { status } = useAuth()
  const [params] = useSearchParams()
  if (status !== AUTH_STATUS.AUTHED) return children
  return <Navigate to={safeReturnTo(params.get('returnTo')) || '/app'} replace />
}

const admin = (page) => <Suspense fallback={<Loading label="Loading…" />}>{page}</Suspense>

function AppRoutes() {
  return (
    <Routes>
      {/* Public: no auth, no redirect. */}
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
      <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
      <Route path="/verify" element={<Verify />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      {/* Old Hosted UI callback bookmarks. */}
      <Route path="/auth/callback" element={<Navigate to="/" replace />} />

      {/* Protected: guests go to /login?returnTo=<path>. */}
      <Route path="/app" element={<ProtectedRoute><Gate /></ProtectedRoute>} />
      <Route path="/profile-setup" element={<ProtectedRoute><ProfileSetup /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
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
      <Route path="/documents/upload" element={<ProtectedRoute><DocumentUploadPage /></ProtectedRoute>} />

      {/* Invitation acceptance: signed in, NOT admin (this makes you one). */}
      <Route path="/admin/invite/accept" element={<ProtectedRoute>{admin(<InviteAcceptPage />)}</ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><RequireAdmin>{admin(<AdminLayout />)}</RequireAdmin></ProtectedRoute>}>
        <Route index element={admin(<OverviewPage />)} />
        <Route path="analytics" element={admin(<AnalyticsPage />)} />
        <Route path="users" element={admin(<UsersPage />)} />
        <Route path="feedback" element={admin(<FeedbackPage />)} />
        <Route path="health" element={admin(<HealthPage />)} />
        <Route path="access" element={admin(<AccessPage />)} />
        <Route path="audit" element={admin(<AuditPage />)} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

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
