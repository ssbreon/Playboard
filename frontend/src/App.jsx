import { useEffect, useRef, useState } from 'react'
import { BookOpen, ClipboardList, Copy, FolderOpen, Printer, Route, ScanSearch, Settings, Trash2, UserRound } from 'lucide-react'
import { api } from './api'
import { renderCategoryBadge } from './components/CategoryBadge'
import { DataGrid } from './components/DataGrid'
import { COLLECTION_CATEGORIES, NewCollectionDialog } from './components/NewCollectionDialog'
import { NewPlayDialog, PLAY_CATEGORIES } from './components/NewPlayDialog'
import { PlayDesigner } from './components/PlayDesigner'
import { PrintPreviewDialog } from './components/PrintPreviewDialog'
import { buildMarkersFromTemplate, PLAY_TEMPLATES } from './utils/formations'
import { formatDate } from './utils/formatDate'
import { themeLabel } from './utils/themes'
import { defaultPlayPerspective } from './utils/playGeometry'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

const GRID_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', render: renderCategoryBadge },
  { key: 'playCount', header: 'Plays' },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
]

const PLAYBOOK_GRID_COLUMNS = [GRID_COLUMNS[0], { key: 'year', header: 'Year' }, ...GRID_COLUMNS.slice(1)]
function formatGameDate(value) {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString() : '—'
}

const GAME_PLAN_GRID_COLUMNS = [
  GRID_COLUMNS[0],
  { key: 'year', header: 'Year' },
  { key: 'opponent', header: 'Opponent' },
  { key: 'gameDate', header: 'Game Date', render: formatGameDate },
  ...GRID_COLUMNS.slice(1),
]

const PLAY_GRID_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category', render: renderCategoryBadge },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
  { key: 'theme', header: 'Theme', render: (value) => themeLabel(value) },
]

function AppBar({ activeView, onNavigate, user }) {
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
    onNavigate(view)
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
      {user && <div className="app-bar-account" ref={menuRef}>
        <button
          type="button"
          className="account-button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
          aria-label={`Account menu for ${user.name}`}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <svg className="account-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0 2c-4.42 0-8 2.24-8 5v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1c0-2.76-3.58-5-8-5Z"
            />
          </svg>
        </button>
        {menuOpen && (
          <div className="account-menu" role="menu">
            <div className="account-menu-identity">
              <strong>{user.name}</strong>
              <span>{user.roles.join(', ')}</span>
            </div>
            <a href="#profile" role="menuitem"><UserRound className="menu-item-icon" aria-hidden="true" />Profile</a>
            <a href="#settings" role="menuitem"><Settings className="menu-item-icon" aria-hidden="true" />Settings</a>
          </div>
        )}
      </div>}
    </header>
  )
}

function PlaysDrillthroughView({ parentRecord, parentLabel, onParentUpdated, updateParent, title, rowIcon, rowType, fetchRows, onBack, onNew, newLabel, onOpenPlay, onPrintAll, rowActions }) {
  const [name, setName] = useState(parentRecord.name)
  const [savedName, setSavedName] = useState(parentRecord.name)
  const [category, setCategory] = useState(parentRecord.category || 'Defense')
  const [savedCategory, setSavedCategory] = useState(parentRecord.category || 'Defense')
  const [year, setYear] = useState(String(parentRecord.year || new Date().getFullYear()))
  const [savedYear, setSavedYear] = useState(String(parentRecord.year || new Date().getFullYear()))
  const [opponent, setOpponent] = useState(parentRecord.opponent || '')
  const [savedOpponent, setSavedOpponent] = useState(parentRecord.opponent || '')
  const [gameDate, setGameDate] = useState(parentRecord.gameDate || '')
  const [savedGameDate, setSavedGameDate] = useState(parentRecord.gameDate || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftCategory, setDraftCategory] = useState(category)
  const [draftYear, setDraftYear] = useState(year)
  const [draftOpponent, setDraftOpponent] = useState(opponent)
  const [draftGameDate, setDraftGameDate] = useState(gameDate)
  const trimmedName = name.trim()
  const metadataIsDirty = category !== savedCategory || year !== savedYear || (parentRecord.kind === 'gamePlan' && (opponent !== savedOpponent || gameDate !== savedGameDate))
  const isDirty = name !== savedName || metadataIsDirty

  async function handleSave() {
    if (!trimmedName || !isDirty) return
    setSaving(true)
    setError(null)
    try {
      const payload = { name: trimmedName }
      if (metadataIsDirty) {
        payload.category = category
        payload.year = Number(year)
        if (parentRecord.kind === 'gamePlan') {
          payload.opponent = opponent
          payload.gameDate = gameDate
        }
      }
      const updated = await updateParent(parentRecord.id, payload)
      setName(updated.name)
      setSavedName(updated.name)
      setSavedCategory(category)
      setSavedYear(String(updated.year ?? year))
      setYear(String(updated.year ?? year))
      if (parentRecord.kind === 'gamePlan') {
        setSavedOpponent(opponent)
        setOpponent(opponent)
        const updatedGameDate = updated.gameDate ?? gameDate
        setSavedGameDate(updatedGameDate)
        setGameDate(updatedGameDate)
      }
      onParentUpdated(updated)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setName(savedName)
    setCategory(savedCategory)
    setYear(savedYear)
    setOpponent(savedOpponent)
    setGameDate(savedGameDate)
    setError(null)
  }

  function openSettings() {
    setDraftCategory(category)
    setDraftYear(year)
    setDraftOpponent(opponent)
    setDraftGameDate(gameDate)
    setSettingsOpen(true)
  }

  function handleSettingsSave(event) {
    event.preventDefault()
    setCategory(draftCategory)
    setYear(draftYear)
    if (parentRecord.kind === 'gamePlan') {
      setOpponent(draftOpponent.trim())
      setGameDate(draftGameDate)
    }
    setError(null)
    setSettingsOpen(false)
  }

  return (
    <main className="plays-drillthrough-view">
      <section className="collection-details" aria-label={`${parentLabel} details`}>
        <div className="play-designer-header">
          <button type="button" className="play-designer-back" onClick={onBack} aria-label={`Back to ${parentLabel}s`}>
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M15 4 7 12l8 8 1.4-1.4L9.8 12l6.6-6.6z" />
            </svg>
          </button>
          <input
            className="play-designer-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-label={`${parentLabel} name`}
          />
          <button type="button" className="play-designer-back" onClick={openSettings} aria-label={`${parentLabel} settings`}>
            <Settings size={18} aria-hidden="true" />
          </button>
          <button type="button" className="play-designer-cancel" onClick={handleCancel} disabled={saving || !isDirty}>
            Cancel
          </button>
          <button type="button" className="play-designer-save" onClick={handleSave} disabled={saving || !isDirty || !trimmedName}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
        {error && <p className="data-grid-status data-grid-error">Unable to save: {error}</p>}
      </section>
      {settingsOpen && (
        <div className="dialog-overlay" onClick={() => setSettingsOpen(false)}>
          <form className="dialog-panel" onClick={(event) => event.stopPropagation()} onSubmit={handleSettingsSave}>
            <h2>{parentLabel} Settings</h2>
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
            <div className="dialog-actions">
              <button type="button" className="dialog-cancel" onClick={() => setSettingsOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="dialog-create">
                OK
              </button>
            </div>
          </form>
        </div>
      )}
      <DataGrid
        title={title}
        columns={PLAY_GRID_COLUMNS}
        rowIcon={rowIcon}
        rowType={rowType}
        categoryOptions={PLAY_CATEGORIES}
        fetchRows={fetchRows}
        onNew={onNew}
        newLabel={newLabel}
        menuItems={[{ label: `Print ${parentLabel}...`, icon: Printer, onClick: onPrintAll }]}
        onRowDoubleClick={onOpenPlay}
        rowActions={rowActions}
      />
    </main>
  )
}

function App() {
  const [view, setView] = useState('home')
  const [parent, setParent] = useState(null)
  const [designer, setDesigner] = useState(null)
  const [newDialog, setNewDialog] = useState(null)
  const [newCollection, setNewCollection] = useState(null)
  const [printPlay, setPrintPlay] = useState(null)
  const [printCollection, setPrintCollection] = useState(null)
  const [count, setCount] = useState(0)
  const [apiStatus, setApiStatus] = useState('Connecting to API...')
  const [authUser, setAuthUser] = useState(null)
  const [authError, setAuthError] = useState(null)
  const [playbookCount, setPlaybookCount] = useState(0)
  const [playbooksReloadToken, setPlaybooksReloadToken] = useState(0)
  const [gamePlansReloadToken, setGamePlansReloadToken] = useState(0)
  const [playsReloadToken, setPlaysReloadToken] = useState(0)
  const [scoutPlaysReloadToken, setScoutPlaysReloadToken] = useState(0)

  useEffect(() => {
    Promise.all([api.health(), api.me(), api.listPlaybooks()])
      .then(([health, user, playbooks]) => {
        setAuthUser(user)
        setApiStatus(`${health.service}: ${health.status}`)
        setPlaybookCount(playbooks.items.length)
      })
      .catch((error) => {
        setAuthError(error.message)
        setApiStatus(`API unavailable: ${error.message}`)
      })
  }, [])

  async function handleCreateCollection(payload) {
    if (newCollection === 'playbook') {
      await api.createPlaybook(payload)
      setPlaybooksReloadToken((t) => t + 1)
    } else {
      await api.createGamePlan(payload)
      setGamePlansReloadToken((t) => t + 1)
    }
    setNewCollection(null)
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

  function collectionRowActions(kind) {
    return (row) => [
      { key: 'open', label: 'Open', icon: FolderOpen, onClick: (item) => setParent({ ...item, kind }) },
      { key: 'copy', label: 'Copy', icon: Copy, onClick: (item) => handleCopyCollection(kind, item) },
      { key: 'print', label: 'Print...', icon: Printer, onClick: (item) => handlePrintCollection(kind, item) },
      { key: 'delete', label: 'Delete', icon: Trash2, destructive: true, onClick: (item) => handleDeleteCollection(kind, item) },
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
      { key: 'copy', label: 'Copy', icon: Copy, onClick: (r) => handleCopyPlay(kind, parentId, r) },
      { key: 'print', label: 'Print...', icon: Printer, onClick: (r) => setPrintPlay({ ...r, perspective: r.perspective || defaultPlayPerspective(parent?.category) }) },
      { key: 'delete', label: 'Delete', icon: Trash2, destructive: true, onClick: (r) => handleDeletePlay(kind, parentId, r) },
    ]
  }

  if (!authUser) {
    return (
      <>
        <AppBar activeView={view} onNavigate={() => {}} user={null} />
        <main className="auth-state" aria-live="polite">
          <h1>{authError ? 'Unable to sign in' : 'Signing in...'}</h1>
          {authError && <p>{authError}</p>}
        </main>
      </>
    )
  }

  return (
    <>
      <AppBar
        activeView={view}
        user={authUser}
        onNavigate={(nextView) => {
          setDesigner(null)
          setParent(null)
          setView(nextView)
        }}
      />

      <NewPlayDialog
        open={newDialog !== null}
        titleLabel={newDialog?.target === 'scoutPlay' ? 'New Scout Play' : 'New Play'}
        titleIcon={newDialog?.target === 'scoutPlay' ? ScanSearch : Route}
        onCancel={() => setNewDialog(null)}
        onCreate={handleCreatePlay}
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
          onClose={() => setDesigner(null)}
        />
      ) : parent?.kind === 'playbook' ? (
        <PlaysDrillthroughView
          key={`plays-${parent.id}-${playsReloadToken}`}
          parentRecord={parent}
          parentLabel="Playbook"
          onParentUpdated={(updated) => setParent((current) => ({ ...current, ...updated, kind: 'playbook' }))}
          updateParent={api.updatePlaybook}
          title="Plays"
          rowIcon={Route}
          rowType="Play"
          fetchRows={({ namePrefix }) => api.listPlays(parent.id, undefined, namePrefix).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'play', parentId: parent.id })}
          newLabel="New Play"
          onBack={() => setParent(null)}
          onOpenPlay={(row) => openDesignerForRow('play', parent.id, row)}
          onPrintAll={() => handlePrintCollection('playbook', parent)}
          rowActions={playRowActions('play', parent.id)}
        />
      ) : parent?.kind === 'gamePlan' ? (
        <PlaysDrillthroughView
          key={`scoutPlays-${parent.id}-${scoutPlaysReloadToken}`}
          parentRecord={parent}
          parentLabel="Game Plan"
          onParentUpdated={(updated) => setParent((current) => ({ ...current, ...updated, kind: 'gamePlan' }))}
          updateParent={api.updateGamePlan}
          title="Scout Plays"
          rowIcon={ScanSearch}
          rowType="Scout Play"
          fetchRows={({ namePrefix }) => api.listScoutPlays(parent.id, undefined, namePrefix).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'scoutPlay', parentId: parent.id })}
          newLabel="New Scout Play"
          onBack={() => setParent(null)}
          onOpenPlay={(row) => openDesignerForRow('scoutPlay', parent.id, row)}
          onPrintAll={() => handlePrintCollection('gamePlan', parent)}
          rowActions={playRowActions('scoutPlay', parent.id)}
        />
      ) : (
        <>
      {view === 'playbooks' && (
        <DataGrid
          key={`playbooks-${playbooksReloadToken}`}
          title="Playbooks"
          columns={PLAYBOOK_GRID_COLUMNS}
          rowIcon={BookOpen}
          rowType="Playbook"
          categoryOptions={COLLECTION_CATEGORIES}
          fetchRows={({ namePrefix }) => api.listPlaybooks(undefined, namePrefix).then((result) => result.items)}
          onNew={() => setNewCollection('playbook')}
          newLabel="New Playbook"
          rowActions={collectionRowActions('playbook')}
          onRowDoubleClick={(row) => setParent({ ...row, kind: 'playbook' })}
        />
      )}

      {view === 'gamePlans' && (
        <DataGrid
          key={`gamePlans-${gamePlansReloadToken}`}
          title="Game Plans"
          columns={GAME_PLAN_GRID_COLUMNS}
          rowIcon={ClipboardList}
          rowType="Game Plan"
          categoryOptions={COLLECTION_CATEGORIES}
          fetchRows={({ namePrefix }) => api.listGamePlans(undefined, namePrefix).then((result) => result.items)}
          onNew={() => setNewCollection('gamePlan')}
          newLabel="New Game Plan"
          rowActions={collectionRowActions('gamePlan')}
          onRowDoubleClick={(row) => setParent({ ...row, kind: 'gamePlan' })}
        />
      )}

      {view === 'home' && (
        <>
      <section id="center">
        <div className="hero">
          <img src="/blitzboardstudio.png" className="hero-logo" alt="BLITZBOARD Studio logo" />
        </div>
        <div>
          <h1>Get started</h1>
          <p>{apiStatus} · {playbookCount} playbooks</p>
          <p>
            Edit <code>src/App.jsx</code> and save to test <code>HMR</code>
          </p>
        </div>
        <button
          type="button"
          className="counter"
          onClick={() => setCount((count) => count + 1)}
        >
          Count is {count}
        </button>
      </section>

      <div className="ticks"></div>

      <div className="ticks"></div>
      <section id="spacer"></section>
        </>
      )}
        </>
      )}
    </>
  )
}

export default App
