// Compatibility surface for the auth layer.
//
// Sign-in / sign-out / session restore are the Hosted UI + PKCE flow
// (hostedUi.js). Self-service account operations still use the Cognito SDK
// directly, because they are plain API calls that need no redirect.

import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserAttribute,
} from 'amazon-cognito-identity-js'

export {
  isCognitoConfigured,
  signIn,
  signOut,
  refreshSession,
  restoreSession,
  handleRedirectCallback,
  getValidAccessToken,
  currentUser,
} from './hostedUi'

// The SDK is given a memory-only Storage adapter so it never writes tokens to
// localStorage. It is used only for the self-service operations below.
class MemoryStorage {
  constructor() { this.data = {} }
  setItem(key, value) { this.data[key] = value; return value }
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null }
  removeItem(key) { delete this.data[key] }
  clear() { this.data = {} }
}

const memoryStore = new MemoryStorage()
let userPoolInstance = null

const getUserPool = () => {
  const poolId = import.meta.env.VITE_COGNITO_USER_POOL_ID
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID
  if (!poolId || !clientId) {
    throw new Error('Cognito is not configured. Set VITE_COGNITO_USER_POOL_ID and VITE_COGNITO_CLIENT_ID.')
  }
  if (!userPoolInstance) {
    userPoolInstance = new CognitoUserPool({ UserPoolId: poolId, ClientId: clientId, Storage: memoryStore })
  }
  return userPoolInstance
}

export const signUp = (email, password) =>
  new Promise((resolve, reject) => {
    const attributeList = [new CognitoUserAttribute({ Name: 'email', Value: email })]
    getUserPool().signUp(email, password, attributeList, null, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

export const confirmSignUp = (email, code) =>
  new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool(), Storage: memoryStore })
    cognitoUser.confirmRegistration(code, true, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

export const resendConfirmationCode = (email) =>
  new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool(), Storage: memoryStore })
    cognitoUser.resendConfirmationCode((err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })

// Re-authenticates with the current password first (the Hosted UI session is
// not an SDK session), then calls Cognito's changePassword. Relies on
// ALLOW_USER_PASSWORD_AUTH, which the pool client still enables.
export const changePassword = (email, currentPassword, newPassword) =>
  new Promise((resolve, reject) => {
    const cognitoUser = new CognitoUser({ Username: email, Pool: getUserPool(), Storage: memoryStore })
    const authDetails = new AuthenticationDetails({ Username: email, Password: currentPassword })
    cognitoUser.setAuthenticationFlowType('USER_PASSWORD_AUTH')
    cognitoUser.authenticateUser(authDetails, {
      onSuccess: () => {
        cognitoUser.changePassword(currentPassword, newPassword, (err, res) => {
          if (err) reject(new Error(err.message || 'Could not change your password.'))
          else resolve(res)
        })
      },
      onFailure: (err) => reject(new Error(
        err?.code === 'NotAuthorizedException' ? 'Your current password is incorrect.' : (err?.message || 'Could not change your password.'),
      )),
    })
  })
