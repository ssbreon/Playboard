import { useRef, useState } from 'react'
import { api } from '../api'

const DRAWING_TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'block', label: 'Block', color: '#f59e0b', dash: null, arrow: false, endCap: 'tbar' },
  { id: 'route', label: 'Route', color: '#1d4ed8', dash: null, arrow: true },
  { id: 'blitz', label: 'Blitz', color: '#b91c1c', dash: null, arrow: true },
  { id: 'coverage', label: 'Coverage', color: '#7c3aed', dash: '2 4', arrow: true },
]

const TOOL_ICONS = {
  select: <path fill="currentColor" d="M6 3v18l4.6-4.6L13.2 21l2.6-1.4-2.6-4.6L18 13.4z" />,
  block: <path stroke="currentColor" strokeWidth="2" fill="none" d="M4 20 20 4M4 12h16M12 4v16" />,
  route: <path stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" d="M4 20 12 8 20 20M12 8V3" />,
  blitz: <path stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="4 3" strokeLinecap="round" d="M4 20 20 4" />,
  coverage: <path stroke="currentColor" strokeWidth="2" fill="none" strokeDasharray="1 4" strokeLinecap="round" d="M4 12h16" />,
}

const EMPTY_DRAWINGS = { block: [], route: [], blitz: [], coverage: [] }

// Distinguishes tool types by dash pattern instead of color when printing in black & white.
const PRINTER_FRIENDLY_DASH = { block: null, route: null, blitz: '6 4', coverage: '1 4' }

function normalizeDrawings(source) {
  return { ...EMPTY_DRAWINGS, ...(source || {}) }
}

export function PlayDesigner({ record, onClose }) {
  const theme = record.initialTheme === 'printerFriendly' ? 'printerFriendly' : 'color'
  const original = useRef({
    name: record.name,
    markers: record.initialMarkers || [],
    drawings: normalizeDrawings(record.initialDrawings),
  })
  const [name, setName] = useState(record.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [markers, setMarkers] = useState(record.initialMarkers || [])
  const [drawings, setDrawings] = useState(normalizeDrawings(record.initialDrawings))
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDrawing, setSelectedDrawing] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [activeChain, setActiveChain] = useState(null)
  const [cursorPos, setCursorPos] = useState(null)
  const [savedName, setSavedName] = useState(record.name)
  const [savedMarkers, setSavedMarkers] = useState(record.initialMarkers || [])
  const [savedDrawings, setSavedDrawings] = useState(normalizeDrawings(record.initialDrawings))

  const isDirty =
    name !== savedName ||
    JSON.stringify(markers) !== JSON.stringify(savedMarkers) ||
    JSON.stringify(drawings) !== JSON.stringify(savedDrawings)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (record.kind === 'play') {
        await api.updatePlay(record.parentId, record.id, { name, markers, drawings })
      } else {
        await api.updateScoutPlay(record.parentId, record.id, { name, markers, drawings })
      }
      setSavedName(name)
      setSavedMarkers(markers)
      setSavedDrawings(drawings)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleUndo() {
    setName(original.current.name)
    setMarkers(original.current.markers)
    setDrawings(original.current.drawings)
    setSelectedId(null)
    setSelectedDrawing(null)
    setActiveChain(null)
    setCursorPos(null)
    setError(null)
  }

  function positionFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function handleMarkerPointerDown(event, id) {
    if (activeTool !== 'select') return
    event.stopPropagation()
    setSelectedId(id)
    setSelectedDrawing(null)
    setDragId(id)
  }

  function handleMarkerClick(event, id) {
    event.stopPropagation()
    if (activeTool === 'select' || activeChain) return
    setActiveChain({ type: activeTool, anchorId: id, points: [] })
    setSelectedDrawing(null)
    setCursorPos(null)
  }

  function handleDrawingClick(event, type, id) {
    if (activeTool !== 'select') return
    event.stopPropagation()
    setSelectedDrawing({ type, id })
    setSelectedId(null)
  }

  function handleFieldClick(event) {
    if (activeTool === 'select' || !activeChain) return
    const anchor = markers.find((marker) => marker.id === activeChain.anchorId)
    if (!anchor) {
      setActiveChain(null)
      return
    }
    const point = positionFromEvent(event)
    const offset = { dx: point.x - anchor.x, dy: point.y - anchor.y }
    setActiveChain((current) => current && { ...current, points: [...current.points, offset] })
  }

  function handleFieldDoubleClick(event) {
    event.preventDefault()
    if (activeTool === 'select' || !activeChain) return
    const points = activeChain.points.length > 0 ? activeChain.points.slice(0, -1) : activeChain.points
    if (points.length > 0) {
      const newDrawing = { id: crypto.randomUUID(), anchorId: activeChain.anchorId, points }
      setDrawings((current) => ({ ...current, [activeChain.type]: [...current[activeChain.type], newDrawing] }))
    }
    setActiveChain(null)
    setCursorPos(null)
  }

  function handleFieldPointerMove(event) {
    if (dragId) {
      const { x, y } = positionFromEvent(event)
      setMarkers((current) => current.map((marker) => (marker.id === dragId ? { ...marker, x, y } : marker)))
      return
    }
    if (activeChain) {
      setCursorPos(positionFromEvent(event))
    }
  }

  function handleFieldPointerUp() {
    setDragId(null)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && activeChain) {
      setActiveChain(null)
      setCursorPos(null)
      return
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (selectedId) {
      setMarkers((current) => current.filter((marker) => marker.id !== selectedId))
      setDrawings((current) => {
        const next = {}
        for (const type of Object.keys(current)) {
          next[type] = current[type].filter((drawing) => drawing.anchorId !== selectedId)
        }
        return next
      })
      setSelectedId(null)
    } else if (selectedDrawing) {
      setDrawings((current) => ({
        ...current,
        [selectedDrawing.type]: current[selectedDrawing.type].filter((drawing) => drawing.id !== selectedDrawing.id),
      }))
      setSelectedDrawing(null)
    }
  }

  function pathData(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }

  function markerEndFor(tool) {
    if (tool.arrow) return `url(#arrow-${tool.id})`
    if (tool.endCap === 'tbar') return `url(#tbar-${tool.id})`
    return undefined
  }

  function toolColor(tool) {
    return theme === 'printerFriendly' ? '#000' : tool.color
  }

  function toolDash(tool) {
    return theme === 'printerFriendly' ? PRINTER_FRIENDLY_DASH[tool.id] : tool.dash
  }

  const allDrawings = Object.entries(drawings).flatMap(([type, list]) => list.map((drawing) => ({ ...drawing, type })))
  const chainAnchor = activeChain ? markers.find((marker) => marker.id === activeChain.anchorId) : null
  const isEmpty = markers.length === 0 && allDrawings.length === 0

  return (
    <section className="play-designer">
      <div className="play-designer-header">
        <button type="button" className="play-designer-back" onClick={onClose} aria-label="Back to list">
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path fill="currentColor" d="M15 4 7 12l8 8 1.4-1.4L9.8 12l6.6-6.6z" />
          </svg>
        </button>
        <input
          className="play-designer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-label="Play name"
        />
        <button type="button" className="play-designer-undo" onClick={handleUndo} disabled={saving || !isDirty}>
          Undo
        </button>
        <button type="button" className="play-designer-save" onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="data-grid-status data-grid-error">Unable to save: {error}</p>}
      <div className="play-designer-toolbar" role="toolbar" aria-label="Drawing tools">
        {DRAWING_TOOLS.map((tool) => (
          <button
            key={tool.id}
            type="button"
            className={`play-designer-tool${tool.id === activeTool ? ' active' : ''}`}
            style={tool.color ? { color: toolColor(tool) } : undefined}
            onClick={() => {
              setActiveTool(tool.id)
              setActiveChain(null)
              setCursorPos(null)
            }}
            aria-pressed={tool.id === activeTool}
            title={tool.label}
          >
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              {TOOL_ICONS[tool.id]}
            </svg>
            <span>{tool.label}</span>
          </button>
        ))}
      </div>
      <div
        className={`play-designer-field${activeTool !== 'select' ? ' drawing' : ''}${theme === 'printerFriendly' ? ' printer-friendly' : ''}`}
        onClick={handleFieldClick}
        onDoubleClick={handleFieldDoubleClick}
        onPointerMove={handleFieldPointerMove}
        onPointerUp={handleFieldPointerUp}
        onPointerLeave={handleFieldPointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Play field"
      >
        {isEmpty && (
          <p className="play-designer-hint">
            Drag players to reposition them. Pick a tool, click a player to anchor a line, click to add
            segments, and double-click to finish.
          </p>
        )}
        <svg className="play-designer-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {DRAWING_TOOLS.filter((tool) => tool.arrow).map((tool) => (
              <marker
                key={tool.id}
                id={`arrow-${tool.id}`}
                markerWidth="6"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M0,0 L6,3 L0,6 Z" fill={toolColor(tool)} />
              </marker>
            ))}
            {DRAWING_TOOLS.filter((tool) => tool.endCap === 'tbar').map((tool) => (
              <marker
                key={tool.id}
                id={`tbar-${tool.id}`}
                markerWidth="8"
                markerHeight="8"
                refX="4"
                refY="4"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <line x1="4" y1="1.5" x2="4" y2="6.5" stroke={toolColor(tool)} strokeWidth="2" />
              </marker>
            ))}
          </defs>
          {allDrawings.map((drawing) => {
            const anchor = markers.find((marker) => marker.id === drawing.anchorId)
            if (!anchor) return null
            const tool = DRAWING_TOOLS.find((t) => t.id === drawing.type)
            const points = [
              { x: anchor.x, y: anchor.y },
              ...drawing.points.map((p) => ({ x: anchor.x + p.dx, y: anchor.y + p.dy })),
            ]
            const isSelected = selectedDrawing?.type === drawing.type && selectedDrawing?.id === drawing.id
            return (
              <path
                key={drawing.id}
                className={`play-designer-route${isSelected ? ' selected' : ''}`}
                d={pathData(points)}
                stroke={toolColor(tool)}
                strokeDasharray={toolDash(tool) || undefined}
                markerEnd={markerEndFor(tool)}
                onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
              />
            )
          })}
          {activeChain && chainAnchor && (() => {
            const tool = DRAWING_TOOLS.find((t) => t.id === activeChain.type)
            const points = [
              { x: chainAnchor.x, y: chainAnchor.y },
              ...activeChain.points.map((p) => ({ x: chainAnchor.x + p.dx, y: chainAnchor.y + p.dy })),
            ]
            if (cursorPos) points.push(cursorPos)
            return (
              <path
                d={pathData(points)}
                stroke={toolColor(tool)}
                strokeDasharray={toolDash(tool) || undefined}
                className="play-designer-route preview"
              />
            )
          })()}
        </svg>
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={`play-designer-marker ${marker.team || 'offense'}${marker.id === selectedId ? ' selected' : ''}${activeTool !== 'select' ? ' anchorable' : ''}${theme === 'printerFriendly' ? ' printer-friendly' : ''}`}
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            onPointerDown={(event) => handleMarkerPointerDown(event, marker.id)}
            onClick={(event) => handleMarkerClick(event, marker.id)}
            aria-label="Player marker"
          >
            {marker.label}
          </button>
        ))}
      </div>
    </section>
  )
}
