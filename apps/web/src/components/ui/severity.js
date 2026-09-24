import { AlertCircle, AlertTriangle, CheckCircle2, Siren } from 'lucide-react'

// Severity presentation. Never colour alone: icon + word, text in the
// text-safe ink (--sev-x-ink).
export const SEVERITY_UI = {
  LOW: { cls: 'low', label: 'Low risk', Icon: CheckCircle2 },
  MODERATE: { cls: 'moderate', label: 'Moderate risk', Icon: AlertCircle },
  HIGH: { cls: 'high', label: 'High risk', Icon: AlertTriangle },
  EMERGENCY: { cls: 'emergency', label: 'Emergency', Icon: Siren },
}
export const severityUi = (s) => SEVERITY_UI[s] || null

