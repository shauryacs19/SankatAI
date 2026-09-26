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
const base64Url = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** RFC 4122 v4 UUID from a getRandomValues implementation (Cognito username). */
export const uuidV4 = (getRandomValues) => {
  const b = getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export const randomUrlSafe = (getRandomValues, bytes = 32) => base64Url(getRandomValues(new Uint8Array(bytes)))

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
      const r = res.AuthenticationResult
      if (!r) throw cognitoError('UnsupportedChallenge')
      return { idToken: r.IdToken, accessToken: r.AccessToken, refreshToken: r.RefreshToken, expiresIn: r.ExpiresIn }
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

// ── social sign-in (authorization code + PKCE, via Cognito) ──────────────────
// The authorize URL names the provider (identity_provider=Google), so Cognito
// forwards straight to Google/Facebook without showing its own page. Only
// started by a button press, never on page load.
export const SOCIAL_PROVIDERS = ['Google', 'Facebook']
export const OAUTH_SCOPES = ['openid', 'email', 'phone', 'profile', 'aws.cognito.signin.user.admin']

/** "Google,Facebook" (from the build config) -> ['Google', 'Facebook'], unknown names dropped. */
export const parseSocialProviders = (raw) =>
  String(raw || '').split(',').map((s) => s.trim()).filter((p) => SOCIAL_PROVIDERS.includes(p))

const formEncode = (params) =>
  Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')

/** S256 PKCE challenge. `sha256(string)` resolves the digest bytes. */
export const pkceChallenge = async (verifier, sha256) => base64Url(await sha256(verifier))

export const buildAuthorizeUrl = ({ domain, clientId, redirectUri, provider, state, codeChallenge }) =>
  `${String(domain).replace(/\/$/, '')}/oauth2/authorize?${formEncode({
    identity_provider: provider,
    redirect_uri: redirectUri,
    response_type: 'code',
    client_id: clientId,
    scope: OAUTH_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  })}`

export const exchangeAuthCode = async ({ domain, clientId, redirectUri, code, codeVerifier, fetchImpl }) => {
  const doFetch = fetchImpl || ((...args) => fetch(...args))
  let res
  try {
    res = await doFetch(`${String(domain).replace(/\/$/, '')}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formEncode({ grant_type: 'authorization_code', client_id: clientId, code, redirect_uri: redirectUri, code_verifier: codeVerifier }),
    })
  } catch {
    throw cognitoError('NetworkError', 'Network error')
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.id_token) throw cognitoError('SocialSignInFailed', data.error_description || data.error)
  return { idToken: data.id_token, accessToken: data.access_token, refreshToken: data.refresh_token, expiresIn: data.expires_in }
}

// Cognito answers the very first social sign-in after the pre-sign-up trigger
// links it to an existing account with this error; the next attempt succeeds.
export const isLinkedAccountRetry = (description) => /already found an entry for username/i.test(String(description || ''))

// Errors the pre-sign-up Lambda raises come back wrapped as
// "PreSignUp failed with error <message>." Unwrap for display.
export const preSignUpMessage = (err) => {
  const m = /PreSignUp failed with error (.+?)\.?$/.exec(String(err?.message || ''))
  return m ? m[1] : null
}
