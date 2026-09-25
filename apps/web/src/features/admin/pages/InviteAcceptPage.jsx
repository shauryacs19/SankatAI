// /admin/invite/accept?token=... — reached from the invitation email.
// ProtectedRoute has already sent a guest to /login?returnTo=<this URL> and
// back. The token is read once, then removed from the address bar so it does
// not linger in history. Acceptance is decided entirely by the backend.
import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { getIdToken } from '../../../services/auth/cognito'
import { loginPath } from '../../../services/auth/authErrors'
import { Alert, Button } from '../../../components/ui'
import { AuthLayout } from '../../auth/components/AuthLayout.jsx'
import { errText } from '../../../utils/errText'
import { acceptInvitation } from '../services/adminApi'

export default function InviteAcceptPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, refreshUser, signOut } = useAuth()
  const [token] = useState(() => new URLSearchParams(location.search).get('token') || '')
  const [state, setState] = useState({ busy: false, error: '', code: '' })

  useEffect(() => {
    if (location.search) window.history.replaceState(window.history.state, '', location.pathname)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const accept = async () => {
    setState({ busy: true, error: '', code: '' })
    try {
      await acceptInvitation(token, getIdToken())
      // New tokens carry the ADMIN group claim.
      await refreshUser()
      navigate('/admin', { replace: true })
    } catch (err) {
      setState({ busy: false, error: errText(err, 'Could not accept the invitation.'), code: err?.code || '' })
    }
  }

  const openConsole = async () => {
    try { await refreshUser() } catch { /* the console re-checks with the server anyway */ }
    navigate('/admin', { replace: true })
  }

  const switchAccount = async () => {
    const back = `/admin/invite/accept?token=${encodeURIComponent(token)}`
    await signOut()
    navigate(loginPath(back), { replace: true })
  }

  if (!token) {
    return (
      <AuthLayout title="Invitation link incomplete" lead="Open the full link from your invitation email.">
        <Button variant="secondary" onClick={() => navigate('/')}>Go to the home page</Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Accept admin invitation" lead={`You're signed in as ${user?.email || 'your account'}.`}>
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <p className="auth-note">
        <ShieldCheck size={16} aria-hidden="true" />
        <span>The invitation works once, only for the Gmail address it was sent to, and only if that address is verified.</span>
      </p>
      {state.code !== 'already_admin' && state.code !== 'accepted' && (
        <Button variant="primary" block onClick={accept} loading={state.busy} loadingText="Accepting…"
          disabled={['expired', 'revoked', 'invalid'].includes(state.code)}>
          Accept and open the admin console
        </Button>
      )}
      {state.code === 'already_admin' && <Button variant="primary" block onClick={openConsole}>Open the admin console</Button>}
      {state.code === 'wrong_email' && <Button variant="secondary" block onClick={switchAccount}>Sign in with a different account</Button>}
      <Button variant="ghost" block onClick={() => navigate('/dashboard/chat')}>Not now</Button>
    </AuthLayout>
  )
}
