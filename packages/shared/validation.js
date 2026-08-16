// Framework-agnostic validators — shared by web and mobile.
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())
export const isISODate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) && !Number.isNaN(new Date(v).getTime())
export const isPhone = (v) => /^\+?[\d\s-]{7,15}$/.test(String(v || '').trim())
