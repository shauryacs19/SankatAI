// /auth/callback: where Cognito returns after "Continue with Google/Facebook".
// Exchanges the one-time code (PKCE) for tokens, then goes to the sanitised
// returnTo. Visiting it without a sign-in in progress just shows an error.
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../../context/AuthContext.jsx'
import { completeSocialSignIn } from '../../../services/auth/cognito'
import { authErrorMessage, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Spinner } from '../../../components/ui'
import { AuthLayout } from './AuthLayout.jsx'

export default function AuthCallback() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSignedIn } = useAuth()
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return // the code is single-use; never exchange twice
    started.current = true
    completeSocialSignIn(location.search)
      .then((result) => {
        if (result.restarted) return // on the way back to the provider
        setSignedIn(result.user)
        navigate(safeReturnTo(result.returnTo) || '/app', { replace: true })
      })
      .catch((err) => setError(authErrorMessage(err, 'Couldn’t finish signing in with that account. Try again.')))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AuthLayout
      title={error ? 'Sign-in didn’t finish' : 'Signing you in…'}
      footer={error && <p><Link className="auth-link" to="/login">Back to sign in</Link></p>}
    >
      {error ? <Alert tone="danger">{error}</Alert> : <p role="status" className="auth-note"><Spinner /> One moment…</p>}
    </AuthLayout>
  )
}
