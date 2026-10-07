import { useEffect, useState } from 'react'
import { Copy, CreditCard, Mail, Save, Trash2, Users, UserRound, Settings } from 'lucide-react'
import { PLAY_THEMES } from '../utils/themes'

const TITLES = { profile: 'Profile', settings: 'Settings', team: 'Team', billing: 'Membership & Billing' }
const ICONS = { profile: UserRound, settings: Settings, team: Users, billing: CreditCard }
const LABELS = { playbooks: 'Playbooks', gamePlans: 'Game plans', plays: 'Plays', scoutPlays: 'Scouting plays' }
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = (value, timeZone) => value ? new Date(value).toLocaleDateString(undefined, timeZone ? { timeZone } : undefined) : 'Not started'

export function AccountViews({ view, user, workspace, api, onUserUpdated, onWorkspaceUpdated, onGuardChange }) {
  const [form, setForm] = useState(() => view === 'profile'
    ? { name: user.name || '', coachingTitle: user.coachingTitle || '' }
    : view === 'team' ? { name: workspace.name, ...workspace.defaults }
      : { theme: 'color', fieldOrientation: 'High School', timezone: 'UTC', ...user.preferences })
  const [savedForm, setSavedForm] = useState(form)
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('coach')
  const [deliveryMode, setDeliveryMode] = useState(null)
  const [billing, setBilling] = useState(null)
  const [loading, setLoading] = useState(view === 'team' || view === 'billing')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const HeadingIcon = ICONS[view]
  const teamEditable = workspace.capabilities.manageTeam

  useEffect(() => {
    let active = true
    const load = view === 'team' ? Promise.all([api.members(), workspace.role === 'coach' ? Promise.resolve({ items: [] }) : api.invitations()]) : view === 'billing' ? api.billing() : null
    if (load) load.then((result) => {
      if (!active) return
      if (view === 'team') { setMembers(result[0].items); setInvitations(result[1].items); setDeliveryMode(result[1].deliveryMode) }
      else setBilling(result)
    }).catch((failure) => { if (active) setError(failure.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, view, workspace.role])

  async function save(event) {
    event?.preventDefault()
    setSaving(true)
    setError(null)
    setNotice('')
    try {
      if (view === 'profile') {
        const updated = await api.updateProfile(form)
        onUserUpdated({ ...user, ...updated })
      } else if (view === 'settings') {
        const preferences = await api.updatePreferences(form)
        onUserUpdated({ ...user, preferences })
      } else if (view === 'team') {
        const { name, ...defaults } = form
        onWorkspaceUpdated(await api.updateWorkspace({ name, defaults }))
      }
      setSavedForm(form)
      setNotice('Saved')
      return true
    } catch (failure) {
      setError(failure.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    onGuardChange({ dirty: dirty || Boolean(inviteEmail), saving, canSave: !inviteEmail, save })
    return () => onGuardChange(null)
  })

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }))
    setNotice('')
  }

  async function memberAction(member, action, role) {
    if (action === 'remove' && !window.confirm(`Remove ${member.name} from ${workspace.name}?`)) return
    setSaving(true)
    setError(null)
    try {
      if (action === 'remove') await api.removeMember(member.userId)
      else await api.updateMember(member.userId, role)
      setMembers((await api.members()).items)
      onWorkspaceUpdated(await api.workspace())
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  async function inviteAction(action, invite) {
    if (action === 'revoke' && !window.confirm(`Revoke invitation to ${invite.email}?`)) return
    setSaving(true)
    setError(null)
    try {
      if (action === 'send') {
        await api.invite({ email: inviteEmail, role: inviteRole })
        setInviteEmail('')
      } else if (action === 'revoke') await api.revokeInvitation(invite.id)
      else await api.resendInvitation(invite.id)
      const result = await api.invitations()
      setInvitations(result.items)
      setDeliveryMode(result.deliveryMode)
      onWorkspaceUpdated(await api.workspace())
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSaving(false)
    }
  }

  async function copyInvitation(invite) {
    try {
      await navigator.clipboard.writeText(invite.capturedUrl)
      setNotice('Invitation link copied')
    } catch {
      setError('Unable to copy the invitation link')
    }
  }

  const preferences = <>
    <label className="dialog-field"><span>Default diagram theme</span>
      <select value={form.theme || 'color'} onChange={(event) => change('theme', event.target.value)}>
        {PLAY_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
      </select>
    </label>
    <label className="dialog-field"><span>Default field standard</span>
      <select value={form.fieldOrientation || 'High School'} onChange={(event) => change('fieldOrientation', event.target.value)}>
        <option value="High School">High School</option><option value="NCAA">NCAA</option><option value="NFL">NFL</option>
      </select>
    </label>
    {view === 'settings' && <label className="dialog-field"><span>Timezone</span>
      <input required value={form.timezone} onChange={(event) => change('timezone', event.target.value)} />
    </label>}
  </>

  return <main className="account-view">
    <header className="account-view-heading"><HeadingIcon size={24} aria-hidden="true" /><h1>{TITLES[view]}</h1></header>
    <div className="account-view-context"><span>{workspace.name}</span><span className="account-role">{workspace.role}</span></div>
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}
    {loading && <p role="status">Loading...</p>}

    {['profile', 'settings', 'team'].includes(view) && <form className="account-form" onSubmit={save}>
      <fieldset disabled={saving || (view === 'team' && !teamEditable)}>
        {view === 'profile' && <>
          <label className="dialog-field"><span>Display name</span><input required maxLength={120} value={form.name} onChange={(event) => change('name', event.target.value)} /></label>
          <label className="dialog-field"><span>Coaching title</span><input maxLength={120} value={form.coachingTitle} onChange={(event) => change('coachingTitle', event.target.value)} /></label>
          <label className="dialog-field"><span>Email</span><input value={user.email || ''} placeholder="Not configured" readOnly /></label>
        </>}
        {view === 'settings' && preferences}
        {view === 'team' && <>
          <label className="dialog-field"><span>Team name</span><input required maxLength={120} value={form.name} onChange={(event) => change('name', event.target.value)} /></label>
          {preferences}
        </>}
      </fieldset>
      {(view !== 'team' || teamEditable) && <div className="account-form-actions">
        <button type="button" className="dialog-cancel" disabled={!dirty || saving} onClick={() => { setForm(savedForm); setNotice('') }}>Cancel</button>
        <button type="submit" className="dialog-create" disabled={!dirty || saving}><Save size={16} aria-hidden="true" />{saving ? 'Saving...' : 'Save'}</button>
      </div>}
    </form>}

    {view === 'team' && !loading && <section className="account-section" aria-label="Team staff">
      <h2>Staff <span className="account-count">{workspace.seatsUsed} / {workspace.seatLimit} seats reserved or active</span></h2>
      <div className="account-table-wrap"><table className="account-table"><thead><tr><th>Name</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>{members.map((member) => <tr key={member.userId}><td>{member.name}</td><td>
          {teamEditable && member.role !== 'owner' ? <select aria-label={`Role for ${member.name}`} value={member.role} disabled={saving} onChange={(event) => memberAction(member, 'role', event.target.value)}>
            <option value="coach">Coach</option><option value="admin">Admin</option>
          </select> : <span className="account-role">{member.role}</span>}
        </td><td>{teamEditable && member.role !== 'owner' && <button type="button" className="account-icon-button" title={`Remove ${member.name}`} aria-label={`Remove ${member.name}`} disabled={saving} onClick={() => memberAction(member, 'remove')}><Trash2 size={16} /></button>}</td></tr>)}</tbody>
      </table></div>
    </section>}

    {view === 'team' && workspace.role !== 'coach' && <section className="account-section" aria-label="Team invitations">
      <h2>Invitations {deliveryMode === 'capture' && <span className="account-count">Captured locally</span>}</h2>
      {teamEditable && <form className="account-invite-form" onSubmit={(event) => { event.preventDefault(); inviteAction('send') }}>
        <label className="dialog-field"><span>Email</span><input type="email" required maxLength={254} value={inviteEmail} disabled={saving} onChange={(event) => setInviteEmail(event.target.value)} /></label>
        <label className="dialog-field"><span>Role</span><select value={inviteRole} disabled={saving} onChange={(event) => setInviteRole(event.target.value)}><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
        <button type="submit" className="dialog-create" disabled={saving || workspace.seatsUsed >= workspace.seatLimit}><Mail size={16} aria-hidden="true" />Invite</button>
      </form>}
      {!loading && invitations.length === 0 && <p>No invitations</p>}
      <div className="account-invitations">{invitations.map((invite) => <div className="account-invitation" key={invite.id}>
        <div><strong>{invite.email}</strong><span className="account-role">{invite.role} - {invite.status}</span><small>Expires {date(invite.expiresAt, user.preferences?.timezone)}</small></div>
        <div className="account-invitation-actions">
          {invite.capturedUrl && <button type="button" className="account-icon-button" title="Copy captured invitation link" aria-label={`Copy invitation for ${invite.email}`} onClick={() => copyInvitation(invite)}><Copy size={16} /></button>}
          {teamEditable && invite.status === 'pending' && <>
            <button type="button" className="account-icon-button" disabled={saving} title="Resend invitation" aria-label={`Resend invitation for ${invite.email}`} onClick={() => inviteAction('resend', invite)}><Mail size={16} /></button>
            <button type="button" className="account-icon-button" disabled={saving} title="Revoke invitation" aria-label={`Revoke invitation for ${invite.email}`} onClick={() => inviteAction('revoke', invite)}><Trash2 size={16} /></button>
          </>}
        </div>
      </div>)}</div>
    </section>}

    {view === 'billing' && !loading && billing && <>
      <section className="account-section">
        <h2>{workspace.kind === 'team' ? 'Team' : 'Individual'} Membership</h2>
        <dl className="account-details">
          <dt>Status</dt><dd className="account-role">{workspace.subscription.status}</dd>
          <dt>Billing interval</dt><dd>{workspace.subscription.interval === 'year' ? 'Annual' : workspace.subscription.interval === 'month' ? 'Monthly' : 'Trial'}</dd>
          <dt>{workspace.subscription.status === 'trialing' ? 'Trial ends' : 'Paid through'}</dt><dd>{date(workspace.subscription.trialEndsAt || workspace.subscription.periodEndsAt, user.preferences?.timezone)}</dd>
          {workspace.deletionDueAt && <><dt>Content retained until</dt><dd>{date(workspace.deletionDueAt, user.preferences?.timezone)}</dd></>}
          {workspace.subscription.source === 'development_fixture' && <><dt>Billing source</dt><dd>Local mock</dd></>}
          {workspace.kind === 'team' && <><dt>Seats</dt><dd>{workspace.seatsUsed} / {workspace.seatLimit}</dd></>}
        </dl>
        {billing.managedByTeam ? <p>Managed by Team Owner</p> : <>
          <div className="account-price-row"><div><strong>{money(billing.prices.month)}</strong><span>Monthly, tax included</span></div><div><strong>{money(billing.prices.year)}</strong><span>Annual, paid upfront, tax included</span></div></div>
          <button type="button" className="dialog-create" disabled={!billing.connected} title={billing.provider === 'mock' ? 'Billing is simulated locally' : 'Paddle is not connected'}><CreditCard size={16} aria-hidden="true" />Manage Billing</button>
        </>}
      </section>
      <section className="account-section" aria-label="Content usage"><h2>Workspace Usage</h2>
        <div className="account-usage">{Object.entries(workspace.limits).map(([type, limit]) => <div key={type}>
          <div><span>{LABELS[type]}</span><span>{workspace.usage[type].toLocaleString()} / {limit.toLocaleString()}</span></div>
          <meter min={0} max={limit} value={Math.min(workspace.usage[type], limit)} aria-label={`${LABELS[type]} usage`} />
        </div>)}</div>
      </section>
    </>}
  </main>
}