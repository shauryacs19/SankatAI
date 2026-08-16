// Dashboard loading state: an ambulance drives along a road from point A to B,
// the road turning red behind it, with the word "Loading" beneath. Self-contained
// styles so it renders correctly even before the dashboard shell mounts. Theme-aware.

import { Ambulance } from 'lucide-react'

export default function DashboardSkeleton() {
  return (
    <div className="ld-overlay" role="status" aria-busy="true" aria-label="Loading SankatAI">
      <style>{LD_CSS}</style>

      <div className="ld-box">
        <div className="ld-road">
          <div className="ld-amb">
            <Ambulance size={30} strokeWidth={2} />
          </div>
          <span className="ld-dot ld-dot-a" />
          <span className="ld-dot ld-dot-b" />
          <div className="ld-line" />
          <div className="ld-fill" />
        </div>

        <span className="ld-text">Loading</span>
      </div>
    </div>
  )
}

const LD_CSS = `
.ld-overlay {
  position: fixed; inset: 0; z-index: 4000;
  display: flex; align-items: center; justify-content: center;
  background: var(--bg-body, #F8FAFC);
}

.ld-box { display: flex; flex-direction: column; align-items: center; gap: 16px; }

/* the road: a straight line from A to B, with the ambulance riding on top */
.ld-road { position: relative; width: 300px; height: 40px; }

/* base (untravelled) road */
.ld-line {
  position: absolute; left: 0; right: 0; bottom: 6px; height: 4px;
  border-radius: 2px;
  background: var(--border-subtle, #E5E7EB);
}

/* travelled road turns red, trailing behind the ambulance */
.ld-fill {
  position: absolute; left: 0; bottom: 6px; height: 4px; width: 0;
  border-radius: 2px;
  background: var(--primary, #C4504B);
  animation: ld-fill 2.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes ld-fill { 0% { width: 0; } 100% { width: 100%; } }

/* endpoint markers for A and B */
.ld-dot {
  position: absolute; bottom: 3px; width: 10px; height: 10px;
  border-radius: 50%;
  background: var(--bg-body, #F8FAFC);
  border: 2px solid var(--border-subtle, #E5E7EB);
}
.ld-dot-a { left: -1px; }
.ld-dot-b { right: -1px; }

/* the ambulance driving from A to B, sitting on the road */
.ld-amb {
  position: absolute; left: 0; bottom: 10px;
  color: var(--primary, #C4504B);
  animation: ld-drive 2.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
.ld-amb svg { display: block; } /* faces right, its travel direction */
@keyframes ld-drive {
  0%   { transform: translateX(0); }
  100% { transform: translateX(270px); }
}

.ld-text {
  font-size: 1.45rem; font-weight: 700; letter-spacing: 0.02em;
  color: var(--text-primary, #0F172A);
  animation: ld-pulse 1.6s ease-in-out infinite;
}
@keyframes ld-pulse { 0%, 100% { opacity: 0.65; } 50% { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .ld-text { animation: none; }
  .ld-fill { animation: none; width: 45%; }
  .ld-amb { animation: none; transform: translateX(122px); }
}
`
