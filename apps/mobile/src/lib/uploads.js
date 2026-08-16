// Uploads service (React Native) — talks to the backend /api/uploads endpoints
// and performs the direct-to-S3 PUT of a local file via a pre-signed URL.
//
// Flow (no long-lived URLs stored anywhere):
//   1. POST /api/uploads/presign          -> { attachmentId, uploadUrl, ... }
//   2. PUT  <uploadUrl> (direct to S3)     -> upload the file bytes
//   3. POST /api/uploads/{id}/complete     -> mark uploaded (records size)
// The backend derives user_id from the Cognito token; the client never sends it.

import * as FileSystemLegacy from 'expo-file-system/legacy'
import { request } from './api'

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
