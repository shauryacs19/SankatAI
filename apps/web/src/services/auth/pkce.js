// PKCE helpers (RFC 7636), S256 only.
//
// The verifier is a high-entropy random string kept in the browser; only its
// SHA-256 hash (the challenge) is sent on the authorize redirect. An attacker
// who intercepts the authorization code cannot exchange it without the
// verifier, which never leaves this origin.

const b64url = (bytes) => {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

/** 43-128 chars of unreserved characters, per the spec. 32 bytes -> 43 chars. */
export const createVerifier = () => b64url(randomBytes(32))

export const createChallenge = async (verifier) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return b64url(new Uint8Array(digest))
}

/** Opaque value echoed back by Cognito; guards against CSRF on the callback. */
export const createState = () => b64url(randomBytes(16))
