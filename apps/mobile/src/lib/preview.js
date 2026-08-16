// In-app file preview helpers.
//
// Files must never leave the app: images render in `components/FilePreview.js`
// (a native Modal + <Image>), everything else opens in the in-app browser via
// **expo-web-browser** — Chrome Custom Tabs on Android / SFSafariViewController
// on iOS — instead of `Linking.openURL`, which hands the (pre-signed, sensitive)
// URL to an external app.

import * as WebBrowser from 'expo-web-browser'

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|heic|heif)$/i

export const isImageFile = (f) =>
  f?.kind === 'photo'
  || /^image\//i.test(f?.contentType || f?.mimeType || '')
  || IMAGE_EXT.test(f?.filename || f?.name || '')

// Opens the pre-signed URL inside the app. Returns false if it could not open,
// so the caller can surface an error (we never fall back to an external app).
export const openInAppBrowser = async (url, colors = {}) => {
  try {
    await WebBrowser.openBrowserAsync(url, {
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      controlsColor: colors.primary,
      toolbarColor: colors.surface,
      enableBarCollapsing: true,
      showTitle: true,
    })
    return true
  } catch {
    return false
  }
}
