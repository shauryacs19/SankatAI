// Re-exports shared chat helpers (see packages/shared).
export * from '../../../../packages/shared/chat'

// Same as web features/chat/utils/format.jsx (relative time + day groups for History).
export const relTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

export const groupConsults = (list) => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1)
  const groups = { Today: [], Yesterday: [], Earlier: [] }
  list.forEach((c) => {
    const t = c.updatedAt ? new Date(c.updatedAt) : null
    if (t && t >= todayStart) groups.Today.push(c)
    else if (t && t >= yestStart) groups.Yesterday.push(c)
    else groups.Earlier.push(c)
  })
  return Object.entries(groups).filter(([, arr]) => arr.length)
}

export const SEV_LABEL = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High', EMERGENCY: 'Emergency' }
