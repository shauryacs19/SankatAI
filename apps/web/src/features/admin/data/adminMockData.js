// Centralized MOCK data for the Admin Dashboard.
//
// ⚠️ TESTING DATA ONLY — none of this comes from DynamoDB / Cognito / S3 /
// CloudWatch. It exists so the dashboard is fully populated during development.
// The admin service layer (services/adminApi.js) reads from here; swap that
// layer for real FastAPI calls later without touching the components.
//
// Data is keyed by time period so the period selector switches between distinct
// predefined datasets (no fake "queries").

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 Days' },
  { id: '30d', label: 'Last 30 Days' },
  { id: '90d', label: 'Last 90 Days' },
]

// Small helper to build a smooth-ish growth series.
const ramp = (labels, start, end) => {
  const n = labels.length
  return labels.map((label, i) => {
    const t = n === 1 ? 1 : i / (n - 1)
    const wobble = Math.round(Math.sin(i * 1.7) * (end - start) * 0.02)
    return { label, value: Math.round(start + (end - start) * t) + wobble }
  })
}

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const DATASETS = {
  today: {
    metrics: {
      totalUsers: { value: 2847, change: 0.6 },
      activeUsers: { value: 482, change: 3.1 },
      totalChats: { value: 12638, change: 0.9 },
      chatsToday: { value: 342, change: 5.5, compareLabel: 'vs yesterday' },
      aiResponses: { value: 1894, change: 4.2 },
      emergencyChats: { value: 38, change: -2.4 },
      imagesUploaded: { value: 184, change: 6.0 },
      documentsUploaded: { value: 61, change: 2.7 },
      avgResponseTime: { value: 4.1, change: -3.5, unit: 's', lowerIsBetter: true },
    },
    userSeries: [
      { label: '9am', users: 2790, newUsers: 12, activeUsers: 120, returningUsers: 78 },
      { label: '12pm', users: 2808, newUsers: 21, activeUsers: 205, returningUsers: 141 },
      { label: '3pm', users: 2826, newUsers: 34, activeUsers: 318, returningUsers: 214 },
      { label: '6pm', users: 2839, newUsers: 47, activeUsers: 402, returningUsers: 268 },
      { label: '9pm', users: 2847, newUsers: 58, activeUsers: 482, returningUsers: 321 },
    ],
    chat: {
      totalConversations: 342, conversationsToday: 342, avgMessages: 7.4,
      avgDuration: '5m 58s', aiResponses: 1894,
      perDay: [{ label: '9am', value: 44 }, { label: '12pm', value: 71 }, { label: '3pm', value: 88 }, { label: '6pm', value: 74 }, { label: '9pm', value: 65 }],
    },
    severity: { critical: 6, high: 15, medium: 33, low: 46, criticalCount: 8, highCount: 51 },
    uploads: {
      images: 184, documents: 61, total: 245,
      series: [{ label: '9am', images: 26, documents: 9 }, { label: '12pm', images: 41, documents: 14 }, { label: '3pm', images: 47, documents: 12 }, { label: '6pm', images: 39, documents: 15 }, { label: '9pm', images: 31, documents: 11 }],
    },
    ai: {
      requests: 1894, successful: 1861, failed: 33, successRate: 98.3, avgResponseTime: 4.1, avgPerChat: 5.5,
      series: [{ label: '9am', value: 248 }, { label: '12pm', value: 402 }, { label: '3pm', value: 471 }, { label: '6pm', value: 418 }, { label: '9pm', value: 355 }],
    },
    topStats: { dau: 482, wau: 1284, mau: 2103, retention: 68.4, avgChatsPerUser: 4.4, avgSessionsPerUser: 2.1, newThisMonth: 186, growthRate: 12.4 },
  },
  '7d': {
    metrics: {
      totalUsers: { value: 2847, change: 4.9 },
      activeUsers: { value: 1284, change: 8.7 },
      totalChats: { value: 12638, change: 6.1 },
      chatsToday: { value: 342, change: 5.5, compareLabel: 'vs yesterday' },
      aiResponses: { value: 4218, change: 9.4 },
      emergencyChats: { value: 126, change: 3.2 },
      imagesUploaded: { value: 512, change: 7.8 },
      documentsUploaded: { value: 178, change: 4.1 },
      avgResponseTime: { value: 4.2, change: -2.1, unit: 's', lowerIsBetter: true },
    },
    userSeries: WEEK.map((label, i) => {
      const users = [2704, 2731, 2758, 2782, 2809, 2831, 2847][i]
      return { label, users, newUsers: [22, 27, 24, 31, 35, 29, 26][i], activeUsers: [1024, 1102, 1188, 1211, 1256, 1272, 1284][i], returningUsers: [712, 764, 803, 841, 862, 878, 891][i] }
    }),
    chat: {
      totalConversations: 12638, conversationsToday: 342, avgMessages: 7.8,
      avgDuration: '6m 24s', aiResponses: 4218,
      perDay: [{ label: 'Mon', value: 284 }, { label: 'Tue', value: 317 }, { label: 'Wed', value: 342 }, { label: 'Thu', value: 389 }, { label: 'Fri', value: 421 }, { label: 'Sat', value: 398 }, { label: 'Sun', value: 342 }],
    },
    severity: { critical: 8, high: 17, medium: 31, low: 44, criticalCount: 73, highCount: 354 },
    uploads: {
      images: 512, documents: 178, total: 690,
      series: [{ label: 'Mon', images: 64, documents: 22 }, { label: 'Tue', images: 71, documents: 25 }, { label: 'Wed', images: 78, documents: 24 }, { label: 'Thu', images: 82, documents: 29 }, { label: 'Fri', images: 91, documents: 31 }, { label: 'Sat', images: 74, documents: 26 }, { label: 'Sun', images: 52, documents: 21 }],
    },
    ai: {
      requests: 4218, successful: 4131, failed: 87, successRate: 97.9, avgResponseTime: 4.2, avgPerChat: 6.1,
      series: WEEK.map((label, i) => ({ label, value: [548, 601, 634, 672, 712, 588, 463][i] })),
    },
    topStats: { dau: 482, wau: 1284, mau: 2103, retention: 68.4, avgChatsPerUser: 4.4, avgSessionsPerUser: 2.3, newThisMonth: 186, growthRate: 12.4 },
  },
  '30d': {
    metrics: {
      totalUsers: { value: 2847, change: 12.4 },
      activeUsers: { value: 1284, change: 8.7 },
      totalChats: { value: 12638, change: 15.2 },
      chatsToday: { value: 342, change: 5.5, compareLabel: 'vs yesterday' },
      aiResponses: { value: 18921, change: 14.1 },
      emergencyChats: { value: 427, change: 6.3 },
      imagesUploaded: { value: 1836, change: 11.2 },
      documentsUploaded: { value: 642, change: 9.4 },
      avgResponseTime: { value: 4.2, change: -6.8, unit: 's', lowerIsBetter: true },
    },
    userSeries: [
      { label: 'Aug 1', users: 1982, newUsers: 41, activeUsers: 902, returningUsers: 611 },
      { label: 'Aug 2', users: 2021, newUsers: 39, activeUsers: 948, returningUsers: 651 },
      { label: 'Aug 3', users: 2105, newUsers: 84, activeUsers: 1004, returningUsers: 702 },
      { label: 'Aug 4', users: 2184, newUsers: 79, activeUsers: 1071, returningUsers: 744 },
      { label: 'Aug 5', users: 2392, newUsers: 208, activeUsers: 1142, returningUsers: 796 },
      { label: 'Aug 6', users: 2581, newUsers: 189, activeUsers: 1203, returningUsers: 833 },
      { label: 'Aug 7', users: 2704, newUsers: 123, activeUsers: 1251, returningUsers: 867 },
      { label: 'Aug 8', users: 2847, newUsers: 143, activeUsers: 1284, returningUsers: 891 },
    ],
    chat: {
      totalConversations: 12638, conversationsToday: 342, avgMessages: 7.8,
      avgDuration: '6m 24s', aiResponses: 18921,
      perDay: [{ label: 'Mon', value: 284 }, { label: 'Tue', value: 317 }, { label: 'Wed', value: 342 }, { label: 'Thu', value: 389 }, { label: 'Fri', value: 421 }, { label: 'Sat', value: 398 }, { label: 'Sun', value: 342 }],
    },
    severity: { critical: 8, high: 17, medium: 31, low: 44, criticalCount: 73, highCount: 354 },
    uploads: {
      images: 1836, documents: 642, total: 2478,
      series: [{ label: 'Mon', images: 184, documents: 68 }, { label: 'Tue', images: 213, documents: 74 }, { label: 'Wed', images: 241, documents: 88 }, { label: 'Thu', images: 267, documents: 96 }, { label: 'Fri', images: 301, documents: 104 }, { label: 'Sat', images: 289, documents: 118 }, { label: 'Sun', images: 341, documents: 94 }],
    },
    ai: {
      requests: 18921, successful: 18542, failed: 379, successRate: 98.0, avgResponseTime: 4.2, avgPerChat: 6.4,
      series: ramp(['W1', 'W2', 'W3', 'W4'], 3980, 5620).map((p) => ({ label: p.label, value: p.value })),
    },
    topStats: { dau: 482, wau: 1284, mau: 2103, retention: 68.4, avgChatsPerUser: 4.4, avgSessionsPerUser: 2.6, newThisMonth: 186, growthRate: 12.4 },
  },
  '90d': {
    metrics: {
      totalUsers: { value: 2847, change: 34.8 },
      activeUsers: { value: 1284, change: 22.1 },
      totalChats: { value: 12638, change: 41.6 },
      chatsToday: { value: 342, change: 5.5, compareLabel: 'vs yesterday' },
      aiResponses: { value: 52140, change: 38.7 },
      emergencyChats: { value: 1187, change: 18.9 },
      imagesUploaded: { value: 5124, change: 27.5 },
      documentsUploaded: { value: 1789, change: 21.3 },
      avgResponseTime: { value: 4.5, change: -11.2, unit: 's', lowerIsBetter: true },
    },
    userSeries: ramp(['Jun', 'Jun 15', 'Jul', 'Jul 15', 'Aug', 'Aug 8'], 1103, 2847).map((p, i) => ({
      label: p.label, users: p.value,
      newUsers: [286, 241, 318, 372, 401, 143][i], activeUsers: Math.round(p.value * 0.45), returningUsers: Math.round(p.value * 0.31),
    })),
    chat: {
      totalConversations: 12638, conversationsToday: 342, avgMessages: 8.1,
      avgDuration: '6m 51s', aiResponses: 52140,
      perDay: [{ label: 'Mon', value: 1204 }, { label: 'Tue', value: 1317 }, { label: 'Wed', value: 1442 }, { label: 'Thu', value: 1589 }, { label: 'Fri', value: 1721 }, { label: 'Sat', value: 1498 }, { label: 'Sun', value: 1342 }],
    },
    severity: { critical: 7, high: 16, medium: 32, low: 45, criticalCount: 194, highCount: 981 },
    uploads: {
      images: 5124, documents: 1789, total: 6913,
      series: ramp(['Jun', 'Jun 15', 'Jul', 'Jul 15', 'Aug', 'Aug 8'], 620, 1180).map((p, i) => ({ label: p.label, images: p.value, documents: [214, 248, 271, 298, 331, 227][i] })),
    },
    ai: {
      requests: 52140, successful: 50984, failed: 1156, successRate: 97.8, avgResponseTime: 4.5, avgPerChat: 6.7,
      series: ramp(['Jun', 'Jul', 'Aug'], 12800, 21400).map((p) => ({ label: p.label, value: p.value })),
    },
    topStats: { dau: 482, wau: 1284, mau: 2103, retention: 71.2, avgChatsPerUser: 4.9, avgSessionsPerUser: 3.0, newThisMonth: 186, growthRate: 34.8 },
  },
}

// System health + recent activity are treated as "current state" and don't vary
// meaningfully by the selected period.
const SYSTEM_HEALTH = {
  services: [
    { name: 'Backend', status: 'operational' },
    { name: 'Database', status: 'operational' },
    { name: 'Authentication', status: 'operational' },
    { name: 'Storage', status: 'operational' },
    { name: 'AI Service', status: 'operational' },
  ],
  apiAvailability: 99.8,
  apiLatency: 210,
  errorRate: 1.2,
}

const RECENT_ACTIVITY = [
  { time: '2 min ago', event: 'New user registered', category: 'Users', status: 'success' },
  { time: '4 min ago', event: 'Chat created', category: 'Chat', status: 'success' },
  { time: '7 min ago', event: 'AI response generated', category: 'AI', status: 'success' },
  { time: '11 min ago', event: 'Image uploaded', category: 'Upload', status: 'success' },
  { time: '14 min ago', event: 'High-severity conversation', category: 'Emergency', status: 'alert' },
  { time: '19 min ago', event: 'Document uploaded', category: 'Upload', status: 'success' },
  { time: '23 min ago', event: 'AI response generated', category: 'AI', status: 'success' },
  { time: '28 min ago', event: 'New user registered', category: 'Users', status: 'success' },
  { time: '35 min ago', event: 'AI request failed (retried)', category: 'AI', status: 'warning' },
  { time: '41 min ago', event: 'Critical-severity conversation', category: 'Emergency', status: 'alert' },
]

export const ADMIN_PERIODS = PERIODS

export const getDataset = (periodId) => DATASETS[periodId] || DATASETS['30d']
export const getSystemHealthMock = () => SYSTEM_HEALTH
export const getRecentActivityMock = () => RECENT_ACTIVITY
