// Explains what "AI offline" means and what still works. Reached from the app
// bar's offline badge.
import { useOutletContext } from 'react-router-dom'
import { CloudOff, CheckCircle2, Ambulance, MessageSquare } from 'lucide-react'
import { Alert, Button, Card, EmptyState } from '../../../components/ui'

export default function OfflinePage() {
  const { isOffline, goChat } = useOutletContext()
  if (!isOffline) {
    return (
      <div className="pg">
        <EmptyState
          icon={CheckCircle2}
          title="The AI assistant is online"
          description="Answers in the chat come from the AI assistant. If it becomes unavailable, this page explains what changes."
          action={<Button variant="secondary" icon={MessageSquare} onClick={goChat}>Back to chat</Button>}
        />
      </div>
    )
  }
  return (
    <div className="pg">
      <Alert tone="warning" icon={CloudOff} title="The AI assistant is unavailable right now.">
        You can keep using SankatAI, but answers will be automatic keyword estimates.
      </Alert>
      <Card title="What changes in offline mode">
        <ul className="ui-list">
          <li>Replies come from a simple keyword check, not the AI assistant.</li>
          <li>Each one is clearly labelled “Offline estimate — not an AI assessment”.</li>
          <li>Your chats, documents and profile still work as normal.</li>
        </ul>
      </Card>
      <div className="ui-form-actions">
        <Button variant="secondary" icon={MessageSquare} onClick={goChat}>Back to chat</Button>
        <Button variant="emergency" icon={Ambulance} href="tel:108">Emergency? Call 108</Button>
      </div>
    </div>
  )
}
