import { useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, BarChart3, HeartPulse, LayoutDashboard, RefreshCw, ScrollText, Shield, ThumbsUp, UserCog, Users,
} from 'lucide-react'
import { Alert, Button, Field, Input, SegmentedControl, SkipLink } from '../../components/ui'
import { ADMIN_CSS } from './admin.styles'
import { analyticsToday, PRESETS, toRange, validateCustom } from './format'

const NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/feedback', label: 'Feedback', icon: ThumbsUp },
  { to: '/admin/health', label: 'System Health', icon: HeartPulse },
  { to: '/admin/access', label: 'Admin Access', icon: UserCog },
  { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
]
const RANGED = ['/admin', '/admin/analytics', '/admin/users', '/admin/feedback']

export default function AdminLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [preset, setPreset] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [customError, setCustomError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  const range = useMemo(() => toRange({ preset, ...applied }), [preset, applied])
  const showRange = RANGED.includes(pathname.replace(/\/$/, '') || '/admin')

  const choose = (value) => {
    setPreset(value)
    setCustomError('')
    if (value === 'custom' && !applied.from) {
      const today = analyticsToday()
      setCustom({ from: today, to: today })
    }
  }
  const applyCustom = (e) => {
    e.preventDefault()
    const problem = validateCustom(custom.from, custom.to)
    setCustomError(problem)
    if (!problem) setApplied(custom)
  }

  return (
    <div className="ac-root">
      <style>{ADMIN_CSS}</style>
      <SkipLink />
      <header className="ac-topbar">
        <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => navigate('/dashboard/chat')}>App</Button>
        <div className="ac-title">
          <span className="ac-title-icon" aria-hidden="true"><Shield size={18} /></span>
          <div>
            <h1>Sankat.AI Admin</h1>
            <p>Platform analytics and administration</p>
          </div>
        </div>
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => setRefreshKey((k) => k + 1)}>Refresh</Button>
      </header>

      <nav className="ac-nav" aria-label="Admin sections">
        {NAV.map((item) => {
          const Icon = item.icon
          return (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `ac-navlink ${isActive ? 'active' : ''}`}>
              <Icon size={16} aria-hidden="true" />{item.label}
            </NavLink>
          )
        })}
      </nav>

      <main id="main" tabIndex={-1} className="ac-main">
        <p className="ac-scope">
          Platform analytics only: aggregated, pseudonymous counts. No patient records, messages or documents are shown here.
        </p>

        {showRange && (
          <div className="ac-filters">
            <SegmentedControl label="Date range" options={PRESETS} value={preset} onChange={choose} />
            {preset === 'custom' && (
              <form className="ac-custom" onSubmit={applyCustom} noValidate>
                <Field label="From"><Input type="date" value={custom.from} max={custom.to || undefined} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></Field>
                <Field label="To"><Input type="date" value={custom.to} min={custom.from || undefined} max={analyticsToday()} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></Field>
                <Button type="submit" variant="secondary" size="sm">Apply</Button>
              </form>
            )}
            <span className="ac-range-note">{range.from === range.to ? range.from : `${range.from} → ${range.to}`} · IST{range.granularity === 'hour' ? ' · hourly' : ''}</span>
          </div>
        )}
        {customError && <Alert tone="warning">{customError}</Alert>}

        <Outlet context={{ range, refreshKey }} />
      </main>
    </div>
  )
}
