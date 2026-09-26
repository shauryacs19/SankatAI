// @vitest-environment jsdom
// WebAuthn <-> Cognito JSON conversion, and the shared passkey API calls.
import { describe, expect, it, vi } from 'vitest'
import { createCognitoApi } from '@sankatai/shared'
import { authenticationJSON, registrationJSON, toCreationOptions, toRequestOptions } from './webauthn'

const bytes = (...b) => new Uint8Array(b).buffer
const hex = (buf) => Array.from(new Uint8Array(buf), (x) => x.toString(16).padStart(2, '0')).join('')

describe('options from Cognito', () => {
  it('decodes base64url fields in creation options and keeps the rest', () => {
    const opts = toCreationOptions({
      challenge: 'AAEC_w', rp: { id: 'd1.cloudfront.net', name: 'SankatAI' },
      user: { id: '-_8', name: 'asha.k', displayName: 'Asha' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: [{ type: 'public-key', id: 'AQ' }],
    })
    expect(hex(opts.challenge)).toBe('000102ff')
    expect(hex(opts.user.id)).toBe('fbff')
    expect(hex(opts.excludeCredentials[0].id)).toBe('01')
    expect(opts.rp.id).toBe('d1.cloudfront.net')
    expect(opts.pubKeyCredParams).toEqual([{ type: 'public-key', alg: -7 }])
  })

  it('decodes request options', () => {
    const opts = toRequestOptions({ challenge: 'AAEC_w', rpId: 'd1.cloudfront.net', allowCredentials: [{ type: 'public-key', id: 'AQ' }] })
    expect(hex(opts.challenge)).toBe('000102ff')
    expect(hex(opts.allowCredentials[0].id)).toBe('01')
  })
})

describe('credentials to Cognito', () => {
  const common = {
    id: 'cred-1', rawId: bytes(1, 2), type: 'public-key', authenticatorAttachment: 'platform',
    getClientExtensionResults: () => ({ credProps: { rk: true } }),
  }

  it('encodes a new passkey as RegistrationResponseJSON', () => {
    const json = registrationJSON({
      ...common,
      response: { clientDataJSON: bytes(0xfb, 0xff), attestationObject: bytes(3), getTransports: () => ['internal'] },
    })
    expect(json).toEqual({
      id: 'cred-1', rawId: 'AQI', type: 'public-key', authenticatorAttachment: 'platform',
      clientExtensionResults: { credProps: { rk: true } },
      response: { clientDataJSON: '-_8', attestationObject: 'Aw', transports: ['internal'] },
    })
  })

  it('encodes an assertion as AuthenticationResponseJSON', () => {
    const json = authenticationJSON({
      ...common,
      response: { clientDataJSON: bytes(1), authenticatorData: bytes(2), signature: bytes(3), userHandle: bytes(4) },
    })
    expect(json.response).toEqual({ clientDataJSON: 'AQ', authenticatorData: 'Ag', signature: 'Aw', userHandle: 'BA' })
  })
})

describe('passkey API calls', () => {
  const reply = (body) => ({ ok: true, json: async () => body })

  it('runs USER_AUTH with WEB_AUTHN and answers with the credential JSON', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ ChallengeName: 'WEB_AUTHN', Session: 's', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: '{"challenge":"AA","rpId":"d1"}' } }))
      .mockResolvedValueOnce(reply({ AuthenticationResult: { IdToken: 'i', AccessToken: 'a', RefreshToken: 'r', ExpiresIn: 3600 } }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    expect(await api.startPasskeySignIn('asha.k')).toEqual({ session: 's', options: { challenge: 'AA', rpId: 'd1' } })
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).AuthParameters).toEqual({ USERNAME: 'asha.k', PREFERRED_CHALLENGE: 'WEB_AUTHN' })
    const tokens = await api.answerPasskey({ username: 'asha.k', session: 's', credential: { id: 'c' } })
    expect(tokens.accessToken).toBe('a')
    const body = JSON.parse(fetchImpl.mock.calls[1][1].body)
    expect(body).toMatchObject({ ClientId: 'cid', ChallengeName: 'WEB_AUTHN', Session: 's' })
    expect(JSON.parse(body.ChallengeResponses.CREDENTIAL)).toEqual({ id: 'c' })
  })

  it('reports an account without a passkey', async () => {
    const fetchImpl = vi.fn(async () => reply({ ChallengeName: 'PASSWORD_SRP', Session: 's' }))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    await expect(api.startPasskeySignIn('asha.k')).rejects.toMatchObject({ code: 'PasskeyUnavailable' })
  })

  it('registers, lists and deletes with the access token only', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(reply({ CredentialCreationOptions: { challenge: 'AA' } }))
      .mockResolvedValueOnce(reply({}))
      .mockResolvedValueOnce(reply({ Credentials: [{ CredentialId: 'c1' }] }))
      .mockResolvedValueOnce(reply({}))
    const api = createCognitoApi({ region: 'ap-south-1', clientId: 'cid', fetchImpl })
    expect(await api.startPasskeyRegistration('tok')).toEqual({ challenge: 'AA' })
    await api.completePasskeyRegistration({ accessToken: 'tok', credential: { id: 'c1' } })
    expect(await api.listPasskeys('tok')).toEqual([{ CredentialId: 'c1' }])
    await api.deletePasskey({ accessToken: 'tok', credentialId: 'c1' })
    const calls = fetchImpl.mock.calls.map(([, init]) => [init.headers['X-Amz-Target'].split('.').pop(), JSON.parse(init.body)])
    expect(calls).toEqual([
      ['StartWebAuthnRegistration', { AccessToken: 'tok' }],
      ['CompleteWebAuthnRegistration', { AccessToken: 'tok', Credential: { id: 'c1' } }],
      ['ListWebAuthnCredentials', { AccessToken: 'tok' }],
      ['DeleteWebAuthnCredential', { AccessToken: 'tok', CredentialId: 'c1' }],
    ])
  })
})
