// Framework-agnostic validators — shared by web and mobile.
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim())
export const isISODate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '').trim()) && !Number.isNaN(new Date(v).getTime())
export const isPhone = (v) => /^\+?[\d\s-]{7,15}$/.test(String(v || '').trim())

// A saved profile is ready for the app only when every required onboarding
// field from the web and mobile setup flows is present. Older partial profile
// records remain valid data, but must be routed back through setup.
export const PROFILE_REQUIRED_FIELDS = ['firstName', 'dob', 'gender', 'phone', 'email', 'bloodGroup']
export const missingProfileFields = (profile) => PROFILE_REQUIRED_FIELDS.filter((field) => !String(profile?.[field] || '').trim())
export const isProfileComplete = (profile) => Boolean(profile && missingProfileFields(profile).length === 0)
