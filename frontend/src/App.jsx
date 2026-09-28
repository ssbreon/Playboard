import { useEffect, useRef, useState } from 'react'
import { BookOpen, ClipboardList, Route, ScanSearch, Settings } from 'lucide-react'
import { api } from './api'
import { DataGrid } from './components/DataGrid'
import { COLLECTION_CATEGORIES, NewCollectionDialog } from './components/NewCollectionDialog'
import { NewPlayDialog, PLAY_CATEGORIES } from './components/NewPlayDialog'
import { PlayDesigner } from './components/PlayDesigner'
import { buildMarkersFromTemplate, PLAY_TEMPLATES } from './utils/formations'
import { formatDate } from './utils/formatDate'
import { themeLabel } from './utils/themes'
import heroImg from './assets/hero.png'
import reactLogo from './assets/react.svg'
import viteLogo from './assets/vite.svg'
import './App.css'

const GRID_COLUMNS = [
  { key: 'name', header: 'Name' },
  { key: 'category', header: 'Category' },
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
  { key: 'category', header: 'Category' },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
  { key: 'theme', header: 'Theme', render: (value) => themeLabel(value) },
]

function AppBar({ activeView, onNavigate }) {
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
      <div className="app-bar-brand">Playbook Forge</div>
      <nav className="app-bar-nav">
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
      </nav>
      <div className="app-bar-account" ref={menuRef}>
        <button
          type="button"
          className="account-button"
          aria-haspopup="true"
          aria-expanded={menuOpen}
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
            <a href="#profile" role="menuitem">Profile</a>
            <a href="#settings" role="menuitem">Settings</a>
            <a href="#sign-out" role="menuitem">Sign out</a>
          </div>
        )}
      </div>
    </header>
  )
}

function PlaysDrillthroughView({ parentRecord, parentLabel, onParentUpdated, updateParent, title, rowIcon, rowType, fetchRows, onBack, onNew, newLabel, onOpenPlay, rowActions }) {
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
  const [count, setCount] = useState(0)
  const [apiStatus, setApiStatus] = useState('Connecting to API...')
  const [playbookCount, setPlaybookCount] = useState(0)
  const [playbooksReloadToken, setPlaybooksReloadToken] = useState(0)
  const [gamePlansReloadToken, setGamePlansReloadToken] = useState(0)
  const [playsReloadToken, setPlaysReloadToken] = useState(0)
  const [scoutPlaysReloadToken, setScoutPlaysReloadToken] = useState(0)

  useEffect(() => {
    Promise.all([api.health(), api.listPlaybooks()])
      .then(([health, playbooks]) => {
        setApiStatus(`${health.service}: ${health.status}`)
        setPlaybookCount(playbooks.items.length)
      })
      .catch((error) => setApiStatus(`API unavailable: ${error.message}`))
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

  async function handleDeleteCollection(kind, row) {
    if (!window.confirm(`Delete "${row.name}"?`)) return
    if (kind === 'playbook') {
      await api.deletePlaybook(row.id)
      setPlaybooksReloadToken((t) => t + 1)
    } else {
      await api.deleteGamePlan(row.id)
      setGamePlansReloadToken((t) => t + 1)
    }
  }

  function collectionRowActions(kind) {
    return (row) => [
      { key: 'open', label: 'Open', onClick: (item) => setParent({ ...item, kind }) },
      { key: 'copy', label: 'Copy', onClick: (item) => handleCopyCollection(kind, item) },
      { key: 'delete', label: 'Delete', destructive: true, onClick: (item) => handleDeleteCollection(kind, item) },
    ]
  }

  async function handleCreatePlay(name, templateId, theme, category, fieldDecoration, fieldOrientation) {
    const { target, parentId } = newDialog
    setNewDialog(null)
    const record =
      target === 'play'
        ? await api.createPlay(parentId, { name, template: templateId, theme, category, fieldDecoration, fieldOrientation })
        : await api.createScoutPlay(parentId, { name, template: templateId, theme, category, fieldDecoration, fieldOrientation })
    const template = PLAY_TEMPLATES.find((t) => t.id === templateId) || PLAY_TEMPLATES[0]
    setDesigner({
      kind: target,
      parentId,
      id: record.id,
      name: record.name,
      initialMarkers: buildMarkersFromTemplate(template),
      initialTextAnnotations: record.textAnnotations,
      initialTheme: record.theme,
      template: record.template,
      category: record.category,
      fieldDecoration: record.fieldDecoration,
      fieldOrientation: record.fieldOrientation,
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
      initialTheme: row.theme,
      template: row.template,
      category: row.category,
      fieldDecoration: row.fieldDecoration,
      fieldOrientation: row.fieldOrientation,
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
      markers: row.markers,
      drawings: row.drawings,
      textAnnotations: row.textAnnotations,
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
      { key: 'open', label: 'Open', onClick: (r) => openDesignerForRow(kind, parentId, r) },
      { key: 'copy', label: 'Copy', onClick: (r) => handleCopyPlay(kind, parentId, r) },
      { key: 'delete', label: 'Delete', destructive: true, onClick: (r) => handleDeletePlay(kind, parentId, r) },
    ]
  }

  return (
    <>
      <AppBar
        activeView={view}
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
          fetchRows={({ category, namePrefix }) => api.listPlays(parent.id, category, namePrefix).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'play', parentId: parent.id })}
          newLabel="New Play"
          onBack={() => setParent(null)}
          onOpenPlay={(row) => openDesignerForRow('play', parent.id, row)}
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
          fetchRows={({ category, namePrefix }) => api.listScoutPlays(parent.id, category, namePrefix).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'scoutPlay', parentId: parent.id })}
          newLabel="New Scout Play"
          onBack={() => setParent(null)}
          onOpenPlay={(row) => openDesignerForRow('scoutPlay', parent.id, row)}
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
          fetchRows={({ category, namePrefix }) => api.listPlaybooks(category, namePrefix).then((result) => result.items)}
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
          fetchRows={({ category, namePrefix }) => api.listGamePlans(category, namePrefix).then((result) => result.items)}
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
          <img src={heroImg} className="base" width="170" height="179" alt="" />
          <img src={reactLogo} className="framework" alt="React logo" />
          <img src={viteLogo} className="vite" alt="Vite logo" />
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

      <section id="next-steps">
        <div id="docs">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#documentation-icon"></use>
          </svg>
          <h2>Documentation</h2>
          <p>Your questions, answered</p>
          <ul>
            <li>
              <a href="https://vite.dev/" target="_blank">
                <img className="logo" src={viteLogo} alt="" />
                Explore Vite
              </a>
            </li>
            <li>
              <a href="https://react.dev/" target="_blank">
                <img className="button-icon" src={reactLogo} alt="" />
                Learn more
              </a>
            </li>
          </ul>
        </div>
        <div id="social">
          <svg className="icon" role="presentation" aria-hidden="true">
            <use href="/icons.svg#social-icon"></use>
          </svg>
          <h2>Connect with us</h2>
          <p>Join the Vite community</p>
          <ul>
            <li>
              <a href="https://github.com/vitejs/vite" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#github-icon"></use>
                </svg>
                GitHub
              </a>
            </li>
            <li>
              <a href="https://chat.vite.dev/" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#discord-icon"></use>
                </svg>
                Discord
              </a>
            </li>
            <li>
              <a href="https://x.com/vite_js" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#x-icon"></use>
                </svg>
                X.com
              </a>
            </li>
            <li>
              <a href="https://bsky.app/profile/vite.dev" target="_blank">
                <svg
                  className="button-icon"
                  role="presentation"
                  aria-hidden="true"
                >
                  <use href="/icons.svg#bluesky-icon"></use>
                </svg>
                Bluesky
              </a>
            </li>
          </ul>
        </div>
      </section>

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
