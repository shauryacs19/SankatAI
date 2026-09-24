// Content-area skeletons, shaped like the real page. They replace ONLY the
// content — the shell (navigation and SOS) is interactive while data loads.

import { Skeleton } from '../../components/ui'

const CSS = `
.skel-chat { flex: 1; width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-6); }
.skel-user { align-self: flex-end; display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); width: 60%; }
.skel-ai { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-5); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.skel-row { display: flex; align-items: center; gap: var(--space-3); }
.skel-list { width: 100%; max-width: var(--content-reading); margin: 0 auto; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
.skel-item { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface); }
.skel-grow { flex: 1; display: flex; flex-direction: column; gap: var(--space-2); }
@media (max-width: 767px) { .skel-chat, .skel-list { padding: var(--space-4); } }
`

export function ContentSkeleton({ variant = 'list' }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className={variant === 'chat' ? 'skel-chat' : 'skel-list'}>
      <style>{CSS}</style>
      <span className="sr-only">{variant === 'chat' ? 'Loading your conversation…' : 'Loading…'}</span>
      {variant === 'chat' ? (
        <>
          <div className="skel-user"><Skeleton height="3rem" width="100%" /><Skeleton variant="text" width="3rem" /></div>
          <div className="skel-ai">
            <div className="skel-row"><Skeleton variant="circle" width="2rem" height="2rem" /><Skeleton variant="text" width="6rem" /></div>
            <Skeleton variant="text" width="90%" /><Skeleton variant="text" width="75%" /><Skeleton variant="text" width="40%" />
          </div>
        </>
      ) : (
        [0, 1, 2, 3].map((i) => (
          <div key={i} className="skel-item">
            <Skeleton variant="circle" width="2.5rem" height="2.5rem" />
            <div className="skel-grow"><Skeleton variant="text" width={`${70 - i * 10}%`} /><Skeleton variant="text" width="30%" /></div>
          </div>
        ))
      )}
    </div>
  )
}
