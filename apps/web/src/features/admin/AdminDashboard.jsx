import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Shield, RefreshCw, ArrowLeft, Users, UserCheck, MessagesSquare, MessageSquare,
  Sparkles, Siren, Image as ImageIcon, FileText, Clock, AlertTriangle,
} from 'lucide-react'
import { adminPeriods, getAdminDashboard } from './services/adminApi'
import { fmt } from './format'
import { ADMIN_CSS } from './admin.styles'
import MetricCard from './components/MetricCard.jsx'
import TopStats from './components/TopStats.jsx'
import UserAnalytics from './components/UserAnalytics.jsx'
import ChatAnalytics from './components/ChatAnalytics.jsx'
import SeverityAnalytics from './components/SeverityAnalytics.jsx'
import UploadAnalytics from './components/UploadAnalytics.jsx'
import AIUsage from './components/AIUsage.jsx'
import SystemHealth from './components/SystemHealth.jsx'
import RecentActivity from './components/RecentActivity.jsx'

const metricCards = (m) => [
  { title: 'Total Users', value: fmt(m.totalUsers.value), change: m.totalUsers.change, changeLabel: 'this period', Icon: Users },
  { title: 'Active Users', value: fmt(m.activeUsers.value), change: m.activeUsers.change, Icon: UserCheck },
  { title: 'Total Chats', value: fmt(m.totalChats.value), change: m.totalChats.change, Icon: MessagesSquare },
  { title: 'Chats Today', value: fmt(m.chatsToday.value), change: m.chatsToday.change, changeLabel: m.chatsToday.compareLabel, Icon: MessageSquare },
  { title: 'AI Responses', value: fmt(m.aiResponses.value), change: m.aiResponses.change, Icon: Sparkles },
  { title: 'Emergency Conversations', value: fmt(m.emergencyChats.value), change: m.emergencyChats.change, Icon: Siren },
  { title: 'Images Uploaded', value: fmt(m.imagesUploaded.value), change: m.imagesUploaded.change, Icon: ImageIcon },
  { title: 'Documents Uploaded', value: fmt(m.documentsUploaded.value), change: m.documentsUploaded.change, Icon: FileText },
  { title: 'Avg Response Time', value: `${m.avgResponseTime.value}s`, change: m.avgResponseTime.change, lowerIsBetter: true, Icon: Clock },
]

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async (p) => {
    setLoading(true); setError('')
    try {
      const res = await getAdminDashboard(p)
      setData(res)
    } catch {
      setError('Could not load admin metrics. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  return (
    <div className="ac-root">
      <style>{ADMIN_CSS}</style>

      <header className="ac-topbar">
        <button className="ac-back" onClick={() => navigate('/dashboard/chat')} title="Back to app"><ArrowLeft size={16} /> App</button>
        <div className="ac-title">
          <span className="ac-title-icon"><Shield size={18} /></span>
          <div>
            <h1>SankatAI Admin Dashboard</h1>
            <p>Administration &amp; Business Overview</p>
          </div>
        </div>
        <div className="ac-topbar-right">
          <button className="ac-refresh" onClick={() => load(period)} disabled={loading}><RefreshCw size={15} className={loading ? 'ac-spin' : ''} /> Refresh</button>
        </div>
      </header>

      <div className="ac-devbanner" role="note">
        <AlertTriangle size={15} />
        <span><b>Development preview.</b> Populated with mock data — not connected to DynamoDB, Cognito, S3 or CloudWatch. Production will enforce Cognito admin-group authorization on the backend before serving these metrics.</span>
      </div>

      <div className="ac-periodrow">
        <span className="ac-period-label">Time period</span>
        <div className="ac-period-tabs" role="tablist" aria-label="Time period">
          {adminPeriods.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              className={`ac-period-tab ${period === p.id ? 'active' : ''}`}
              onClick={() => setPeriod(p.id)}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {error && <div className="ac-error" role="alert"><AlertTriangle size={16} /> {error}</div>}

      {loading && !data ? (
        <div className="ac-loading" role="status" aria-busy="true"><span className="ac-spinner" /> Loading metrics…</div>
      ) : data && (
        <div className={`ac-content ${loading ? 'ac-dim' : ''}`}>
          <div className="ac-metrics">
            {metricCards(data.metrics).map((c) => <MetricCard key={c.title} {...c} />)}
          </div>

          {/* Row 1 — analytics charts (4-up on desktop) */}
          <div className="ac-grid-4">
            <UserAnalytics data={data.users} />
            <ChatAnalytics data={data.chat} />
            <SeverityAnalytics data={data.severity} />
            <UploadAnalytics data={data.uploads} />
          </div>

          {/* Row 2 — usage / health / stats / activity */}
          <div className="ac-grid-4">
            <AIUsage data={data.ai} />
            <SystemHealth data={data.health} />
            <TopStats data={data.topStats} />
            <RecentActivity data={data.activity} />
          </div>
        </div>
      )}
    </div>
  )
}
