// Cognito error -> friendly message (mirrors web services/auth/authErrors).
// Never echoes the raw message for credential failures; NotAuthorized and
// UserNotFound share ONE message so the form can't reveal which accounts exist.
import { preSignUpMessage } from '@sankatai/shared'

export const GENERIC_SIGN_IN_ERROR = 'Those sign-in details don’t match an account.'

const MESSAGES = {
  NotAuthorizedException: GENERIC_SIGN_IN_ERROR,
  UserNotFoundException: GENERIC_SIGN_IN_ERROR,
  CodeMismatchException: 'That code is incorrect. Check the latest message and try again.',
  ExpiredCodeException: 'That code has expired. Request a new one.',
  LimitExceededException: 'Too many attempts. Wait a few minutes, then try again.',
  TooManyRequestsException: 'Too many requests. Wait a moment, then try again.',
  TooManyFailedAttemptsException: 'Too many failed attempts. Wait a few minutes, then try again.',
  InvalidPasswordException: 'That password doesn’t meet the requirements below.',
  UsernameExistsException: 'That email or phone number is already in use.',
  AliasExistsException: 'That email or phone number is already in use.',
  SmsSignInUnavailable: 'Text-message sign-in isn’t available for this number. Sign in with your password.',
  EmailSignInUnavailable: 'Email-code sign-in isn’t available for this account. Sign in with your password.',
  InvalidPhoneNumber: 'Enter the phone number with its country code, like +91 98765 43210.',
  PasswordResetRequiredException: 'You need to reset your password. Use “Forgot password?”.',
  MFASetupRequired: 'This account needs multi-factor setup, which the app doesn’t support yet.',
  UnsupportedChallenge: 'This sign-in method isn’t supported.',
  NoPendingSignIn: 'Your sign-in expired. Start again.',
  NetworkError: 'Can’t reach the sign-in service. Check your connection.',
}

export const authErrorMessage = (err, fallback = 'Something went wrong. Try again.') => {
  const code = typeof err?.code === 'string' ? err.code : err?.name
  if (code === 'UserLambdaValidationException') return preSignUpMessage(err) || fallback
  if (code === 'InvalidParameterException' && /phone/i.test(err?.message || '')) return MESSAGES.InvalidPhoneNumber
  if (code && MESSAGES[code]) {
    // Cognito reports the lockout as NotAuthorized too.
    if (code === 'NotAuthorizedException' && /attempts exceeded/i.test(err?.message || '')) return MESSAGES.TooManyFailedAttemptsException
    return MESSAGES[code]
  }
  if (/network/i.test(err?.message || '')) return MESSAGES.NetworkError
  return fallback
}

// Mirrors the Cognito pool policy (Terraform modules/security/cognito): min 8,
// upper, lower, number; symbols not required.
export const PASSWORD_RULES = [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
]
export const passwordOk = (p) => PASSWORD_RULES.every((r) => r.test(p))
