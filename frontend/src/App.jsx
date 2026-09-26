import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { DataGrid } from './components/DataGrid'
import { NewPlayDialog } from './components/NewPlayDialog'
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
  { key: 'playCount', header: 'Plays' },
  { key: 'createdAt', header: 'Created', render: formatDate },
  { key: 'updatedAt', header: 'Date Modified', render: formatDate },
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
      <div className="app-bar-brand">Coaches Playboard</div>
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

function App() {
  const [view, setView] = useState('home')
  const [parent, setParent] = useState(null)
  const [designer, setDesigner] = useState(null)
  const [newDialog, setNewDialog] = useState(null)
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

  async function handleNewPlaybook() {
    const name = window.prompt('Playbook name')
    if (!name) return
    await api.createPlaybook({ name })
    setPlaybooksReloadToken((t) => t + 1)
  }

  async function handleNewGamePlan() {
    const name = window.prompt('Game plan name')
    if (!name) return
    await api.createGamePlan({ name })
    setGamePlansReloadToken((t) => t + 1)
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
        onCancel={() => setNewDialog(null)}
        onCreate={handleCreatePlay}
      />

      {designer ? (
        <PlayDesigner
          key={`${designer.kind}-${designer.id}`}
          record={designer}
          onClose={() => setDesigner(null)}
        />
      ) : parent?.kind === 'playbook' ? (
        <DataGrid
          key={`plays-${parent.id}-${playsReloadToken}`}
          title="Plays"
          columns={PLAY_GRID_COLUMNS}
          fetchRows={() => api.listPlays(parent.id).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'play', parentId: parent.id })}
          newLabel="New Play"
          onBack={() => setParent(null)}
          onRowDoubleClick={(row) => openDesignerForRow('play', parent.id, row)}
          rowActions={playRowActions('play', parent.id)}
        />
      ) : parent?.kind === 'gamePlan' ? (
        <DataGrid
          key={`scoutPlays-${parent.id}-${scoutPlaysReloadToken}`}
          title="Scout Plays"
          columns={PLAY_GRID_COLUMNS}
          fetchRows={() => api.listScoutPlays(parent.id).then((result) => result.items)}
          onNew={() => setNewDialog({ target: 'scoutPlay', parentId: parent.id })}
          newLabel="New Scout Play"
          onBack={() => setParent(null)}
          onRowDoubleClick={(row) => openDesignerForRow('scoutPlay', parent.id, row)}
          rowActions={playRowActions('scoutPlay', parent.id)}
        />
      ) : (
        <>
      {view === 'playbooks' && (
        <DataGrid
          key={`playbooks-${playbooksReloadToken}`}
          title="Playbooks"
          columns={GRID_COLUMNS}
          fetchRows={() => api.listPlaybooks().then((result) => result.items)}
          onNew={handleNewPlaybook}
          newLabel="New Playbook"
          onRowDoubleClick={(row) => setParent({ kind: 'playbook', id: row.id, name: row.name })}
        />
      )}

      {view === 'gamePlans' && (
        <DataGrid
          key={`gamePlans-${gamePlansReloadToken}`}
          title="Game Plans"
          columns={GRID_COLUMNS}
          fetchRows={() => api.listGamePlans().then((result) => result.items)}
          onNew={handleNewGamePlan}
          newLabel="New Game Plan"
          onRowDoubleClick={(row) => setParent({ kind: 'gamePlan', id: row.id, name: row.name })}
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
