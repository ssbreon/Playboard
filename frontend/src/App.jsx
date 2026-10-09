import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Archive, ArchiveRestore, BookOpen, Check, ChevronRight, ClipboardList, Copy, CreditCard, FolderOpen, LoaderCircle, LogOut, Printer, Route, Save, ScanSearch, Settings, Trash2, UserRound, Users } from 'lucide-react'
import { api } from './api'
import { createApi, isDevelopmentAuth, isSignedOut, signIn, signOut } from './api/client'
import { AccountViews } from './components/AccountViews'
import { renderCategoryBadge } from './components/CategoryBadge'
import { DataGrid } from './components/DataGrid'
import { COLLECTION_CATEGORIES, NewCollectionDialog } from './components/NewCollectionDialog'
import { NewPlayDialog, playCategoriesForCollection } from './components/NewPlayDialog'
import { PlayDesigner } from './components/PlayDesigner'
import { PrintPreviewDialog } from './components/PrintPreviewDialog'
import { buildMarkersFromTemplate, PLAY_TEMPLATES } from './utils/formations'
import { formatDate } from './utils/formatDate'
import { themeLabel } from './utils/themes'
import { defaultPlayPerspective } from './utils/playGeometry'
import './App.css'

const STATUS_COLUMN = { key: 'recordStatus', header: 'Status', render: (value) => value ?? 'Active' }

const GRID_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', render: renderCategoryBadge },
  { key: 'playCount', header: 'Plays' },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
]

const PLAYBOOK_GRID_COLUMNS = [GRID_COLUMNS[0], { key: 'year', header: 'Year' }, ...GRID_COLUMNS.slice(1), { key: 'ownerName', header: 'Owner' }, STATUS_COLUMN]
function formatGameDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—'
}

const GAME_PLAN_GRID_COLUMNS = [
  GRID_COLUMNS[0],
  { key: 'year', header: 'Year' },
  { key: 'opponent', header: 'Opponent' },
  { key: 'gameDate', header: 'Game Date', render: formatGameDate },
  ...GRID_COLUMNS.slice(1),
  { key: 'ownerName', header: 'Owner' },
  STATUS_COLUMN,
]

const PLAY_GRID_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', render: renderCategoryBadge },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
  { key: 'theme', header: 'Theme', render: (value) => themeLabel(value) },
  { key: 'ownerName', header: 'Owner' },
  STATUS_COLUMN,
]

function timezoneColumns(columns, timezone) {
  return columns.map((column) => column.render === formatDate ? { ...column, render: (value) => formatDate(value, timezone) } : column)
}

function AppBar({ activeView, onNavigate, user, workspace, onWorkspaceChange, onSignOut, busy, switchingSubscription }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function navigate(event, view) {
    event.preventDefault()
    setMenuOpen(false)
    onNavigate(view)
  }

  function menuKeys(event) {
    if (event.key === 'Escape') {
      setMenuOpen(false)
      menuRef.current?.querySelector('.account-button')?.focus()
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      const items = [...menuRef.current.querySelectorAll('[role^="menuitem"]:not(:disabled)')]
      const index = items.indexOf(document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
      items[next]?.focus()
    }
  }

  return (
    <header className="app-bar">
      <div className="app-bar-brand">
        <img className="app-bar-logo" src="/blitzboard-mark.svg" alt="" aria-hidden="true" />
        <span className="app-bar-wordmark">BLITZBOARD <span className="app-bar-wordmark-accent">Studio</span></span>
      </div>
      <nav className="app-bar-nav" aria-label="Primary navigation">
        {user && (
          <>
        <a
          href="#playbooks"
          className={`app-bar-link${activeView === 'playbooks' ? ' active' : ''}`}
          onClick={(event) => navigate(event, 'playbooks')}
        >
          Playbooks
        </a>
        <a
          href="#game-plans"
          className={`app-bar-link${activeView === 'gamePlans' ? ' active' : ''}`}
          onClick={(event) => navigate(event, 'gamePlans')}
        >
          Game Plans
        </a>
          </>
        )}
      </nav>
      {user && <div className="app-bar-account" ref={menuRef} onKeyDown={menuKeys}>
        <div className="app-bar-identity">
          <span className="app-bar-user-name" title={user.name}>{user.name}</span>
          {workspace && <span className="active-workspace-label"><span className="app-bar-workspace-name" title={workspace.name}>{workspace.name}</span></span>}
        </div>
        <span className="app-bar-subscription-status" role="status" title={switchingSubscription ? 'Switching subscription...' : undefined}>
          {switchingSubscription && <><LoaderCircle size={14} aria-hidden="true" /><span className="sr-only">Switching subscription...</span></>}
        </span>
        <button
          type="button"
          className="account-button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${user.name}`}
          disabled={busy}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <UserRound className="account-icon" aria-hidden="true" />
        </button>
        {menuOpen && (
          <div className="account-menu" role="menu">
            <div className="account-menu-panes">
              <div className="account-menu-subscriptions" role="group" aria-label="Subscriptions">
                <div className="account-menu-section-label">Subscriptions</div>
                {user.workspaces?.map((item) => <button key={item.id} type="button" role="menuitemradio" aria-checked={workspace?.id === item.id} disabled={busy} onClick={() => { setMenuOpen(false); onWorkspaceChange(item.id) }}>
                  {item.kind === 'team' ? <Users className="menu-item-icon" aria-hidden="true" /> : <UserRound className="menu-item-icon" aria-hidden="true" />}
                  <span className="workspace-menu-name">{item.name}</span>{workspace?.id === item.id && <Check size={16} aria-hidden="true" />}
                </button>)}
              </div>
              <div className="account-menu-actions" role="group" aria-label="Account">
                <div className="account-menu-section-label">{user.name} (<span className="account-role">{workspace?.role || user.roles.join(', ')}</span>)</div>
                <button type="button" role="menuitem" disabled={busy} onClick={(event) => navigate(event, 'profile')}><UserRound className="menu-item-icon" aria-hidden="true" />Profile</button>
                <button type="button" role="menuitem" disabled={busy} onClick={(event) => navigate(event, 'settings')}><Settings className="menu-item-icon" aria-hidden="true" />Settings</button>
                {workspace?.kind === 'team' && <button type="button" role="menuitem" disabled={busy} onClick={(event) => navigate(event, 'team')}><Users className="menu-item-icon" aria-hidden="true" />Team</button>}
                <button type="button" role="menuitem" disabled={busy} onClick={(event) => navigate(event, 'billing')}><CreditCard className="menu-item-icon" aria-hidden="true" />Membership &amp; Billing</button>
                <div className="account-menu-divider" role="separator" />
                <button type="button" role="menuitem" disabled={busy} onClick={() => { setMenuOpen(false); onSignOut() }}><LogOut className="menu-item-icon" aria-hidden="true" />Sign Out</button>
              </div>
            </div>
          </div>
        )}
      </div>}
    </header>
  )
}

function PlaysDrillthroughView({ parentRecord, parentLabel, onParentUpdated, updateParent, title, rowIcon, rowType, fetchRows, reloadToken, busy, onReorder, onNew, newLabel, onOpenPlay, onPrintAll, rowActions, onGuardChange, readOnly, timezone, breadcrumbActionsTarget }) {
  const [name, setName] = useState(parentRecord.name)
  const [category, setCategory] = useState(parentRecord.category || 'Defense')
  const [year, setYear] = useState(String(parentRecord.year || new Date().getFullYear()))
  const [opponent, setOpponent] = useState(parentRecord.opponent || '')
  const [gameDate, setGameDate] = useState(parentRecord.gameDate || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftCategory, setDraftCategory] = useState(category)
  const [draftYear, setDraftYear] = useState(year)
  const [draftOpponent, setDraftOpponent] = useState(opponent)
  const [draftGameDate, setDraftGameDate] = useState(gameDate)
  async function handleSettingsSave(event) {
    event.preventDefault()
    if (!draftName.trim() || readOnly || saving || busy) return
    setSaving(true)
    setError(null)
    try {
      const payload = { name: draftName.trim(), category: draftCategory, year: Number(draftYear) }
      if (parentRecord.kind === 'gamePlan') {
        payload.opponent = draftOpponent.trim()
        payload.gameDate = draftGameDate
      }
      const updated = await updateParent(parentRecord.id, payload)
      setName(updated.name)
      setCategory(updated.category ?? draftCategory)
      setYear(String(updated.year ?? draftYear))
      if (parentRecord.kind === 'gamePlan') {
        setOpponent(updated.opponent ?? payload.opponent)
        setGameDate(updated.gameDate ?? draftGameDate)
      }
      onParentUpdated(updated)
      setSettingsOpen(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    onGuardChange({ dirty: settingsOpen, saving, canSave: false })
    return () => onGuardChange(null)
  })

  function openSettings() {
    setError(null)
    setDraftName(name)
    setDraftCategory(category)
    setDraftYear(year)
    setDraftOpponent(opponent)
    setDraftGameDate(gameDate)
    setSettingsOpen(true)
  }

  return (
    <main className="plays-drillthrough-view">
      {breadcrumbActionsTarget && createPortal(<>
          <button type="button" className="breadcrumb-settings" onClick={openSettings} disabled={readOnly || saving || busy} title={`Edit ${parentLabel} Settings`}>
            <Settings size={18} aria-hidden="true" />
            <span>Edit {parentLabel} Settings</span>
          </button>
      </>, breadcrumbActionsTarget)}
      {settingsOpen && (
        <div className="dialog-overlay" onClick={() => { if (!saving) setSettingsOpen(false) }}>
          <form className="dialog-panel" aria-busy={saving} onClick={(event) => event.stopPropagation()} onSubmit={handleSettingsSave}>
            <h2><Settings size={26} strokeWidth={1.8} aria-hidden="true" />{parentLabel} Settings</h2>
            <label className="dialog-field">
              <span>{parentLabel} name</span>
              <input type="text" value={draftName} onChange={(event) => setDraftName(event.target.value)} required />
            </label>
            <label className="dialog-field">
              <span>Category</span>
              <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}>
                {COLLECTION_CATEGORIES.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Year</span>
              <input
                type="number"
                min="1000"
                max="9999"
                step="1"
                value={draftYear}
                onChange={(event) => setDraftYear(event.target.value)}
                required
              />
            </label>
            {parentRecord.kind === 'gamePlan' && (
              <>
                <label className="dialog-field">
                  <span>Opponent</span>
                  <input type="text" value={draftOpponent} onChange={(event) => setDraftOpponent(event.target.value)} />
                </label>
                <label className="dialog-field">
                  <span>Game Date</span>
                  <input type="date" value={draftGameDate} onChange={(event) => setDraftGameDate(event.target.value)} />
                </label>
              </>
            )}
            {error && <p className="data-grid-status data-grid-error" role="alert">Unable to save: {error}</p>}
            <div className="dialog-actions">
              <button type="button" className="dialog-cancel" disabled={saving} onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="dialog-create" disabled={readOnly || saving || busy || !draftName.trim()}>
                {saving ? 'Saving...' : 'OK'}
              </button>
            </div>
          </form>
        </div>
      )}
      <DataGrid
        title={title}
        columns={timezoneColumns(PLAY_GRID_COLUMNS, timezone)}
        rowIcon={rowIcon}
        rowType={rowType}
        categoryOptions={playCategoriesForCollection(parentRecord.category)}
        statusFilter
        reloadToken={reloadToken}
        busy={busy}
        fetchRows={fetchRows}
        showPage
        onReorder={readOnly ? undefined : onReorder}
        onNew={onNew}
        newLabel={newLabel}
        menuItems={[{ label: `Print ${parentLabel}...`, icon: Printer, onClick: onPrintAll }]}
        onRowDoubleClick={onOpenPlay}
        rowActions={rowActions}
      />
    </main>
  )
}

function WorkspaceApp({ authUser, workspace, api, onWorkspaceChange, onUserUpdated, onWorkspaceUpdated, onGuardChange, onSignOut, requestLeave, busy, switchingSubscription }) {
  const [breadcrumbActionsTarget, setBreadcrumbActionsTarget] = useState(null)
  const [view, setView] = useState('playbooks')
  const [accountDialog, setAccountDialog] = useState(null)
  const [parent, setParent] = useState(null)
  const [designer, setDesigner] = useState(null)
  const [newDialog, setNewDialog] = useState(null)
  const [newCollection, setNewCollection] = useState(null)
  const [printPlay, setPrintPlay] = useState(null)
  const [printCollection, setPrintCollection] = useState(null)
  const [playbooksReloadToken, setPlaybooksReloadToken] = useState(0)
  const [gamePlansReloadToken, setGamePlansReloadToken] = useState(0)
  const [playsReloadToken, setPlaysReloadToken] = useState(0)
  const [scoutPlaysReloadToken, setScoutPlaysReloadToken] = useState(0)
  const [statusSaving, setStatusSaving] = useState(false)
  const [statusError, setStatusError] = useState(null)

  const writable = workspace.capabilities.edit
  const defaults = { ...workspace.defaults, ...authUser.preferences }
  const fetchPlaybooks = useCallback(({ namePrefix }) => api.listPlaybooks(undefined, namePrefix).then((result) => result.items), [api])
  const fetchGamePlans = useCallback(({ namePrefix }) => api.listGamePlans(undefined, namePrefix).then((result) => result.items), [api])
  const parentId = parent?.id
  const fetchPlays = useCallback(({ namePrefix }) => api.listPlays(parentId, undefined, namePrefix).then((result) => result.items), [api, parentId])
  const fetchScoutPlays = useCallback(({ namePrefix }) => api.listScoutPlays(parentId, undefined, namePrefix).then((result) => result.items), [api, parentId])

  async function handleCreateCollection(payload) {
    if (newCollection === 'playbook') {
      await api.createPlaybook(payload)
      setPlaybooksReloadToken((t) => t + 1)
    } else {
      await api.createGamePlan(payload)
      setGamePlansReloadToken((t) => t + 1)
    }
    setNewCollection(null)
    onWorkspaceUpdated(await api.workspace())
  }

  async function handleCopyCollection(kind, row) {
    const payload = {
      name: `${row.name} (Copy)`,
      category: row.category,
      year: row.year,
      ...(kind === 'gamePlan' && { opponent: row.opponent, gameDate: row.gameDate }),
    }
    if (kind === 'playbook') {
      await api.createPlaybook(payload)
      setPlaybooksReloadToken((t) => t + 1)
    } else {
      await api.createGamePlan(payload)
      setGamePlansReloadToken((t) => t + 1)
    }
  }

  async function handleDeleteCollection(kind, row) {    if (!window.confirm(`Delete "${row.name}"?`)) return
    if (kind === 'playbook') {
      await api.deletePlaybook(row.id)
      setPlaybooksReloadToken((t) => t + 1)
    } else {
      await api.deleteGamePlan(row.id)
      setGamePlansReloadToken((t) => t + 1)
    }
  }

  async function handlePrintCollection(kind, row) {
    const result = kind === 'playbook' ? await api.listPlays(row.id) : await api.listScoutPlays(row.id)
    setPrintCollection({ collection: { ...row, kind }, plays: result.items })
  }

  async function handleRecordStatus(kind, row, parentId) {
    const restoring = row.recordStatus === 'Archived'
    if (!restoring && !window.confirm(`Archive "${row.name}"? It will be hidden from the default Active grid view. Its data will remain intact in the database and can be restored later.`)) return
    setStatusSaving(true)
    setStatusError(null)
    try {
      const payload = { recordStatus: restoring ? 'Active' : 'Archived' }
      if (kind === 'playbook') {
        await api.updatePlaybook(row.id, payload)
        setPlaybooksReloadToken((token) => token + 1)
      } else if (kind === 'gamePlan') {
        await api.updateGamePlan(row.id, payload)
        setGamePlansReloadToken((token) => token + 1)
      } else if (kind === 'play') {
        await api.updatePlay(parentId, row.id, payload)
        setPlaysReloadToken((token) => token + 1)
      } else {
        await api.updateScoutPlay(parentId, row.id, payload)
        setScoutPlaysReloadToken((token) => token + 1)
      }
    } catch (error) {
      setStatusError(`Unable to ${restoring ? 'restore' : 'archive'} "${row.name}": ${error.message}`)
    } finally {
      setStatusSaving(false)
    }
  }

  function recordStatusAction(kind, row, parentId) {
    const restoring = row.recordStatus === 'Archived'
    return { key: restoring ? 'restore' : 'archive', label: restoring ? 'Restore' : 'Archive', icon: restoring ? ArchiveRestore : Archive, onClick: (item) => handleRecordStatus(kind, item, parentId) }
  }

  function collectionRowActions(kind) {
    return (row) => [
      { key: 'open', label: 'Open', icon: FolderOpen, onClick: (item) => setParent({ ...item, kind }) },
      ...(writable ? [{ key: 'copy', label: 'Copy', icon: Copy, onClick: (item) => handleCopyCollection(kind, item) }] : []),
      { key: 'print', label: 'Print...', icon: Printer, onClick: (item) => handlePrintCollection(kind, item) },
      ...(writable ? [recordStatusAction(kind, row)] : []),
      ...(workspace.capabilities.delete ? [{ key: 'delete', label: 'Delete', icon: Trash2, destructive: true, onClick: (item) => handleDeleteCollection(kind, item) }] : []),
    ]
  }

  async function handleCreatePlay(name, templateId, theme, category, fieldDecoration, fieldOrientation, fieldZone) {
    const { target, parentId } = newDialog
    setNewDialog(null)
    const perspective = defaultPlayPerspective(parent?.category)
    const template = PLAY_TEMPLATES.find((t) => t.id === templateId) || PLAY_TEMPLATES[0]
    const initialMarkers = buildMarkersFromTemplate(template)
    const record =
      target === 'play'
        ? await api.createPlay(parentId, {
            name,
            template: templateId,
            theme,
            category,
            fieldDecoration,
            fieldOrientation,
            fieldZone,
            perspective,
            markers: initialMarkers,
          })
        : await api.createScoutPlay(parentId, {
            name,
            template: templateId,
            theme,
            category,
            fieldDecoration,
            fieldOrientation,
            fieldZone,
            perspective,
          })
    setDesigner({
      kind: target,
      parentId,
      id: record.id,
      name: record.name,
      initialMarkers: record.markers || initialMarkers,
      initialDrawings: record.drawings,
      initialTextAnnotations: record.textAnnotations,
      initialZones: record.zones,
      initialTheme: record.theme,
      template: record.template,
      category: record.category,
      parentCategory: parent?.category,
      fieldDecoration: record.fieldDecoration,
      fieldOrientation: record.fieldOrientation,
      fieldZone: record.fieldZone,
        perspective: record.perspective || perspective,
    })
  }

  function openDesignerForRow(kind, parentId, row) {
    const template = PLAY_TEMPLATES.find((t) => t.id === row.template) || PLAY_TEMPLATES[0]
    setDesigner({
      kind,
      parentId,
      id: row.id,
      name: row.name,
      initialMarkers: row.markers || buildMarkersFromTemplate(template),
      initialDrawings: row.drawings,
      initialTextAnnotations: row.textAnnotations,
      initialZones: row.zones,
      initialTheme: row.theme,
      template: row.template,
      category: row.category,
      parentCategory: parent?.category,
      fieldDecoration: row.fieldDecoration,
      fieldOrientation: row.fieldOrientation,
      fieldZone: row.fieldZone,
        perspective: row.perspective || defaultPlayPerspective(parent?.category),
    })
  }

  async function handleCopyPlay(kind, parentId, row) {
    const payload = {
      name: `${row.name} (Copy)`,
      template: row.template,
      theme: row.theme,
      category: row.category,
      fieldDecoration: row.fieldDecoration,
      fieldOrientation: row.fieldOrientation,
      fieldZone: row.fieldZone,
      perspective: row.perspective || defaultPlayPerspective(parent?.category),
      markers: row.markers,
      drawings: row.drawings,
      textAnnotations: row.textAnnotations,
      zones: row.zones,
    }
    if (kind === 'play') {
      await api.createPlay(parentId, payload)
      setPlaysReloadToken((t) => t + 1)
    } else {
      await api.createScoutPlay(parentId, payload)
      setScoutPlaysReloadToken((t) => t + 1)
    }
  }

  async function handleDeletePlay(kind, parentId, row) {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    if (kind === 'play') {
      await api.deletePlay(parentId, row.id)
      setPlaysReloadToken((t) => t + 1)
    } else {
      await api.deleteScoutPlay(parentId, row.id)
      setScoutPlaysReloadToken((t) => t + 1)
    }
  }

  function playRowActions(kind, parentId) {
    return (row) => [
      { key: 'open', label: 'Open', icon: FolderOpen, onClick: (r) => openDesignerForRow(kind, parentId, r) },
      ...(writable ? [{ key: 'copy', label: 'Copy', icon: Copy, onClick: (r) => handleCopyPlay(kind, parentId, r) }] : []),
      { key: 'print', label: 'Print...', icon: Printer, onClick: (r) => setPrintPlay({ ...r, perspective: r.perspective || defaultPlayPerspective(parent?.category) }) },
      ...(writable ? [recordStatusAction(kind, row, parentId)] : []),
      ...(workspace.capabilities.delete ? [{ key: 'delete', label: 'Delete', icon: Trash2, destructive: true, onClick: (r) => handleDeletePlay(kind, parentId, r) }] : []),
    ]
  }

  return (
    <>
      <AppBar
        activeView={view}
        user={authUser}
        workspace={workspace}
        busy={busy}
        switchingSubscription={switchingSubscription}
        onWorkspaceChange={onWorkspaceChange}
        onSignOut={onSignOut}
        onNavigate={(nextView) => requestLeave(() => {
          if (['settings', 'profile', 'billing', 'team'].includes(nextView)) {
            setDesigner(null)
            setParent(null)
            if (['profile', 'team', 'billing'].includes(view)) setView('playbooks')
            setAccountDialog(nextView)
          } else {
            setAccountDialog(null)
            setDesigner(null)
            setParent(null)
            setView(nextView)
          }
        }, ['settings', 'profile', 'billing'].includes(nextView) ? `Open ${nextView}` : 'Leave this view')}
      />

      <nav className="breadcrumb-bar" aria-label="Breadcrumb">
        <ol>
          <li>
            {parent ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => requestLeave(() => {
                  setDesigner(null)
                  setParent(null)
                  setView(parent.kind === 'playbook' ? 'playbooks' : 'gamePlans')
                }, parent.kind === 'playbook' ? 'Leave playbook' : 'Leave game plan')}
              >
                {parent.kind === 'playbook' ? 'Playbooks' : 'Game Plans'}
              </button>
            ) : (
              <span aria-current="page">{view === 'gamePlans' ? 'Game Plans' : 'Playbooks'}</span>
            )}
          </li>
          {parent && <li>
            <ChevronRight size={16} aria-hidden="true" />
            {designer ? (
              <button type="button" disabled={busy} onClick={() => requestLeave(() => setDesigner(null), 'Close play')}>
                {parent.name}
              </button>
            ) : (
              <span aria-current="page">{parent.name}</span>
            )}
          </li>}
          {designer && <li>
            <ChevronRight size={16} aria-hidden="true" />
            <span aria-current="page">{designer.name}</span>
          </li>}
        </ol>
        <div className="breadcrumb-actions" ref={setBreadcrumbActionsTarget} />
      </nav>

      {!writable && <div className="workspace-read-only" role="status">{workspace.name}: read-only</div>}
      {statusError && <p className="data-grid-status data-grid-error" role="alert">{statusError}</p>}

      <NewPlayDialog
        key={`${workspace.id}:${parent?.category}:${defaults.theme}:${defaults.fieldOrientation}`}
        open={newDialog !== null}
        titleLabel={newDialog?.target === 'scoutPlay' ? 'New Scout Play' : 'New Play'}
        titleIcon={newDialog?.target === 'scoutPlay' ? ScanSearch : Route}
        onCancel={() => setNewDialog(null)}
        onCreate={handleCreatePlay}
        defaultTheme={defaults.theme}
        defaultFieldOrientation={defaults.fieldOrientation}
        categoryOptions={playCategoriesForCollection(parent?.category)}
      />
      {newCollection && (
        <NewCollectionDialog
          title={newCollection === 'playbook' ? 'Add New Playbook' : 'Add New Game Plan'}
          titleIcon={newCollection === 'playbook' ? BookOpen : ClipboardList}
          isPlaybook={newCollection === 'playbook'}
          onCancel={() => setNewCollection(null)}
          onCreate={handleCreateCollection}
        />
      )}
      {printPlay && <PrintPreviewDialog play={printPlay} onClose={() => setPrintPlay(null)} />}
      {printCollection && (
        <PrintPreviewDialog
          plays={printCollection.plays}
          collection={printCollection.collection}
          onClose={() => setPrintCollection(null)}
        />
      )}

      {designer ? (
        <PlayDesigner
          key={`${designer.kind}-${designer.id}`}
          record={designer}
          api={api}
          readOnly={!writable}
          canDelete={workspace.capabilities.delete}
          breadcrumbActionsTarget={breadcrumbActionsTarget}
          onGuardChange={onGuardChange}
          onNameSaved={(name) => setDesigner((current) => current ? { ...current, name } : current)}
        />
      ) : parent?.kind === 'playbook' ? (
        <PlaysDrillthroughView
          key={`plays-${parent.id}`}
          reloadToken={playsReloadToken}
          busy={statusSaving}
          parentRecord={parent}
          parentLabel="Playbook"
          breadcrumbActionsTarget={breadcrumbActionsTarget}
          onParentUpdated={(updated) => setParent((current) => ({ ...current, ...updated, kind: 'playbook' }))}
          readOnly={!writable}
          timezone={authUser.preferences?.timezone}
          onGuardChange={onGuardChange}
          updateParent={api.updatePlaybook}
          title="Plays"
          rowIcon={Route}
          rowType="Play"
          fetchRows={fetchPlays}
          onReorder={(ids) => api.reorderPlays(parent.id, ids)}
          onNew={writable ? () => setNewDialog({ target: 'play', parentId: parent.id }) : undefined}
          newLabel="New Play"
          onOpenPlay={(row) => requestLeave(() => openDesignerForRow('play', parent.id, row), 'Open play')}
          onPrintAll={() => handlePrintCollection('playbook', parent)}
          rowActions={playRowActions('play', parent.id)}
        />
      ) : parent?.kind === 'gamePlan' ? (
        <PlaysDrillthroughView
          key={`scoutPlays-${parent.id}`}
          reloadToken={scoutPlaysReloadToken}
          busy={statusSaving}
          parentRecord={parent}
          parentLabel="Game Plan"
          breadcrumbActionsTarget={breadcrumbActionsTarget}
          onParentUpdated={(updated) => setParent((current) => ({ ...current, ...updated, kind: 'gamePlan' }))}
          readOnly={!writable}
          timezone={authUser.preferences?.timezone}
          onGuardChange={onGuardChange}
          updateParent={api.updateGamePlan}
          title="Scout Plays"
          rowIcon={ScanSearch}
          rowType="Scout Play"
          fetchRows={fetchScoutPlays}
          onReorder={(ids) => api.reorderScoutPlays(parent.id, ids)}
          onNew={writable ? () => setNewDialog({ target: 'scoutPlay', parentId: parent.id }) : undefined}
          newLabel="New Scout Play"
          onOpenPlay={(row) => requestLeave(() => openDesignerForRow('scoutPlay', parent.id, row), 'Open scouting play')}
          onPrintAll={() => handlePrintCollection('gamePlan', parent)}
          rowActions={playRowActions('scoutPlay', parent.id)}
        />
      ) : (
        <>
      {view === 'playbooks' && (
        <DataGrid
          key="playbooks"
          reloadToken={playbooksReloadToken}
          busy={statusSaving}
          title="Playbooks"
          columns={timezoneColumns(PLAYBOOK_GRID_COLUMNS, authUser.preferences?.timezone)}
          rowIcon={BookOpen}
          rowType="Playbook"
          categoryOptions={COLLECTION_CATEGORIES}
          statusFilter
          fetchRows={fetchPlaybooks}
          onNew={writable && workspace.usage.playbooks < workspace.limits.playbooks ? () => setNewCollection('playbook') : undefined}
          newLabel="New Playbook"
          rowActions={collectionRowActions('playbook')}
          onRowDoubleClick={(row) => setParent({ ...row, kind: 'playbook' })}
        />
      )}

      {view === 'gamePlans' && (
        <DataGrid
          key="gamePlans"
          reloadToken={gamePlansReloadToken}
          busy={statusSaving}
          title="Game Plans"
          columns={timezoneColumns(GAME_PLAN_GRID_COLUMNS, authUser.preferences?.timezone)}
          rowIcon={ClipboardList}
          rowType="Game Plan"
          categoryOptions={COLLECTION_CATEGORIES}
          statusFilter
          fetchRows={fetchGamePlans}
          onNew={writable && workspace.usage.gamePlans < workspace.limits.gamePlans ? () => setNewCollection('gamePlan') : undefined}
          newLabel="New Game Plan"
          rowActions={collectionRowActions('gamePlan')}
          onRowDoubleClick={(row) => setParent({ ...row, kind: 'gamePlan' })}
        />
      )}

        </>
      )}
      {accountDialog && <AccountViews
        key={accountDialog}
        view={accountDialog}
        user={authUser}
        workspace={workspace}
        api={api}
        onUserUpdated={onUserUpdated}
        onWorkspaceUpdated={onWorkspaceUpdated}
        onGuardChange={onGuardChange}
        onDismiss={() => requestLeave(() => setAccountDialog(null), `Close ${accountDialog}`)}
        onSaved={() => setAccountDialog(null)}
      />}
    </>
  )
}

function App() {
  const [signedOut, setSignedOut] = useState(isSignedOut)
  const [user, setUser] = useState(null)
  const [entry, setEntry] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mutations, setMutations] = useState(0)
  const [leave, setLeave] = useState(null)
  const [savingLeave, setSavingLeave] = useState(false)
  const [inviteToken, setInviteToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get('invite'))
  const guard = useRef(null)
  const generation = useRef(0)
  const pending = useRef(0)
  const entryRef = useRef(null)
  const selectedWorkspaceId = entry?.workspace.id

  function mutationState(delta) {
    pending.current += delta
    setMutations(pending.current)
  }

  async function loadWorkspace(id) {
    const current = ++generation.current
    setLoading(true)
    setError(null)
    try {
      const client = createApi(id, mutationState)
      const workspace = await client.workspace()
      if (current !== generation.current) return
      const next = { workspace, api: client }
      entryRef.current = next
      setEntry(next)
      setUser((identity) => ({ ...identity, workspaces: identity.workspaces.map((item) => item.id === id ? workspace : item) }))
      try { sessionStorage.setItem('blitzboard:workspace', id) } catch { return }
    } catch (failure) {
      if (current === generation.current) {
        setError(failure.message)
        if (failure.status === 403) await recoverWorkspace(id)
      }
    } finally {
      if (current === generation.current) setLoading(false)
    }
  }

  async function recoverWorkspace(unavailableId) {
    entryRef.current = null
    setEntry(null)
    guard.current = null
    setLeave(null)
    const identity = await api.me()
    setUser(identity)
    const fallback = identity.workspaces.find((item) => item.kind === 'individual' && item.id !== unavailableId)
    if (fallback) await loadWorkspace(fallback.id)
  }

  useEffect(() => {
    if (signedOut) return
    let active = true
    api.me().then((identity) => {
      if (!active) return
      setUser(identity)
      let stored
      try { stored = sessionStorage.getItem('blitzboard:workspace') } catch { stored = null }
      const workspace = identity.workspaces.find((item) => item.id === stored) || identity.workspaces[0]
      if (!workspace) throw new Error('No accessible workspace')
      return loadWorkspace(workspace.id)
    }).catch((failure) => { if (active) { setError(failure.message); setLoading(false) } })
    return () => { active = false; generation.current += 1 }
  }, [signedOut])

  function handleSignOut() {
    requestLeave(() => {
      signOut()
      generation.current += 1
      entryRef.current = null
      guard.current = null
      setEntry(null)
      setUser(null)
      setError(null)
      setLeave(null)
      setInviteToken(null)
      setLoading(false)
      setSignedOut(true)
      history.replaceState(null, '', location.pathname + location.search)
    }, 'Sign Out')
  }

  function handleSignIn() {
    signIn()
    setError(null)
    setLoading(true)
    setSignedOut(false)
  }

  function requestLeave(action, title) {
    if (pending.current || savingLeave || loading) return
    if (guard.current?.dirty) setLeave({ action, title, canSave: Boolean(guard.current.save) && guard.current.canSave !== false })
    else action()
  }

  function updateWorkspace(workspace) {
    if (entryRef.current?.workspace.id !== workspace.id) return
    const next = { ...entryRef.current, workspace }
    entryRef.current = next
    setEntry(next)
    setUser((identity) => ({ ...identity, workspaces: identity.workspaces.map((item) => item.id === workspace.id ? workspace : item) }))
  }

  const refreshWorkspace = useEffectEvent(async () => {
    const selected = entryRef.current
    if (!selected || pending.current || loading) return
    try {
      const workspace = await selected.api.workspace()
      if (entryRef.current?.api === selected.api) updateWorkspace(workspace)
    } catch (failure) {
      if (entryRef.current?.api === selected.api) {
        setError(failure.message)
        if (failure.status === 403) {
          try { await recoverWorkspace(selected.workspace.id) } catch (recoveryFailure) { setError(recoveryFailure.message) }
        }
      }
    }
  })

  useEffect(() => {
    if (!selectedWorkspaceId || mutations) return
    const initial = setTimeout(refreshWorkspace, 0)
    const timer = setInterval(refreshWorkspace, 60000)
    return () => { clearTimeout(initial); clearInterval(timer) }
  }, [selectedWorkspaceId, mutations])

  useEffect(() => {
    function beforeUnload(event) {
      if (guard.current?.dirty) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [])

  async function saveAndLeave() {
    setSavingLeave(true)
    try {
      const saved = await guard.current?.save()
      if (saved !== false) { setLeave(null); leave.action() }
    } finally {
      setSavingLeave(false)
    }
  }

  async function acceptInvite() {
    setSavingLeave(true)
    setError(null)
    try {
      const workspace = await api.acceptInvitation(inviteToken)
      setUser(await api.me())
      setInviteToken(null)
      history.replaceState(null, '', location.pathname + location.search)
      await loadWorkspace(workspace.id)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setSavingLeave(false)
    }
  }

  return <>
    {signedOut ? <><AppBar user={null} /><main className="auth-state"><h1>Signed out</h1>{isDevelopmentAuth && <button type="button" className="dialog-create" onClick={handleSignIn}>Sign In</button>}</main></> : inviteToken && user ? <><AppBar user={null} /><main className="account-view"><div className="account-view-heading"><Users size={24} /><h1>Team Invitation</h1></div>
      <div className="account-section"><p>{user.email || user.name}</p><div className="account-form-actions"><button type="button" className="dialog-cancel" disabled={savingLeave} onClick={() => { setInviteToken(null); history.replaceState(null, '', location.pathname + location.search) }}>Cancel</button><button type="button" className="dialog-create" disabled={savingLeave} onClick={acceptInvite}>{savingLeave ? 'Accepting...' : 'Accept Invitation'}</button></div></div>
    </main></> : entry && user ? <WorkspaceApp key={entry.workspace.id} authUser={user} workspace={entry.workspace} api={entry.api}
      onWorkspaceChange={(id) => { if (id !== entry.workspace.id) requestLeave(() => loadWorkspace(id), 'Switch subscription') }}
      onUserUpdated={setUser} onWorkspaceUpdated={updateWorkspace} onGuardChange={(value) => { guard.current = value }}
      onSignOut={handleSignOut}
      requestLeave={requestLeave} busy={loading || mutations > 0 || savingLeave} switchingSubscription={loading} />
      : <><AppBar user={null} /><main className="auth-state"><h1>{error ? 'Unable to sign in' : 'Signing in...'}</h1></main></>}
    {error && <p className="account-error" role="alert">{error}</p>}
    {leave && <div className="dialog-overlay leave-confirmation-overlay"><section className="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="leave-title">
      <h2 id="leave-title"><Save size={22} aria-hidden="true" />{leave.title}</h2><p>Save your changes before leaving?</p>
      <div className="dialog-actions">
        <button type="button" className="dialog-cancel" disabled={savingLeave} autoFocus onClick={() => setLeave(null)}>Cancel</button>
        <button type="button" className="dialog-cancel" disabled={savingLeave} onClick={() => { setLeave(null); leave.action() }}>Discard</button>
        <button type="button" className="dialog-create" disabled={savingLeave || !leave.canSave} onClick={saveAndLeave}>{savingLeave ? 'Saving...' : 'Save'}</button>
      </div>
    </section></div>}
  </>
}

export default App
