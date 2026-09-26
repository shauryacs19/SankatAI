// @vitest-environment jsdom
// @sankatai/shared auth helpers (used by web and mobile).
import { describe, expect, it, vi } from 'vitest'
import {
  buildAuthorizeUrl, createCognitoApi, exchangeAuthCode, isLinkedAccountRetry, parseIdentifier, parseSocialProviders,
  pkceChallenge, preSignUpMessage, toE164, usernameError, uuidV4,
} from '@sankatai/shared'

describe('usernames', () => {
  it.each([
    ['asha.k', ''], ['Ravi_99', ''], ['ab', 'Use 3 to 20 characters.'], ['9lives', 'Start with a letter'],
    ['a..b', 'Dots can'], ['asha.', 'Dots can'], ['admin', 'reserved'], ['asha@x', 'Start with a letter'],
  ])('%s', (value, expected) => {
    const error = usernameError(value)
    if (expected) expect(error).toContain(expected)
    else expect(error).toBe('')
  })
})

describe('phone numbers', () => {
  it.each([
    ['98765 43210', '+919876543210'], ['098765-43210', '+919876543210'], ['+1 (415) 555-0100', '+14155550100'],
    ['+91 98765 43210', '+919876543210'], ['12', null], ['+0123456789', null], ['abc', null],
  ])('%s -> %s', (input, expected) => expect(toE164(input)).toBe(expected))
})

describe('identifiers', () => {
  it.each([
    ['Asha@Gmail.com', { kind: 'email', value: 'asha@gmail.com' }],
    ['98765 43210', { kind: 'phone', value: '+919876543210' }],
    ['Asha.K', { kind: 'username', value: 'asha.k' }],
    ['not an email@', null], ['x', null],
  ])('%s', (input, expected) => expect(parseIdentifier(input)).toEqual(expected))
})

describe('social sign-in helpers', () => {
  it('only lists providers the app knows', () => {
    expect(parseSocialProviders('Google, Facebook,Twitter,')).toEqual(['Google', 'Facebook'])
  })

  it('builds a PKCE authorize URL that names the provider', async () => {
    const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
    // RFC 7636 appendix B test vector.
    expect(await pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', sha256)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
    const url = new URL(buildAuthorizeUrl({
      domain: 'https://x.auth.ap-south-1.amazoncognito.com/', clientId: 'cid', redirectUri: 'https://app/auth/callback',
      provider: 'Google', state: 's1', codeChallenge: 'c1',
    }))
    expect(url.pathname).toBe('/oauth2/authorize')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      identity_provider: 'Google', response_type: 'code', client_id: 'cid', state: 's1',
      code_challenge: 'c1', code_challenge_method: 'S256', redirect_uri: 'https://app/auth/callback',
    })
    expect(url.searchParams.get('scope')).toContain('aws.cognito.signin.user.admin')
  })

  it('exchanges the code at /oauth2/token', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ id_token: 'i', access_token: 'a', refresh_token: 'r', expires_in: 3600 }) }))
    const tokens = await exchangeAuthCode({ domain: 'https://d', clientId: 'cid', redirectUri: 'https://app/cb', code: 'c', codeVerifier: 'v', fetchImpl })
    expect(tokens).toEqual({ idToken: 'i', accessToken: 'a', refreshToken: 'r', expiresIn: 3600 })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://d/oauth2/token')
    expect(Object.fromEntries(new URLSearchParams(init.body))).toEqual({
      grant_type: 'authorization_code', client_id: 'cid', code: 'c', redirect_uri: 'https://app/cb', code_verifier: 'v',
    })
  })

  it('recognises Cognito messages it must handle', () => {
    expect(isLinkedAccountRetry('Already found an entry for username google_123 ')).toBe(true)
    expect(preSignUpMessage({ message: 'PreSignUp failed with error An account with this phone number already exists. Sign in instead.' }))
      .toBe('An account with this phone number already exists. Sign in instead')
  })

  it('makes RFC 4122 v4 UUIDs', () => {
    expect(uuidV4((a) => crypto.getRandomValues(a))).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('passwordless SMS calls', () => {
  const reply = (body, ok = true) => ({ ok, json: async () => body })

  it('starts USER_AUTH with SMS_OTP and answers the challenge', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ ChallengeName: 'SMS_OTP', Session: 'sess', ChallengeParameters: { CODE_DELIVERY_DESTINATION: '+91******3210' } }))
      .mockResolvedValueOnce(reply({ AuthenticationResult: { IdToken: 'i', AccessToken: 'a', RefreshToken: 'r', ExpiresIn: 3600 } }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    expect(await api.startSmsSignIn('+919876543210')).toEqual({ session: 'sess', destination: '+91******3210' })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://cognito-idp.ap-south-1.amazonaws.com/')
    expect(init.headers['X-Amz-Target']).toBe('AWSCognitoIdentityProviderService.InitiateAuth')
    expect(JSON.parse(init.body)).toEqual({
      ClientId: 'cid', AuthFlow: 'USER_AUTH', AuthParameters: { USERNAME: '+919876543210', PREFERRED_CHALLENGE: 'SMS_OTP' },
    })
    const tokens = await api.answerSmsCode({ phone: '+919876543210', session: 'sess', code: ' 123456 ' })
    expect(tokens.idToken).toBe('i')
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({
      ClientId: 'cid', ChallengeName: 'SMS_OTP', Session: 'sess', ChallengeResponses: { USERNAME: '+919876543210', SMS_OTP: '123456' },
    })
  })

  it('surfaces Cognito exception names as error codes', async () => {
    const fetchImpl = vi.fn(async () => reply({ __type: 'com.amazonaws#CodeMismatchException', message: 'Invalid code' }, false))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    await expect(api.answerSmsCode({ phone: '+91', session: 's', code: '1' })).rejects.toMatchObject({ code: 'CodeMismatchException' })
  })

  it('refuses an account without SMS sign-in', async () => {
    const fetchImpl = vi.fn(async () => reply({ ChallengeName: 'SELECT_CHALLENGE', Session: 's' }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    await expect(api.startSmsSignIn('+919876543210')).rejects.toMatchObject({ code: 'SmsSignInUnavailable' })
  })
})
