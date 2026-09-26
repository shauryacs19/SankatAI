import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { MailPlus, UserMinus, XCircle } from 'lucide-react'
import { useAuth } from '../../../context/AuthContext.jsx'
import { Alert, Badge, Button, Card, ConfirmDialog, Field, Input, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { createInvitation, listAdmins, listInvitations, removeAdmin, revokeInvitation } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import { LoadError, PageSkeleton } from '../components/States.jsx'
import { fmtTime } from '../format'

const GMAIL = /^[a-z0-9._%+-]+@gmail\.com$/
const TONES = { pending: 'warning', accepted: 'success', revoked: 'neutral', expired: 'neutral', active: 'success' }

export default function AccessPage() {
  const { refreshKey } = useOutletContext()
  const navigate = useNavigate()
  const toast = useToast()
  const { refreshUser, user } = useAuth()
  const { data, refreshing, error, reload } = useAdminResource(
    async () => {
      const [a, i] = await Promise.all([listAdmins(), listInvitations()])
      return { ...a, invitations: i.invitations }
    },
    [refreshKey],
  )
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [confirm, setConfirm] = useState(null) // { kind: 'revoke'|'remove', item }
  const [ack, setAck] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton cards={2} />

  const normalized = email.trim().toLowerCase()
  const emailErr = !GMAIL.test(normalized) ? 'Enter a Gmail address (name@gmail.com).' : ''
  const active = data.admins.filter((a) => a.status === 'active')
  const lastAdmin = data.activeCount <= 1

  const invite = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (emailErr) return
    setInviting(true)
    setInviteError('')
    try {
      const inv = await createInvitation(normalized)
      toast.success(`Invitation sent to ${inv.email}. It expires in 48 hours.`)
      setEmail('')
      setTouched(false)
      reload()
    } catch (err) {
      setInviteError(errText(err, 'Could not send the invitation.'))
    } finally {
      setInviting(false)
    }
  }

  const act = async () => {
    const { kind, item } = confirm
    setBusy(true)
    try {
      if (kind === 'revoke') {
        await revokeInvitation(item.id)
        toast.success('Invitation revoked.')
      } else {
        const res = await removeAdmin(item.sub, { confirmSelf: item.isSelf })
        if (res.cognitoCleanup !== 'done') toast.error('Access revoked, but Cognito cleanup failed. Remove again to retry.')
        else toast.success(item.isSelf ? 'You removed your own admin access.' : 'Admin removed.')
        if (item.isSelf) {
          try { await refreshUser() } catch { /* refresh token revoked by global sign-out */ }
          navigate('/dashboard/chat', { replace: true })
          return
        }
      }
      setConfirm(null)
      reload()
    } catch (err) {
      toast.error(errText(err, 'That didn’t work. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <Card title="Invite an admin" icon={MailPlus} headingLevel={2}
        description="The invitee gets a one-time link (valid 48 hours) and must sign in with the same, verified Gmail address.">
        {inviteError && <Alert tone="danger">{inviteError}</Alert>}
        <form className="ac-invite" onSubmit={invite} noValidate>
          <Field label="Gmail address" required error={touched ? emailErr || undefined : undefined}>
            <Input type="email" autoComplete="off" inputMode="email" value={email} placeholder="name@gmail.com"
              onChange={(e) => { setEmail(e.target.value); setInviteError('') }} onBlur={() => setTouched(true)} />
          </Field>
          <Button type="submit" variant="primary" loading={inviting} loadingText="Sending…">Send invitation</Button>
        </form>
      </Card>

      <Card title={`Admins (${data.activeCount} active)`} headingLevel={2} flush>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Granted</th><th scope="col">Via</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.admins.map((a) => (
                <tr key={a.sub}>
                  <th scope="row">{a.email || '—'}{a.isRoot && <Badge tone="brand" className="ac-you">Root</Badge>}{a.isSelf && <Badge className="ac-you">You</Badge>}</th>
                  <td><Badge tone={TONES[a.status]}>{a.status}</Badge>{a.cognitoCleanup === 'failed' && <Badge tone="danger">Cognito cleanup failed</Badge>}</td>
                  <td>{fmtTime(a.grantedAt)}</td>
                  <td>{a.grantedVia === 'bootstrap' ? 'Bootstrap' : 'Invitation'}</td>
                  <td className="ac-actions">
                    {/* The root admin is permanent; only root removes others, anyone may leave. The server enforces both. */}
                    {!a.isRoot && (a.isSelf || data.canRemoveOthers) && (a.status === 'active' || a.cognitoCleanup === 'failed') && (
                      <Button variant="ghost" size="sm" icon={UserMinus}
                        disabled={a.status === 'active' && lastAdmin}
                        hint={a.status === 'active' && lastAdmin ? 'The last active admin can’t be removed. Invite another admin first.' : undefined}
                        onClick={() => { setAck(false); setConfirm({ kind: 'remove', item: a }) }}>
                        {a.status === 'active' ? (a.isSelf ? 'Leave' : 'Remove') : 'Retry cleanup'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Invitations" headingLevel={2} flush>
        {data.invitations.length === 0 ? (
          <p className="ac-muted ac-pad">No invitations yet.</p>
        ) : (
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Sent</th><th scope="col">Expires</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.invitations.map((i) => (
                  <tr key={i.id}>
                    <th scope="row">{i.email}</th>
                    <td><Badge tone={TONES[i.status]}>{i.status}</Badge>{i.emailStatus === 'failed' && <Badge tone="danger">email failed</Badge>}</td>
                    <td>{fmtTime(i.createdAt)}</td>
                    <td>{fmtTime(i.expiresAt)}</td>
                    <td className="ac-actions">
                      {i.status === 'pending' && (
                        <Button variant="ghost" size="sm" icon={XCircle} onClick={() => setConfirm({ kind: 'revoke', item: i })}>Revoke</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => !busy && setConfirm(null)}
        onConfirm={act}
        busy={busy}
        title={confirm?.kind === 'revoke' ? 'Revoke this invitation?' : confirm?.item?.isSelf ? 'Remove your own admin access?' : 'Remove this admin?'}
        description={confirm?.kind === 'revoke'
          ? `The link sent to ${confirm?.item?.email} will stop working.`
          : confirm?.item?.isSelf
            ? `You (${user?.email || 'this account'}) will lose access to the admin console immediately and be signed out on other devices.`
            : `${confirm?.item?.email || 'This admin'} loses admin access immediately and is signed out everywhere.`}
        confirmLabel={confirm?.kind === 'revoke' ? 'Revoke' : 'Remove'}
        busyLabel={confirm?.kind === 'revoke' ? 'Revoking…' : 'Removing…'}
        confirmDisabled={confirm?.kind === 'remove' && confirm?.item?.isSelf && !ack}
      >
        {confirm?.kind === 'remove' && confirm?.item?.isSelf && (
          <label className="auth-check ac-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            I understand I will lose admin access. {active.length - 1} other active admin{active.length - 1 === 1 ? '' : 's'} will remain.
          </label>
        )}
      </ConfirmDialog>
    </div>
  )
}
