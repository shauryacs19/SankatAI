// Sign-in identity rules and the small Cognito calls both clients share.
// Pure JS: each platform passes in `fetch`, random bytes and SHA-256, so the
// same code runs in the browser and on React Native.
//
// Cognito pool model (infrastructure/terraform/modules/security/cognito):
//   username            opaque UUID chosen at sign-up, never shown
//   preferred_username  the person's unique, changeable handle (sign-in alias)
//   email / phone_number sign-in aliases once verified
// So "email, phone or username" all go to Cognito as the USERNAME parameter.

import { isEmail } from './validation'

// ── usernames ────────────────────────────────────────────────────────────────
// Starting with a letter keeps a username from ever looking like a phone
// number, and "@" is not allowed, so never like an email. Cognito enforces
// uniqueness (preferred_username is an alias), case-insensitively.
export const USERNAME_MIN = 3
export const USERNAME_MAX = 20
const USERNAME_RE = /^[a-z][a-z0-9_.]*$/
const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'root', 'sankatai', 'sankat', 'support', 'help', 'system',
  'security', 'moderator', 'staff', 'official', 'doctor', 'emergency',
])

export const normalizeUsername = (raw) => String(raw || '').trim().toLowerCase()

/** '' when valid, otherwise a message for the form. */
export const usernameError = (raw) => {
  const u = normalizeUsername(raw)
  if (!u) return 'Choose a username.'
  if (u.length < USERNAME_MIN || u.length > USERNAME_MAX) return `Use ${USERNAME_MIN} to ${USERNAME_MAX} characters.`
  if (!USERNAME_RE.test(u)) return 'Start with a letter, then use only letters, numbers, dots and underscores.'
  if (u.includes('..') || u.endsWith('.')) return 'Dots can’t be doubled or come last.'
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved. Choose another.'
  return ''
}

const isUsernameFormat = (raw) => {
  const u = normalizeUsername(raw)
  return u.length >= USERNAME_MIN && u.length <= USERNAME_MAX && USERNAME_RE.test(u)
}

// ── phone numbers ────────────────────────────────────────────────────────────
// Cognito wants E.164 (+919876543210). A number typed without a country code
// gets the default dial code (India); a leading trunk 0 is dropped.
export const DEFAULT_DIAL_CODE = '+91'
const E164_RE = /^\+[1-9]\d{7,14}$/

/** E.164 string, or null when it can't be a phone number. */
export const toE164 = (raw, dialCode = DEFAULT_DIAL_CODE) => {
  const s = String(raw || '').trim().replace(/[\s().-]/g, '')
  if (s.startsWith('+')) return E164_RE.test(s) ? s : null
  const digits = s.replace(/^0+/, '')
  if (!/^\d{6,14}$/.test(digits)) return null
  const full = `${dialCode}${digits}`
  return E164_RE.test(full) ? full : null
}

/** +91 ••••• 3210 — for "we sent a code to …" copy. */
export const maskPhone = (e164) => (e164 ? `${e164.slice(0, 3)} ••••• ${e164.slice(-4)}` : '')

// ── identifiers ──────────────────────────────────────────────────────────────
/**
 * Classify what someone typed in "Email, phone or username".
 * @returns {{kind: 'email'|'phone'|'username', value: string}|null}
 */
export const parseIdentifier = (raw) => {
  const s = String(raw || '').trim()
  if (!s) return null
  if (s.includes('@')) return isEmail(s) ? { kind: 'email', value: s.toLowerCase() } : null
  if (/^[+\d][\d\s().-]*$/.test(s)) {
    const phone = toE164(s)
    return phone ? { kind: 'phone', value: phone } : null
  }
  return isUsernameFormat(s) ? { kind: 'username', value: normalizeUsername(s) } : null
}

// ── random values ────────────────────────────────────────────────────────────
/** RFC 4122 v4 UUID from a getRandomValues implementation (Cognito username). */
export const uuidV4 = (getRandomValues) => {
  const b = getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// ── Cognito public API ───────────────────────────────────────────────────────
// amazon-cognito-identity-js doesn't implement the USER_AUTH flow, so these
// calls go straight to Cognito's JSON API. None needs AWS credentials: sign-in
// calls are public, UpdateUserAttributes is authorised by the access token.
// Errors carry Cognito's exception name as `code`, the same shape the
// library's errors have.
const cognitoError = (code, message) => Object.assign(new Error(message || code), { code, name: code })

export const createCognitoApi = ({ region, clientId, fetchImpl }) => {
  const doFetch = fetchImpl || ((...args) => fetch(...args))
  const call = async (target, body) => {
    let res
    try {
      res = await doFetch(`https://cognito-idp.${region}.amazonaws.com/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-amz-json-1.1',
          'X-Amz-Target': `AWSCognitoIdentityProviderService.${target}`,
        },
        body: JSON.stringify(body),
      })
    } catch {
      throw cognitoError('NetworkError', 'Network error')
    }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw cognitoError(String(data.__type || 'UnknownError').split('#').pop(), data.message || data.Message)
    return data
  }
  const tokensOf = (res) => {
    const r = res.AuthenticationResult
    if (!r) throw cognitoError('UnsupportedChallenge')
    return { idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn }
  }
  return {
    /** Cognito texts a code to the account's verified phone. */
    async startSmsSignIn(phone) {
      const res = await call('InitiateAuth', {
        ClientId: clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: phone, PREFERRED_CHALLENGE: 'SMS_OTP' },
      })
      if (res.ChallengeName !== 'SMS_OTP') throw cognitoError('SmsSignInUnavailable')
      return { session: res.Session, destination: res.ChallengeParameters?.CODE_DELIVERY_DESTINATION || '' }
    },
    /** Answer with the texted code; resolves the tokens. */
    async answerSmsCode({ phone, session, code }) {
      const res = await call('RespondToAuthChallenge', {
        ClientId: clientId,
        ChallengeName: 'SMS_OTP',
        Session: session,
        ChallengeResponses: { USERNAME: phone, SMS_OTP: String(code).trim() },
      })
      return tokensOf(res)
    },

    // Passkeys (WebAuthn). Cognito returns and accepts the standard WebAuthn
    // JSON forms (base64url binary fields); the platform does the ceremony.
    /** Passkey sign-in, step 1: the request options for this account's passkeys. */
    async startPasskeySignIn(username) {
      const res = await call('InitiateAuth', {
        ClientId: clientId,
        AuthFlow: 'USER_AUTH',
        AuthParameters: { USERNAME: username, PREFERRED_CHALLENGE: 'WEB_AUTHN' },
      })
      if (res.ChallengeName !== 'WEB_AUTHN') throw cognitoError('PasskeyUnavailable')
      return { session: res.Session, options: JSON.parse(res.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS || '{}') }
    },
    /** Passkey sign-in, step 2: the signed assertion; resolves the tokens. */
    async answerPasskey({ username, session, credential }) {
      const res = await call('RespondToAuthChallenge', {
        ClientId: clientId,
        ChallengeName: 'WEB_AUTHN',
        Session: session,
        ChallengeResponses: { USERNAME: username, CREDENTIAL: JSON.stringify(credential) },
      })
      return tokensOf(res)
    },
    /** Creation options for a new passkey on the signed-in account. */
    async startPasskeyRegistration(accessToken) {
      return (await call('StartWebAuthnRegistration', { AccessToken: accessToken })).CredentialCreationOptions
    },
    async completePasskeyRegistration({ accessToken, credential }) {
      await call('CompleteWebAuthnRegistration', { AccessToken: accessToken, Credential: credential })
    },
    async listPasskeys(accessToken) {
      return (await call('ListWebAuthnCredentials', { AccessToken: accessToken })).Credentials || []
    },
    async deletePasskey({ accessToken, credentialId }) {
      await call('DeleteWebAuthnCredential', { AccessToken: accessToken, CredentialId: credentialId })
    },
    /** Change the signed-in person's own attributes, e.g. { preferred_username }. */
    async updateAttributes({ accessToken, attributes }) {
      await call('UpdateUserAttributes', {
        AccessToken: accessToken,
        UserAttributes: Object.entries(attributes).map(([Name, Value]) => ({ Name, Value })),
      })
    },
  }
}

// Errors the pre-sign-up Lambda raises come back wrapped as
// "PreSignUp failed with error <message>." Unwrap for display.
export const preSignUpMessage = (err) => {
  const m = /PreSignUp failed with error (.+?)\.?$/.exec(String(err?.message || ''))
  return m ? m[1] : null
}
