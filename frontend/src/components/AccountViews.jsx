import { useEffect, useState } from 'react'
import { Copy, CreditCard, LoaderCircle, Mail, Save, Trash2, Users, UserRound, Settings } from 'lucide-react'
import { DataGrid } from './DataGrid'
import { PLAY_THEMES } from '../utils/themes'

const TITLES = { profile: 'Profile', settings: 'Settings', team: 'Team', billing: 'Membership & Billing' }
const ICONS = { profile: UserRound, settings: Settings, team: Users, billing: CreditCard }
const BILLING_TABS = [{ id: 'membership', label: 'Membership' }, { id: 'usage', label: 'Workspace Usage' }]
const TEAM_TABS = [{ id: 'workspace', label: 'Workspace' }, { id: 'staff', label: 'Staff' }, { id: 'invitations', label: 'Invitations' }]
const LABELS = { playbooks: 'Playbooks', gamePlans: 'Game plans', plays: 'Plays', scoutPlays: 'Scouting plays' }
const money = (cents) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const date = (value, timeZone) => value ? new Date(value).toLocaleDateString(undefined, timeZone ? { timeZone } : undefined) : 'Not started'

export function AccountViews({ view, user, workspace, api, onUserUpdated, onWorkspaceUpdated, onGuardChange, onDismiss, onSaved }) {
  const [form, setForm] = useState(() => view === 'profile'
    ? { name: user.name || '', coachingTitle: user.coachingTitle || '' }
    : view === 'team' ? { name: workspace.name, ...workspace.defaults }
      : { theme: 'color', fieldOrientation: 'High School', timezone: 'UTC', ...user.preferences })
  const [savedForm, setSavedForm] = useState(form)
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('coach')
  const [invitationCopyFeedback, setInvitationCopyFeedback] = useState(null)
  const [deliveryMode, setDeliveryMode] = useState(null)
  const [billing, setBilling] = useState(null)
  const [billingTab, setBillingTab] = useState('membership')
  const [teamTab, setTeamTab] = useState('workspace')
  const [loading, setLoading] = useState(view === 'team' || view === 'billing')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState('')
  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)
  const isAccountDialog = ['settings', 'profile', 'billing', 'team'].includes(view)
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
    if (isAccountDialog && view === 'team' && inviteEmail) return false
    if (isAccountDialog && !dirty) {
      onSaved?.()
      return true
    }
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
      if (isAccountDialog) onSaved?.()
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

  function handleBillingTabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const currentIndex = BILLING_TABS.findIndex((tab) => tab.id === billingTab)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? BILLING_TABS.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + BILLING_TABS.length) % BILLING_TABS.length
    setBillingTab(BILLING_TABS[nextIndex].id)
    event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex]?.focus()
  }

  function handleTeamTabKeyDown(event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const tabs = TEAM_TABS.filter((tab) => tab.id !== 'invitations' || workspace.role !== 'coach')
    const currentIndex = tabs.findIndex((tab) => tab.id === teamTab)
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? tabs.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
    setTeamTab(tabs[nextIndex].id)
    event.currentTarget.querySelectorAll('[role="tab"]')[nextIndex]?.focus()
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
    setInvitationCopyFeedback(null)
    try {
      await navigator.clipboard.writeText(invite.capturedUrl)
      setInvitationCopyFeedback({ id: invite.id, message: 'Invitation link copied', failed: false })
    } catch {
      setInvitationCopyFeedback({ id: invite.id, message: 'Unable to copy the invitation link', failed: true })
    }
  }

  const preferences = <>
    <label className="dialog-field"><span>Default field standard</span>
      <select value={form.fieldOrientation || 'High School'} onChange={(event) => change('fieldOrientation', event.target.value)}>
        <option value="High School">High School</option><option value="NCAA">NCAA</option><option value="NFL">NFL</option>
      </select>
    </label>
    <label className="dialog-field"><span>Default diagram theme</span>
      <select value={form.theme || 'color'} onChange={(event) => change('theme', event.target.value)}>
        {PLAY_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.label}</option>)}
      </select>
    </label>
    {view === 'settings' && <label className="dialog-field"><span>Timezone</span>
      <input required value={form.timezone} onChange={(event) => change('timezone', event.target.value)} />
    </label>}
  </>

  const content = <main
    className={`account-view${isAccountDialog ? ' account-form-dialog dialog-panel' : ''}${view === 'team' ? ' account-team-dialog' : ''}`}
    role={isAccountDialog ? 'dialog' : undefined}
    aria-modal={isAccountDialog ? 'true' : undefined}
    aria-labelledby={isAccountDialog ? 'account-view-title' : undefined}
    onClick={isAccountDialog ? (event) => event.stopPropagation() : undefined}
  >
    {isAccountDialog
      ? <h2 id="account-view-title" aria-label={TITLES[view]}>
          <HeadingIcon size={26} strokeWidth={1.8} aria-hidden="true" />{TITLES[view]}
          {['team', 'billing'].includes(view) && <span className="account-title-loading" role="status" title={loading ? `Loading ${TITLES[view].toLowerCase()}...` : undefined}>
            {loading && <><LoaderCircle size={18} aria-hidden="true" /><span className="sr-only">Loading {TITLES[view].toLowerCase()}...</span></>}
          </span>}
        </h2>
      : <header className="account-view-heading"><HeadingIcon size={24} aria-hidden="true" /><h1 id="account-view-title">{TITLES[view]}</h1></header>}
    {isAccountDialog
      ? <dl className="account-view-context account-dialog-context">
          <div><dt>Current workspace</dt><dd>{workspace.name}</dd></div>
          <div><dt>Your role</dt><dd className="account-role account-dialog-role">{workspace.role}</dd></div>
        </dl>
      : <div className="account-view-context"><span>{workspace.name}</span><span className="account-role">{workspace.role}</span></div>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {notice && <p className="account-notice" role="status">{notice}</p>}

    {['profile', 'settings'].includes(view) && <form className="account-form" onSubmit={save}>
      <fieldset disabled={saving}>
        {view === 'profile' && <>
          <label className="dialog-field"><span>Display name</span><input required maxLength={120} value={form.name} onChange={(event) => change('name', event.target.value)} /></label>
          <label className="dialog-field"><span>Coaching title</span><input maxLength={120} value={form.coachingTitle} onChange={(event) => change('coachingTitle', event.target.value)} /></label>
          <label className="dialog-field"><span>Email</span><input value={user.email || ''} placeholder="Not configured" readOnly /></label>
        </>}
        {view === 'settings' && preferences}
      </fieldset>
      <div className="account-form-actions">
        <button type="button" className="dialog-cancel" disabled={saving} onClick={() => onDismiss?.()}>Cancel</button>
        <button type="submit" className="dialog-create" disabled={saving}><Save size={16} aria-hidden="true" />{saving ? 'Saving...' : 'OK'}</button>
      </div>
    </form>}

    {view === 'team' && <div className="account-billing-tabs" role="tablist" aria-label="Team sections" onKeyDown={handleTeamTabKeyDown}>
      {TEAM_TABS.filter((tab) => tab.id !== 'invitations' || workspace.role !== 'coach').map((tab) => <button
        key={tab.id}
        id={`account-team-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={teamTab === tab.id}
        aria-controls={`account-team-panel-${tab.id}`}
        tabIndex={teamTab === tab.id ? 0 : -1}
        onClick={() => setTeamTab(tab.id)}
      >{tab.label}</button>)}
    </div>}
    {view === 'team' && <div className="account-team-panels">
      <div id="account-team-panel-workspace" className={`account-team-panel${teamTab === 'workspace' ? ' active' : ''}`} role="tabpanel" aria-labelledby="account-team-tab-workspace" aria-hidden={teamTab !== 'workspace'} inert={teamTab !== 'workspace'} tabIndex={teamTab === 'workspace' ? 0 : -1}>
        <form className="account-form" onSubmit={save}>
          <fieldset disabled={saving || !teamEditable}>
            <label className="dialog-field"><span>Team name</span><input required maxLength={120} value={form.name} onChange={(event) => change('name', event.target.value)} /></label>
            {preferences}
          </fieldset>
        </form>
      </div>
      <div id="account-team-panel-staff" className={`account-team-panel${teamTab === 'staff' ? ' active' : ''}`} role="tabpanel" aria-labelledby="account-team-tab-staff" aria-hidden={teamTab !== 'staff'} inert={teamTab !== 'staff'} tabIndex={teamTab === 'staff' ? 0 : -1}>
        <section className="account-section" aria-label="Team staff">
          <p className="account-team-summary">{workspace.seatsUsed} / {workspace.seatLimit} seats reserved or active</p>
          {!loading && <div className="account-table-wrap"><table className="account-table data-grid-table"><thead><tr><th className="data-grid-type-header" scope="col" aria-label="Type" /><th>Name</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{members.map((member) => <tr key={member.userId}><td className="data-grid-type-cell" aria-label="Staff member" title="Staff member"><UserRound size={17} strokeWidth={2} aria-hidden="true" /></td><td>{member.name}</td><td>
              {teamEditable && member.role !== 'owner' ? <select aria-label={`Role for ${member.name}`} value={member.role} disabled={saving} onChange={(event) => memberAction(member, 'role', event.target.value)}>
                <option value="coach">Coach</option><option value="admin">Admin</option>
              </select> : <span className="account-role">{member.role}</span>}
            </td><td>{teamEditable && member.role !== 'owner' && <button type="button" className="account-icon-button" title={`Remove ${member.name}`} aria-label={`Remove ${member.name}`} disabled={saving} onClick={() => memberAction(member, 'remove')}><Trash2 size={16} /></button>}</td></tr>)}</tbody>
          </table></div>}
        </section>
      </div>
      {workspace.role !== 'coach' && <div id="account-team-panel-invitations" className={`account-team-panel${teamTab === 'invitations' ? ' active' : ''}`} role="tabpanel" aria-labelledby="account-team-tab-invitations" aria-hidden={teamTab !== 'invitations'} inert={teamTab !== 'invitations'} tabIndex={teamTab === 'invitations' ? 0 : -1}>
        <section className="account-section" aria-label="Team invitations">
          {teamEditable && <form className="account-invite-form" onSubmit={(event) => { event.preventDefault(); inviteAction('send') }}>
            <label className="dialog-field"><span>Email</span><input type="email" required maxLength={254} value={inviteEmail} disabled={saving} onChange={(event) => setInviteEmail(event.target.value)} /></label>
            <label className="dialog-field"><span>Role</span><select value={inviteRole} disabled={saving} onChange={(event) => setInviteRole(event.target.value)}><option value="coach">Coach</option><option value="admin">Admin</option></select></label>
            <button type="submit" className="dialog-create" disabled={saving || workspace.seatsUsed >= workspace.seatLimit}><Mail size={16} aria-hidden="true" />Invite</button>
          </form>}
          {deliveryMode === 'capture' && <p className="account-team-summary">Captured locally</p>}
          {!loading && <div className="account-invitations"><DataGrid
            title="Invitations"
            rowIcon={Mail}
            rowType="Email invitation"
            compact
            items={invitations}
            busy={saving}
            columns={[
              { key: 'email', header: 'Email', render: (email, invite) => <>
                <span>{email}</span>
                {invitationCopyFeedback?.id === invite.id && <span className={`account-invitation-copy-feedback${invitationCopyFeedback.failed ? ' failed' : ''}`} role={invitationCopyFeedback.failed ? 'alert' : 'status'}>{invitationCopyFeedback.message}</span>}
              </> },
              { key: 'role', header: 'Role', render: (role) => <span className="account-role">{role}</span> },
              { key: 'status', header: 'Status', render: (status) => <span className="account-invitation-status" data-status={status}>{status}</span> },
              { key: 'expiresAt', header: 'Expires', render: (expiresAt) => date(expiresAt, user.preferences?.timezone) },
            ]}
            rowActionLabel={(invite) => `Invitation actions for ${invite.email}`}
            rowActions={(invite) => [
              { key: 'copy', label: 'Copy Invitation Link', icon: Copy, disabled: !invite.capturedUrl, onClick: copyInvitation },
              { key: 'resend', label: 'Resend Invitation', icon: Mail, disabled: !teamEditable || invite.status !== 'pending', onClick: (row) => inviteAction('resend', row) },
              { key: 'revoke', label: 'Revoke Invitation', icon: Trash2, destructive: true, disabled: !teamEditable || invite.status !== 'pending', onClick: (row) => inviteAction('revoke', row) },
            ]}
          /></div>}
        </section>
      </div>}
    </div>}

    {view === 'billing' && <div className="account-billing-tabs" role="tablist" aria-label="Membership and billing" onKeyDown={handleBillingTabKeyDown}>
      {BILLING_TABS.map((tab) => <button
        key={tab.id}
        id={`account-billing-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-selected={billingTab === tab.id}
        aria-controls={`account-billing-panel-${tab.id}`}
        tabIndex={billingTab === tab.id ? 0 : -1}
        onClick={() => setBillingTab(tab.id)}
      >{tab.label}</button>)}
    </div>}
    {view === 'billing' && !loading && billing && <div className="account-billing-panels">
      <div
        id="account-billing-panel-membership"
        className={`account-billing-panel${billingTab === 'membership' ? ' active' : ''}`}
        role="tabpanel"
        aria-labelledby="account-billing-tab-membership"
        aria-hidden={billingTab !== 'membership'}
        inert={billingTab !== 'membership'}
        tabIndex={billingTab === 'membership' ? 0 : -1}
      >
        <section className="account-section">
          <dl className="account-details">
            <dt>Membership type</dt><dd>{workspace.kind === 'team' ? 'Team' : 'Individual'}</dd>
            <dt>Status</dt><dd className="account-role">{workspace.subscription.status}</dd>
            <dt>Billing interval</dt><dd>{workspace.subscription.interval === 'year' ? 'Annual' : workspace.subscription.interval === 'month' ? 'Monthly' : 'Trial'}</dd>
            <dt>{workspace.subscription.status === 'trialing' ? 'Trial ends' : 'Paid through'}</dt><dd>{date(workspace.subscription.trialEndsAt || workspace.subscription.periodEndsAt, user.preferences?.timezone)}</dd>
            {workspace.deletionDueAt && <><dt>Content retained until</dt><dd>{date(workspace.deletionDueAt, user.preferences?.timezone)}</dd></>}
            {workspace.subscription.source === 'development_fixture' && <><dt>Billing source</dt><dd>Test subscription</dd></>}
            {workspace.kind === 'team' && <><dt>Seats</dt><dd>{workspace.seatsUsed} / {workspace.seatLimit}</dd></>}
          </dl>
          {billing.managedByTeam ? <p>Managed by Team Owner</p> : <>
            <div className="account-price-row"><div><strong>{money(billing.prices.month)}</strong><span>Monthly, tax included</span></div><div><strong>{money(billing.prices.year)}</strong><span>Annual, paid upfront, tax included</span></div></div>
            <button type="button" className="dialog-create" disabled={!billing.connected} title={billing.provider === 'mock' ? 'Billing is simulated locally' : 'Paddle is not connected'}><CreditCard size={16} aria-hidden="true" />Manage Billing</button>
          </>}
        </section>
      </div>
      <div
        id="account-billing-panel-usage"
        className={`account-billing-panel${billingTab === 'usage' ? ' active' : ''}`}
        role="tabpanel"
        aria-labelledby="account-billing-tab-usage"
        aria-hidden={billingTab !== 'usage'}
        inert={billingTab !== 'usage'}
        tabIndex={billingTab === 'usage' ? 0 : -1}
      >
        <section className="account-section" aria-label="Workspace Usage">
          <div className="account-usage">{Object.entries(workspace.limits).map(([type, limit]) => <div key={type}>
            <div><span>{LABELS[type]}</span><span>{workspace.usage[type].toLocaleString()} / {limit.toLocaleString()}</span></div>
            <meter min={0} max={limit} value={Math.min(workspace.usage[type], limit)} aria-label={`${LABELS[type]} usage`} />
          </div>)}</div>
        </section>
      </div>
    </div>}
    {view === 'team' && isAccountDialog && <div className="account-form-actions">
      <button type="button" className="dialog-cancel" disabled={saving} onClick={() => onDismiss?.()}>Cancel</button>
      <button type="button" className="dialog-create" disabled={saving || Boolean(inviteEmail)} onClick={() => save()}>{saving ? 'Saving...' : 'OK'}</button>
    </div>}
    {view === 'billing' && isAccountDialog && <div className="account-form-actions">
      <button type="button" className="dialog-create" onClick={() => onDismiss?.()}>Close</button>
    </div>}
  </main>

  return isAccountDialog
    ? <div
        className="dialog-overlay account-dialog-overlay"
        role="presentation"
        onClick={() => onDismiss?.()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onDismiss?.()
          }
        }}
      >{content}</div>
    : content
}