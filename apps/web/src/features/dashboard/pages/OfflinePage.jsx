// Offline Mode — placeholder page (no offline functionality yet).
import { CloudOff } from 'lucide-react'

export default function OfflinePage() {
  return (
    <div className="db-view scroll-view">
      <div className="db-cards">
        <section className="dx-card dx-offline">
          <div className="dx-offline-icon"><CloudOff size={30} /></div>
          <h3 className="dx-offline-title">Offline Mode</h3>
          <p className="dx-offline-sub">Offline assistance features are coming soon.</p>
        </section>
      </div>
    </div>
  )
}
