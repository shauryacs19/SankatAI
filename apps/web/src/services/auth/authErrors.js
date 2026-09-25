// Cognito error -> friendly message. Never echoes the raw message for
// credential failures, and NotAuthorized/UserNotFound share ONE message so the
// form cannot be used to discover which emails have accounts.

export const GENERIC_SIGN_IN_ERROR = 'Incorrect email or password.'

const MESSAGES = {
  NotAuthorizedException: GENERIC_SIGN_IN_ERROR,
  UserNotFoundException: GENERIC_SIGN_IN_ERROR,
  CodeMismatchException: 'That code is incorrect. Check the latest email and try again.',
  ExpiredCodeException: 'That code has expired. Request a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes, then try again.',
  TooManyRequestsException: 'Too many requests. Wait a moment, then try again.',
  TooManyFailedAttemptsException: 'Too many failed attempts. Wait a few minutes, then try again.',
  InvalidPasswordException: 'That password doesn’t meet the requirements below.',
  UsernameExistsException: 'An account with this email already exists. Sign in instead.',
  PasswordResetRequiredException: 'You need to reset your password. Use “Forgot password?”.',
  MFASetupRequired: 'This account needs multi-factor setup, which the web app doesn’t support yet.',
  UnsupportedChallenge: 'This sign-in method isn’t supported.',
  NoPendingSignIn: 'Your sign-in expired. Start again.',
  NotConfigured: 'Sign-in isn’t configured for this site.',
  NetworkError: 'Can’t reach the sign-in service. Check your connection.',
}

export const authErrorMessage = (err, fallback = 'Something went wrong. Try again.') => {
  const code = err?.code || err?.name
  if (code && MESSAGES[code]) {
    // Cognito reports a disabled account and the lockout as NotAuthorized too.
    if (code === 'NotAuthorizedException' && /attempts exceeded/i.test(err?.message || '')) {
      return MESSAGES.TooManyFailedAttemptsException
    }
    return MESSAGES[code]
  }
  if (/network|fetch/i.test(err?.message || '')) return MESSAGES.NetworkError
  return fallback
}

// Mirrors the Cognito pool policy in infrastructure/terraform/modules/security/
// cognito/main.tf (min 8, upper, lower, number; symbols not required).
export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
]

export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p))

/**
 * Sanitise a post-login destination: same-origin relative paths only.
 * Returns null for anything else (absolute URLs, //host, /\host, javascript:,
 * or the auth pages themselves, which would loop).
 */
export const safeReturnTo = (raw) => {
  if (typeof raw !== 'string' || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return null
    if (/^\/(login|signup|verify|forgot-password|auth\/callback)(\/|$)/.test(url.pathname)) return null
    return url.pathname + url.search + url.hash
  } catch {
    return null
  }
}

export const loginPath = (returnTo) => {
  const safe = safeReturnTo(returnTo)
  return safe ? `/login?returnTo=${encodeURIComponent(safe)}` : '/login'
}
