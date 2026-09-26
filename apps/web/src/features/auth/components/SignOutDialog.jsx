// Confirmation before signing out. Every sign-out entry point (Settings, the
// landing account menu, the mobile landing menu) goes through this dialog.
import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { ConfirmDialog } from '../../../components/ui'

export function SignOutDialog({ open, onClose, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
    }
  }
  return (
    <ConfirmDialog
      open={open}
      onClose={() => !busy && onClose()}
      onConfirm={confirm}
      busy={busy}
      tone="destructive"
      icon={LogOut}
      title="Sign out?"
      description="You'll need to sign in again to use SankatAI on this device. Your data stays in your account."
      confirmLabel="Sign out"
      busyLabel="Signing out…"
    />
  )
}
