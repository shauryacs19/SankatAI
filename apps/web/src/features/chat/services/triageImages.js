// Image-first triage upload (v2). The photo is re-encoded in the browser from
// pixels, so EXIF (location, device, time) never leaves the device; the server
// re-checks the type and strips metadata again.
//
//   1. POST /api/v2/triage/images            { contentType, size } -> signed PUT URL
//      (no consultationId = the server starts a new consultation)
//   2. PUT  <uploadUrl>                      exact size + type are signed
//   3. POST /api/v2/triage/images/{id}/complete -> { imageId, consultationId, previewUrl }
// The image id is then sent as an attachment id with the normal message send.

import { request } from '../../../services/api/httpClient'

export const TRIAGE_IMAGE_MAX_BYTES = 8 * 1024 * 1024
const MAX_INPUT_BYTES = 30 * 1024 * 1024
const MAX_SIDE = 2048

export class ImageCheckError extends Error {}

// Any format this browser can decode (HEIC works in Safari); it is sent as JPEG.
export function checkImageFile(file) {
  if (!file || !String(file.type || '').startsWith('image/')) throw new ImageCheckError('Choose a photo (JPEG, PNG, WebP or HEIC).')
  if (file.size > MAX_INPUT_BYTES) throw new ImageCheckError('This photo is too large. Choose one under 30 MB.')
}

export function fitWithin(width, height, maxSide = MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function stripMetadata(file) {
  let bitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new ImageCheckError('This photo could not be opened. Try a JPEG or PNG.')
  }
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9))
  if (!blob) throw new ImageCheckError('This photo could not be prepared. Try another one.')
  if (blob.size > TRIAGE_IMAGE_MAX_BYTES) throw new ImageCheckError('This photo is too large even after compression.')
  return blob
}

export async function uploadTriageImage(file, consultationId) {
  checkImageFile(file)
  const blob = await stripMetadata(file)
  const presign = await request('/v2/triage/images', {
    method: 'POST',
    body: { contentType: 'image/jpeg', size: blob.size, ...(consultationId && { consultationId }) },
  })
  const put = await fetch(presign.uploadUrl, { method: 'PUT', headers: presign.uploadHeaders, body: blob })
  if (!put.ok) throw new Error('The photo could not be uploaded. Check your connection and try again.')
  return request(`/v2/triage/images/${presign.imageId}/complete`, { method: 'POST' })
}
