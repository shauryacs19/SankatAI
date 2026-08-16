// Admin metrics service — the single seam between the UI and the data source.
//
// Today these return MOCK data (from ../data/adminMockData) wrapped in a promise
// so the calling code already treats them as async. To go live later, replace
// each body with a real authenticated FastAPI call, e.g.:
//
//   export const getAdminMetrics = (period) =>
//     httpClient.request(`/admin/metrics?period=${period}`)
//
// ...where the backend validates the Cognito JWT + admin group and returns the
// same shape. No component changes required.

import {
  ADMIN_PERIODS,
  getDataset,
  getSystemHealthMock,
  getRecentActivityMock,
} from '../data/adminMockData'

const mock = (value) => Promise.resolve(value)

export const adminPeriods = ADMIN_PERIODS

export const getAdminMetrics = (period = '30d') => mock(getDataset(period).metrics)
export const getUserAnalytics = (period = '30d') =>
  mock({ series: getDataset(period).userSeries, topStats: getDataset(period).topStats })
export const getChatAnalytics = (period = '30d') => mock(getDataset(period).chat)
export const getSeverityAnalytics = (period = '30d') => mock(getDataset(period).severity)
export const getUploadAnalytics = (period = '30d') => mock(getDataset(period).uploads)
export const getAIUsage = (period = '30d') => mock(getDataset(period).ai)
export const getTopStats = (period = '30d') => mock(getDataset(period).topStats)
export const getSystemHealth = () => mock(getSystemHealthMock())
export const getRecentActivity = () => mock(getRecentActivityMock())

// Convenience aggregate used by the page to load everything for a period.
export const getAdminDashboard = async (period = '30d') => {
  const [metrics, users, chat, severity, uploads, ai, topStats, health, activity] = await Promise.all([
    getAdminMetrics(period),
    getUserAnalytics(period),
    getChatAnalytics(period),
    getSeverityAnalytics(period),
    getUploadAnalytics(period),
    getAIUsage(period),
    getTopStats(period),
    getSystemHealth(),
    getRecentActivity(),
  ])
  return { metrics, users, chat, severity, uploads, ai, topStats, health, activity }
}
