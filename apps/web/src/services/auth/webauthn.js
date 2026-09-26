// WebAuthn <-> the JSON forms Cognito speaks (base64url for every binary
// field). Written by hand instead of PublicKeyCredential.parse*FromJSON /
// credential.toJSON(), which not every supported browser has yet.

const toBuffer = (b64url) => {
  const b64 = String(b64url).replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='))
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i)
  return bytes.buffer
}

const toB64url = (buffer) => {
  let s = ''
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Can this browser create and use passkeys at all? */
export const passkeysSupported = () =>
  typeof window !== 'undefined' && Boolean(window.PublicKeyCredential && navigator.credentials?.create && navigator.credentials?.get)

/** Cognito CredentialCreationOptions (JSON) -> navigator.credentials.create options. */
export const toCreationOptions = (json) => ({
  ...json,
  challenge: toBuffer(json.challenge),
  user: { ...json.user, id: toBuffer(json.user.id) },
  excludeCredentials: (json.excludeCredentials || []).map((c) => ({ ...c, id: toBuffer(c.id) })),
})

/** Cognito CREDENTIAL_REQUEST_OPTIONS (JSON) -> navigator.credentials.get options. */
export const toRequestOptions = (json) => ({
  ...json,
  challenge: toBuffer(json.challenge),
  allowCredentials: (json.allowCredentials || []).map((c) => ({ ...c, id: toBuffer(c.id) })),
})

const base = (cred) => ({
  id: cred.id,
  rawId: toB64url(cred.rawId),
  type: cred.type,
  authenticatorAttachment: cred.authenticatorAttachment || undefined,
  clientExtensionResults: cred.getClientExtensionResults?.() || {},
})

/** A new passkey (navigator.credentials.create result) -> RegistrationResponseJSON. */
export const registrationJSON = (cred) => ({
  ...base(cred),
  response: {
    clientDataJSON: toB64url(cred.response.clientDataJSON),
    attestationObject: toB64url(cred.response.attestationObject),
    transports: cred.response.getTransports?.() || [],
  },
})

/** A signed assertion (navigator.credentials.get result) -> AuthenticationResponseJSON. */
export const authenticationJSON = (cred) => ({
  ...base(cred),
  response: {
    clientDataJSON: toB64url(cred.response.clientDataJSON),
    authenticatorData: toB64url(cred.response.authenticatorData),
    signature: toB64url(cred.response.signature),
    ...(cred.response.userHandle ? { userHandle: toB64url(cred.response.userHandle) } : {}),
  },
})
