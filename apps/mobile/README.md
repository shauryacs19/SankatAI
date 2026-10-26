# Sankat.AI mobile

The mobile client is an Expo SDK 54 app built with React Native. It reuses the
shared theme, validation, profile, chat, document and voice logic in
`packages/shared/` and connects to the existing FastAPI backend.

## Run in Expo Go

From the repository root, install the workspace dependencies and start Metro:

```sh
npm install
npm run dev:mobile
```

Scan the QR code with Expo Go on a phone on the same network as the computer
running Metro. The API uses the deployed website/API origin by default so Expo
Go reaches the same backend as the web app. To use a local backend, set
`EXPO_PUBLIC_API_URL` before starting Expo, for example
`http://192.168.1.20:5174` (the backend must be running and reachable on that
computer's LAN address).

Expo Go supports the app's chat, profile, history, documents, emergency tools,
authentication and appearance settings. Live microphone streaming uses the
native `@siteed/audio-studio` module, which is not included in Expo Go; the app
explains this when voice input is opened.

## Run with voice input

Use a custom development build to include the audio streaming native module:

```sh
npm run android
```

This builds and opens the Android app on a connected device or emulator. For
iOS, use `npm run ios` on macOS with Xcode installed. The app requests
microphone access only when voice input is started.

## Configuration

The Cognito region, pool and app-client values have public development
defaults in `src/config.js`; override them with `EXPO_PUBLIC_COGNITO_REGION`,
`EXPO_PUBLIC_COGNITO_USER_POOL_ID` and `EXPO_PUBLIC_COGNITO_CLIENT_ID` when
using a different environment. Never put AWS secret keys in Expo public
variables. The backend remains responsible for protected data and AWS access.

Appearance can follow the device or be set to Light or Dark in Settings. A new
native build is needed after changing native plugins or app configuration.
