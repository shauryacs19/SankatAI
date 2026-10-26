// Uploads service (React Native) — talks to the backend /api/uploads endpoints
// and performs the direct-to-S3 PUT of a local file via a pre-signed URL.
//
// Flow (no long-lived URLs stored anywhere):
//   1. POST /api/uploads/presign          -> { attachmentId, uploadUrl, ... }
//   2. PUT  <uploadUrl> (direct to S3)     -> upload the file bytes
//   3. POST /api/uploads/{id}/complete     -> mark uploaded (records size)
// The backend derives user_id from the Cognito token; the client never sends it.

import * as FileSystemLegacy from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'
import { request } from './api'

const TRIAGE_MAX_BYTES = 8 * 1024 * 1024
const IMAGE_INPUT_MAX_BYTES = 30 * 1024 * 1024

// Match the website's image-first triage flow. Re-encoding the pixels strips
// EXIF location/device metadata before the image leaves the phone.
export const uploadTriageImage = async (asset, consultationId) => {
  if (!String(asset?.mimeType || '').startsWith('image/')) throw new Error('Choose a photo (JPEG, PNG, WebP or HEIC).')
  if (asset.size > IMAGE_INPUT_MAX_BYTES) throw new Error('This photo is too large. Choose one under 30 MB.')

  const width = Number(asset.width) || 0
  const height = Number(asset.height) || 0
  const longest = Math.max(width, height)
  const actions = longest > 2048
    ? [{ resize: width >= height ? { width: 2048 } : { height: 2048 } }]
    : []
  const prepared = await ImageManipulator.manipulateAsync(asset.uri, actions, {
    compress: 0.9,
    format: ImageManipulator.SaveFormat.JPEG,
  })
  const info = await FileSystemLegacy.getInfoAsync(prepared.uri, { size: true })
  if (!info.exists || !info.size) throw new Error('This photo could not be prepared. Try another one.')
  if (info.size > TRIAGE_MAX_BYTES) throw new Error('This photo is too large even after compression.')

  const presign = await request('/v2/triage/images', {
    method: 'POST',
    body: { contentType: 'image/jpeg', size: info.size, ...(consultationId && { consultationId }) },
  })
  const result = await FileSystemLegacy.uploadAsync(presign.uploadUrl, prepared.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
    headers: presign.uploadHeaders || { 'Content-Type': 'image/jpeg' },
  })
  if (result.status < 200 || result.status >= 300) throw new Error('The photo could not be uploaded. Check your connection and try again.')
  return request(`/v2/triage/images/${presign.imageId}/complete`, { method: 'POST' })
}

export const kindForAsset = (asset) => {
  const mime = asset?.mimeType || ''
  const name = asset?.name || asset?.fileName || ''
  if (mime.startsWith('image/')) return 'photo'
  if (/\.(png|jpe?g|gif|heic|webp|bmp)$/i.test(name)) return 'photo'
  return 'document'
}

export const listUploads = (scope, chatId) => {
  const qs = new URLSearchParams({ scope })
  if (chatId) qs.set('chatId', chatId)
  return request(`/uploads?${qs.toString()}`)
}

// Password-protected files require the 6-digit PIN (403 if wrong / missing).
export const deleteUpload = (attachmentId, pin = null) =>
  request(`/uploads/${attachmentId}`, { method: 'DELETE', body: { pin: pin || null } })

export const updateUpload = (attachmentId, fields) =>
  request(`/uploads/${attachmentId}`, { method: 'PATCH', body: fields })

// Returns { downloadUrl, expiresIn }. disposition 'inline' opens for viewing,
// 'attachment' downloads. Protected files require the 6-digit PIN (403 if wrong).
export const getDownloadUrl = (attachmentId, pin, disposition = 'inline') =>
  request(`/uploads/${attachmentId}/download`, { method: 'POST', body: { pin: pin || null, disposition } })

// Orchestrates presign -> S3 PUT -> complete. `asset` is a local file descriptor
// from expo-document-picker / expo-image-picker: { uri, name, mimeType, size }.
export const uploadFile = async (asset, { scope = 'vault', kind, chatId, passwordProtected, pinId } = {}) => {
  const k = kind || kindForAsset(asset)
  const name = (asset.name || asset.fileName || 'file').trim()
  const contentType = asset.mimeType || 'application/octet-stream'

  // 1. Pre-signed PUT URL (auth added by the API client; user_id server-side).
  const presign = await request('/uploads/presign', {
    method: 'POST',
    body: {
      scope, kind: k, filename: name, contentType, chatId: chatId || null,
      passwordProtected: Boolean(passwordProtected),
      pinId: passwordProtected ? pinId : null,
    },
  })

  // 2. Upload the bytes straight to S3. Content-Type must match what was signed.
  const res = await FileSystemLegacy.uploadAsync(presign.uploadUrl, asset.uri, {
    httpMethod: 'PUT',
    uploadType: FileSystemLegacy.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  })
  if (res.status < 200 || res.status >= 300) {
    throw new Error('Upload to storage failed. Please try again.')
  }

  // 3. Confirm — only now is the record marked "uploaded".
  await request(`/uploads/${presign.attachmentId}/complete`, {
    method: 'POST',
    body: { size: asset.size ?? null },
  })

  return { attachmentId: presign.attachmentId, filename: name, kind: k, scope, contentType, size: asset.size ?? null }
}
