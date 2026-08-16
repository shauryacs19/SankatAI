// Framework-agnostic helpers for the document vault (web + mobile).

// Documents view mode (Google-Docs style toggle). Shared so web + mobile agree.
export const VIEW_STORAGE_KEY = 'sankatai_docs_view'
export const DOC_VIEWS = ['list', 'grid']
export const DEFAULT_DOC_VIEW = 'list'
export const normalizeDocView = (v) => (DOC_VIEWS.includes(v) ? v : DEFAULT_DOC_VIEW)
export const nextDocView = (v) => (normalizeDocView(v) === 'list' ? 'grid' : 'list')

export const IMG_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'svg']

const extOf = (name) => (String(name || '').split('.').pop() || '').toLowerCase()

export const isImageFile = (name, type) =>
  (String(type || '').startsWith('image/')) || IMG_EXTS.includes(extOf(name))

// Backend Kind is "photo" | "document".
export const kindForFile = (name, type) => (isImageFile(name, type) ? 'photo' : 'document')

export const fmtFileSize = (bytes) => {
  if (bytes == null) return null
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`
}

export const typeLabel = (contentType) => {
  if (!contentType) return 'File'
  const sub = contentType.split('/').pop() || ''
  return (sub.split(/[.+]/).pop() || sub).toUpperCase().slice(0, 5)
}

export const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// Unique, sorted category headings: those present on files + any custom (empty) ones.
export const mergeCategories = (files, custom = []) => {
  const fromFiles = (files || []).map((f) => f.category).filter(Boolean)
  return [...new Set([...fromFiles, ...custom])].sort((a, b) => a.localeCompare(b))
}

// Custom (possibly empty) categories live on the user PROFILE (`profile.fileCategories`)
// so web and mobile stay in sync — the old device-local storage did not sync.
export const MAX_CATEGORY_LEN = 60
export const normalizeCategory = (name) => String(name || '').trim().slice(0, MAX_CATEGORY_LEN)
export const readProfileCategories = (profile) =>
  (Array.isArray(profile?.fileCategories) ? profile.fileCategories : []).map(normalizeCategory).filter(Boolean)
export const addProfileCategory = (list, name) => {
  const n = normalizeCategory(name)
  const cur = Array.isArray(list) ? list : []
  return !n || cur.includes(n) ? cur : [...cur, n]
}
export const renameProfileCategory = (list, oldName, newName) => {
  const n = normalizeCategory(newName)
  return [...new Set((Array.isArray(list) ? list : []).map((c) => (c === oldName ? n : c)))].filter(Boolean)
}
export const removeProfileCategory = (list, name) =>
  (Array.isArray(list) ? list : []).filter((c) => c !== name)

// Typed delete confirmation — both clients require the same word.
export const DELETE_CONFIRM_TEXT = 'confirm'
export const isDeleteConfirmed = (text) =>
  String(text || '').trim().toLowerCase() === DELETE_CONFIRM_TEXT
