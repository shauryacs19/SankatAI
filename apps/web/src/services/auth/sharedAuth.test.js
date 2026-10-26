// @vitest-environment jsdom
// @sankatai/shared auth helpers (used by web and mobile).
import { describe, expect, it, vi } from 'vitest'
import { createCognitoApi, parseIdentifier, preSignUpMessage, toE164, uuidV4 } from '@sankatai/shared'

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
    ['Asha.K', null], ['not an email@', null], ['x', null],
  ])('%s', (input, expected) => expect(parseIdentifier(input)).toEqual(expected))
})

describe('small helpers', () => {
  it('recognises Cognito messages it must handle', () => {
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
    expect(await api.startSmsSignIn('+919876543210')).toEqual({ challenge: 'SMS_OTP', session: 'sess', destination: '+91******3210' })
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

describe('passwordless email calls', () => {
  const reply = (body, ok = true) => ({ ok, json: async () => body })

  it('starts USER_AUTH with EMAIL_OTP for an email and answers it', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ ChallengeName: 'EMAIL_OTP', Session: 'sess', ChallengeParameters: { CODE_DELIVERY_DESTINATION: 'a***@g***' } }))
      .mockResolvedValueOnce(reply({ AuthenticationResult: { IdToken: 'i', AccessToken: 'a', RefreshToken: 'r', ExpiresIn: 3600 } }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    const started = await api.startCodeSignIn('asha@gmail.com', 'email')
    expect(started).toEqual({ challenge: 'EMAIL_OTP', session: 'sess', destination: 'a***@g***' })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).AuthParameters).toEqual({ USERNAME: 'asha@gmail.com', PREFERRED_CHALLENGE: 'EMAIL_OTP' })
    await api.answerCode({ identifier: 'asha@gmail.com', challenge: 'EMAIL_OTP', session: 'sess', code: '123456' })
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).ChallengeResponses).toEqual({ USERNAME: 'asha@gmail.com', EMAIL_OTP: '123456' })
  })

  it('refuses an account without email sign-in', async () => {
    const fetchImpl = vi.fn(async () => reply({ ChallengeName: 'SELECT_CHALLENGE', Session: 's' }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    await expect(api.startCodeSignIn('asha@gmail.com', 'email')).rejects.toMatchObject({ code: 'EmailSignInUnavailable' })
  })
})
