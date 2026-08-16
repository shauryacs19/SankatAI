// Uploads service — talks to the backend's /api/uploads endpoints and performs
// the direct-to-S3 PUT via a pre-signed URL. Reused by the chat attach flow and
// the File Storage (vault) flow.
//
// Flow (secure, no long-lived URLs stored anywhere):
//   1. POST /api/uploads/presign            -> { attachmentId, uploadUrl, ... }
//   2. PUT <uploadUrl> (direct to S3)        -> the browser uploads the bytes
//   3. POST /api/uploads/{id}/complete       -> mark uploaded (records size)
// The backend derives user_id from the Cognito token; the client never sends it.

import { request } from './api/httpClient'
import { kindForFile as sharedKindForFile } from '@sankatai/shared'

// Backend Kind is "photo" | "document" (shared with mobile).
export const kindForFile = (file) => sharedKindForFile(file?.name, file?.type)

export const listUploads = (scope, chatId) => {
  const params = new URLSearchParams({ scope })
  if (chatId) params.set('chatId', chatId)
  return request(`/uploads?${params.toString()}`)
}

// Password-protected files require the 6-digit PIN (403 if wrong / missing).
export const deleteUpload = (attachmentId, pin = null) =>
  request(`/uploads/${attachmentId}`, { method: 'DELETE', body: { pin: pin || null } })

// Rename and/or (re)assign category. Pass { filename } and/or { category }
// ("" clears the category -> Uncategorized).
export const updateUpload = (attachmentId, fields) =>
  request(`/uploads/${attachmentId}`, { method: 'PATCH', body: fields })

// Returns { downloadUrl, expiresIn }. disposition 'inline' views in a new tab,
// 'attachment' downloads. For protected files pass the 6-digit PIN (403 on wrong).
export const getDownloadUrl = (attachmentId, pin, disposition = 'attachment') =>
  request(`/uploads/${attachmentId}/download`, { method: 'POST', body: { pin: pin || null, disposition } })

// Orchestrates presign -> S3 PUT -> complete. Throws on any step failure so the
// caller never records a "successful" upload when S3 rejected it.
export const uploadFile = async (file, { scope, kind, chatId, filename, passwordProtected, pinId } = {}) => {
  const k = kind || kindForFile(file)
  const name = (filename && filename.trim()) || file.name
  const contentType = file.type || 'application/octet-stream'

  // 1. Pre-signed PUT URL (auth added by httpClient; user_id derived server-side).
  const presign = await request('/uploads/presign', {
    method: 'POST',
    body: {
      scope, kind: k, filename: name, contentType, chatId: chatId || null,
      passwordProtected: Boolean(passwordProtected),
      pinId: passwordProtected ? pinId : null,
    },
  })

  // 2. Upload the bytes straight to S3. Content-Type must match what was signed.
  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  })
  if (!putRes.ok) {
    throw new Error('Upload to storage failed. Please try again.')
  }

  // 3. Confirm — only now is the record marked "uploaded".
  await request(`/uploads/${presign.attachmentId}/complete`, {
    method: 'POST',
    body: { size: file.size },
  })

  return {
    attachmentId: presign.attachmentId,
    filename: name,
    kind: k,
    scope,
    chatId: chatId || null,
    contentType,
    size: file.size,
  }
}
