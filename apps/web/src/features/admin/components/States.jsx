// Loading / error / empty states shared by the admin pages.
import { BarChart3 } from 'lucide-react'
import { EmptyState, ErrorState, Skeleton } from '../../../components/ui'
import { errText } from '../../../utils/errText'

export function PageSkeleton({ cards = 8 }) {
  return (
    <div className="ac-stack" aria-busy="true" aria-label="Loading">
      <div className="ac-metrics">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="ac-card ac-metric"><Skeleton width="50%" /><Skeleton height="1.75rem" width="70%" /></div>
        ))}
      </div>
      <div className="ac-grid-2">
        <div className="ac-card ac-panel-pad"><Skeleton height="12rem" /></div>
        <div className="ac-card ac-panel-pad"><Skeleton height="12rem" /></div>
      </div>
    </div>
  )
}

export function LoadError({ error, onRetry, retrying }) {
  const forbidden = error?.status === 403
  return (
    <ErrorState
      title={forbidden ? 'Admin access required' : 'Couldn’t load this page'}
      description={forbidden
        ? 'Your account no longer has admin access. If this is unexpected, ask another admin.'
        : errText(error, 'Something went wrong while loading. Try again.')}
      onRetry={forbidden ? undefined : onRetry}
      retrying={retrying}
    />
  )
}

export function NoData({ title = 'No data for this range', description }) {
  return <EmptyState compact icon={BarChart3} headingLevel={3} title={title} description={description} />
}
