// The website sends /api requests through its CloudFront distribution to the
// protected API Gateway. Expo Go cannot use the website's same-origin URL, so
// mobile uses that same public distribution as its API origin by default.
// Set EXPO_PUBLIC_API_URL=http://<computer-LAN-IP>:5174 to use a local backend.
const DEPLOYED_API_BASE_URL = 'https://d3hv3qgz8rrxos.cloudfront.net'
export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL || DEPLOYED_API_BASE_URL).replace(/\/$/, '')

export const COGNITO = {
  region: process.env.EXPO_PUBLIC_COGNITO_REGION || 'ap-south-1',
  userPoolId: process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID || 'ap-south-1_EPTUiHy4S',
  clientId: process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '537tap6mvpbnvutqfbhptq431l',
}
