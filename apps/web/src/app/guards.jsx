// Route guards. UX only: the backend enforces authentication (API Gateway)
// and admin access (verified JWT + admins table) on every request.
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Phone, ShieldAlert } from 'lucide-react'
import { AUTH_STATUS, useAuth } from '../context/AuthContext.jsx'
import { loginPath } from '../services/auth/authErrors'
import { Brand, Button, EmptyState, Spinner } from '../components/ui'

// Shown only inside protected routes while the stored session is checked.
// Emergency calling is never gated behind it.
export function Loading({ label = 'Checking your sign-in…' }) {
  return (
    <main className="app-status" aria-busy="true">
      <Brand />
      <p className="app-status-line" role="status"><Spinner /> {label}</p>
      <a className="app-status-sos" href="tel:108"><Phone size={16} aria-hidden="true" /> Emergency? Call 108</a>
    </main>
  )
}

export function ProtectedRoute({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status === AUTH_STATUS.LOADING) return <Loading />
  if (status !== AUTH_STATUS.AUTHED) {
    return <Navigate to={loginPath(location.pathname + location.search)} replace />
  }
  return children
}

/** Hides the admin console from non-admins (the API answers 403 regardless). */
export function RequireAdmin({ children }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  if (!user?.groups?.includes('ADMIN')) {
    return (
      <main className="app-status" id="main">
        <EmptyState
          icon={ShieldAlert}
          headingLevel={1}
          title="Admin access required"
          description="This area is for Sankat.AI administrators. If you were invited, open the link from your invitation email."
          action={<Button variant="primary" onClick={() => navigate('/dashboard/chat')}>Back to the app</Button>}
        />
      </main>
    )
  }
  return children
}
