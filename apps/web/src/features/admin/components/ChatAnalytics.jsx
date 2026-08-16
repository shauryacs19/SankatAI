// Chat/conversation analytics: summary stats + chats-per-day bar chart.
import { fmt, CHART } from '../format'
import BarChart from './charts/BarChart.jsx'

export default function ChatAnalytics({ data }) {
  if (!data) return null
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head"><h3>Chat Analytics</h3></div>
      <div className="ac-substats ac-substats-grid">
        <div className="ac-substat"><span>Total conversations</span><b>{fmt(data.totalConversations)}</b></div>
        <div className="ac-substat"><span>Conversations today</span><b>{fmt(data.conversationsToday)}</b></div>
        <div className="ac-substat"><span>Avg messages / convo</span><b>{data.avgMessages}</b></div>
        <div className="ac-substat"><span>Avg duration</span><b>{data.avgDuration}</b></div>
        <div className="ac-substat"><span>AI responses</span><b>{fmt(data.aiResponses)}</b></div>
      </div>
      <div className="ac-chart-label">Chats per day</div>
      <BarChart data={data.perDay || []} bars={[{ key: 'value', color: CHART.bar, label: 'Chats' }]} height={150} />
    </section>
  )
}
