// "My health" pages. Each one is its own entry in the dashboard navigation.
import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { PageHeader } from '../../components/ui'
import { HEALTH_CSS } from './health.styles'
import TimelineView from './components/TimelineView.jsx'
import SymptomTracker from './components/SymptomTracker.jsx'
import ReportAnalyzer from './components/ReportAnalyzer.jsx'

// Full-bleed canvas: the shell gives it the whole content area.
export function TimelinePage() {
  const navigate = useNavigate()
  return (
    <div className="tl-page">
      <style>{HEALTH_CSS}</style>
      <TimelineView onOpenReport={(id) => navigate(`/dashboard/reports?report=${encodeURIComponent(id)}`)} />
    </div>
  )
}

export function SymptomsPage() {
  return (
    <div className="pg pg--wide">
      <style>{HEALTH_CSS}</style>
      <PageHeader description="Record how a symptom feels each day and see whether your ratings go up or down." />
      <SymptomTracker />
    </div>
  )
}

export function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const clearOpen = useCallback(() => setParams((p) => { p.delete('report'); return p }, { replace: true }), [setParams])
  return (
    <div className="pg pg--wide">
      <style>{HEALTH_CSS}</style>
      <ReportAnalyzer openId={params.get('report')} onOpened={clearOpen} />
    </div>
  )
}
