import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { FIELD_DECORATIONS, FIELD_ORIENTATIONS, PLAY_CATEGORIES } from './NewPlayDialog'
import { PLAY_TEMPLATES, buildMarkersFromTemplate } from '../utils/formations'
import { PLAY_THEMES, getTheme, normalizeThemeId } from '../utils/themes'

// Fixed on-screen size (px) for the block tool's perpendicular endcap, independent of field scaling.
const TBAR_LENGTH_PX = 10
const TBAR_THICKNESS_PX = 3

// Fixed on-screen size (px) for route/blitz/coverage arrowheads, independent of field scaling.
const ARROW_LENGTH_PX = 9
const ARROW_WIDTH_PX = 8

const FIELD_WIDTH_FEET = 160
const SIDELINE_HASH_MARK_PERCENT = 1.5
const HASH_MARK_DISTANCE_FEET = {
  'High School': 53 + 4 / 12,
  NCAA: 60,
  NFL: 70 + 9 / 12,
}
const HASH_MARK_Y_POSITIONS = Array.from({ length: 8 }, (_, band) =>
  [2.5, 5, 7.5, 10].map((offset) => band * 12.5 + offset),
).flat()

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

function normalizeDrawings(source) {
  return { ...EMPTY_DRAWINGS, ...(source || {}) }
}

function normalizeTextAnnotations(source) {
  return Array.isArray(source) ? source : []
}

export function PlayDesigner({ record, onClose }) {
  const initialTemplateId = record.template || PLAY_TEMPLATES[0].id
  const initialCategory = record.category || PLAY_CATEGORIES[0]
  const initialFieldDecoration = record.fieldDecoration || FIELD_DECORATIONS[0]
  const initialFieldOrientation = record.fieldOrientation || FIELD_ORIENTATIONS[0]
  const initialTheme = normalizeThemeId(record.initialTheme)
  const original = useRef({
    name: record.name,
    markers: record.initialMarkers || [],
    drawings: normalizeDrawings(record.initialDrawings),
    textAnnotations: normalizeTextAnnotations(record.initialTextAnnotations),
    templateId: initialTemplateId,
    category: initialCategory,
    fieldDecoration: initialFieldDecoration,
    fieldOrientation: initialFieldOrientation,
    theme: initialTheme,
  })
  const [name, setName] = useState(record.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [markers, setMarkers] = useState(record.initialMarkers || [])
  const [drawings, setDrawings] = useState(normalizeDrawings(record.initialDrawings))
    const [textAnnotations, setTextAnnotations] = useState(normalizeTextAnnotations(record.initialTextAnnotations))
  const [templateId, setTemplateId] = useState(initialTemplateId)
  const [category, setCategory] = useState(initialCategory)
  const [fieldDecoration, setFieldDecoration] = useState(initialFieldDecoration)
  const [fieldOrientation, setFieldOrientation] = useState(initialFieldOrientation)
  const [theme, setTheme] = useState(initialTheme)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDrawing, setSelectedDrawing] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [dragTextId, setDragTextId] = useState(null)
  const [dragTextOffset, setDragTextOffset] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [activeChain, setActiveChain] = useState(null)
  const [cursorPos, setCursorPos] = useState(null)
    const [editingTextId, setEditingTextId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draftTemplateId, setDraftTemplateId] = useState(initialTemplateId)
  const [draftCategory, setDraftCategory] = useState(initialCategory)
  const [draftFieldDecoration, setDraftFieldDecoration] = useState(initialFieldDecoration)
  const [draftFieldOrientation, setDraftFieldOrientation] = useState(initialFieldOrientation)
  const [draftTheme, setDraftTheme] = useState(initialTheme)
  const [savedName, setSavedName] = useState(record.name)
  const [savedMarkers, setSavedMarkers] = useState(record.initialMarkers || [])
  const [savedDrawings, setSavedDrawings] = useState(normalizeDrawings(record.initialDrawings))
    const [savedTextAnnotations, setSavedTextAnnotations] = useState(normalizeTextAnnotations(record.initialTextAnnotations))
  const [savedTemplateId, setSavedTemplateId] = useState(initialTemplateId)
  const [savedCategory, setSavedCategory] = useState(initialCategory)
  const [savedFieldDecoration, setSavedFieldDecoration] = useState(initialFieldDecoration)
  const [savedFieldOrientation, setSavedFieldOrientation] = useState(initialFieldOrientation)
  const [savedTheme, setSavedTheme] = useState(initialTheme)
  const fieldRef = useRef(null)
  const menuRef = useRef(null)
  const textMeasureCanvas = useRef(null)
  const [fieldPxSize, setFieldPxSize] = useState({ width: 100, height: 100 })
  const activeTheme = getTheme(theme)
  const themeClass = activeTheme.fieldClass ? ` ${activeTheme.fieldClass}` : ''
  const hashDistanceFeet = HASH_MARK_DISTANCE_FEET[fieldOrientation] || HASH_MARK_DISTANCE_FEET['High School']
  const hashDistancePercent = (hashDistanceFeet / FIELD_WIDTH_FEET) * 100
  const hashMarkXPositions = [
    SIDELINE_HASH_MARK_PERCENT,
    hashDistancePercent,
    100 - hashDistancePercent,
    100 - SIDELINE_HASH_MARK_PERCENT,
  ]

  useEffect(() => {
    const el = fieldRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setFieldPxSize({ width, height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const isDirty =
    name !== savedName ||
    JSON.stringify(markers) !== JSON.stringify(savedMarkers) ||
    JSON.stringify(drawings) !== JSON.stringify(savedDrawings) ||
    JSON.stringify(textAnnotations) !== JSON.stringify(savedTextAnnotations) ||
    templateId !== savedTemplateId ||
    category !== savedCategory ||
    fieldDecoration !== savedFieldDecoration ||
    fieldOrientation !== savedFieldOrientation ||
    theme !== savedTheme

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const payload = {
        name,
        markers,
        drawings,
        textAnnotations,
        template: templateId,
        category,
        fieldDecoration,
        fieldOrientation,
        theme,
      }
      if (record.kind === 'play') {
        await api.updatePlay(record.parentId, record.id, payload)
      } else {
        await api.updateScoutPlay(record.parentId, record.id, payload)
      }
      setSavedName(name)
      setSavedMarkers(markers)
      setSavedDrawings(drawings)
      setSavedTextAnnotations(textAnnotations)
      setSavedTemplateId(templateId)
      setSavedCategory(category)
      setSavedFieldDecoration(fieldDecoration)
      setSavedFieldOrientation(fieldOrientation)
      setSavedTheme(theme)
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
    setTextAnnotations(original.current.textAnnotations)
    setTemplateId(original.current.templateId)
    setCategory(original.current.category)
    setFieldDecoration(original.current.fieldDecoration)
    setFieldOrientation(original.current.fieldOrientation)
    setTheme(original.current.theme)
    setSelectedId(null)
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setEditingTextId(null)
    setActiveChain(null)
    setCursorPos(null)
    setError(null)
  }

  function openSettings() {
    setDraftTemplateId(templateId)
    setDraftCategory(category)
    setDraftFieldDecoration(fieldDecoration)
    setDraftFieldOrientation(fieldOrientation)
    setDraftTheme(theme)
    setSettingsOpen(true)
  }

  function handleSettingsSave(event) {
    event.preventDefault()
    setCategory(draftCategory)
    setFieldDecoration(draftFieldDecoration)
    setFieldOrientation(draftFieldOrientation)
    setTheme(draftTheme)
    if (draftTemplateId !== templateId) {
      const template = PLAY_TEMPLATES.find((t) => t.id === draftTemplateId) || PLAY_TEMPLATES[0]
      setTemplateId(draftTemplateId)
      setMarkers(buildMarkersFromTemplate(template))
      setDrawings(normalizeDrawings())
        setTextAnnotations([])
        setSelectedTextId(null)
        setEditingTextId(null)
      setSelectedId(null)
      setSelectedDrawing(null)
      setActiveChain(null)
      setCursorPos(null)
    }
    setSettingsOpen(false)
  }

  function flipPlay(axis) {
    setMarkers((current) =>
      current.map((marker) => (axis === 'horizontal' ? { ...marker, x: 100 - marker.x } : { ...marker, y: 100 - marker.y })),
    )
    setDrawings((current) => {
      const next = {}
      for (const [type, list] of Object.entries(current)) {
        next[type] = list.map((drawing) => ({
          ...drawing,
          points: drawing.points.map((point) =>
            axis === 'horizontal' ? { ...point, dx: -point.dx } : { ...point, dy: -point.dy },
          ),
        }))
      }
      return next
    })
    setTextAnnotations((current) =>
      current.map((annotation) =>
        axis === 'horizontal' ? { ...annotation, x: 100 - annotation.x } : { ...annotation, y: 100 - annotation.y },
      ),
    )
    setSelectedId(null)
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setEditingTextId(null)
    setActiveChain(null)
    setCursorPos(null)
  }

  function restartPlay() {
    const template = PLAY_TEMPLATES.find((item) => item.id === templateId) || PLAY_TEMPLATES[0]
    setMarkers(buildMarkersFromTemplate(template))
    setDrawings(normalizeDrawings())
    setTextAnnotations([])
    setSelectedId(null)
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setEditingTextId(null)
    setActiveChain(null)
    setCursorPos(null)
  }

  function positionFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function addTextAnnotation() {
    const id = crypto.randomUUID()
    setTextAnnotations((current) => [...current, { id, text: '', x: 50, y: 50 }])
    setEditingTextId(id)
    setSelectedTextId(id)
    setActiveTool('select')
  }

  function handleTextPointerDown(event, id) {
    event.stopPropagation()
    const annotation = textAnnotations.find((item) => item.id === id)
    const fieldRect = fieldRef.current?.getBoundingClientRect()
    if (annotation && fieldRect) {
      const pointerX = ((event.clientX - fieldRect.left) / fieldRect.width) * 100
      const pointerY = ((event.clientY - fieldRect.top) / fieldRect.height) * 100
      setDragTextOffset({ x: pointerX - annotation.x, y: pointerY - annotation.y })
    }
    setSelectedId(null)
    setSelectedDrawing(null)
    setSelectedTextId(id)
    setDragTextId(id)
  }

  function textAnnotationWidth(text) {
    if (!textMeasureCanvas.current) {
      textMeasureCanvas.current = document.createElement('canvas')
    }
    const context = textMeasureCanvas.current.getContext('2d')
    const field = fieldRef.current
    if (!context || !field) return 150
    const style = window.getComputedStyle(field)
    context.font = style.font
    return Math.max(134, Math.ceil(context.measureText(text || 'Enter text').width))
  }

  function handleMarkerPointerDown(event, id) {
    if (activeTool !== 'select') return
    event.stopPropagation()
    setSelectedId(id)
    setSelectedDrawing(null)
      setSelectedTextId(null)
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
    setSelectedTextId(null)
  }

  function handleFieldClick(event) {
    if (activeTool === 'select') {
      // Marker/drawing clicks stop propagation, so reaching here means empty field was clicked.
      setSelectedId(null)
      setSelectedDrawing(null)
      setSelectedTextId(null)
      return
    }
    if (!activeChain) return
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
    if (dragTextId) {
      const { x, y } = positionFromEvent(event)
      const offset = dragTextOffset || { x: 0, y: 0 }
      const nextX = Math.min(100, Math.max(0, x - offset.x))
      const nextY = Math.min(100, Math.max(0, y - offset.y))
      setTextAnnotations((current) =>
        current.map((annotation) => (annotation.id === dragTextId ? { ...annotation, x: nextX, y: nextY } : annotation)),
      )
      return
    }
    if (activeChain) {
      setCursorPos(positionFromEvent(event))
    }
  }

  function handleFieldPointerUp() {
    setDragId(null)
    setDragTextId(null)
    setDragTextOffset(null)
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
    } else if (selectedTextId) {
      setTextAnnotations((current) => current.filter((annotation) => annotation.id !== selectedTextId))
      setSelectedTextId(null)
      setEditingTextId(null)
    }
  }
  function pathData(points) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  }

  // Computes a perpendicular cap segment (in field percent coordinates) that renders as a
  // fixed-length, fixed-thickness line on screen regardless of the field's aspect ratio.
  function tbarCapPoints(points) {
    if (points.length < 2) return null
    const end = points[points.length - 1]
    const prev = points[points.length - 2]
    const scaleX = fieldPxSize.width / 100
    const scaleY = fieldPxSize.height / 100
    const dxPx = (end.x - prev.x) * scaleX
    const dyPx = (end.y - prev.y) * scaleY
    const len = Math.hypot(dxPx, dyPx)
    if (len === 0) return null
    const perpXPx = (-dyPx / len) * (TBAR_LENGTH_PX / 2)
    const perpYPx = (dxPx / len) * (TBAR_LENGTH_PX / 2)
    return {
      x1: end.x + perpXPx / scaleX,
      y1: end.y + perpYPx / scaleY,
      x2: end.x - perpXPx / scaleX,
      y2: end.y - perpYPx / scaleY,
    }
  }

  // Computes an arrowhead triangle (in field percent coordinates) that renders at a fixed
  // on-screen size regardless of the field's aspect ratio.
  function arrowCapPoints(points) {
    if (points.length < 2) return null
    const end = points[points.length - 1]
    const prev = points[points.length - 2]
    const scaleX = fieldPxSize.width / 100
    const scaleY = fieldPxSize.height / 100
    const endPx = { x: end.x * scaleX, y: end.y * scaleY }
    const prevPx = { x: prev.x * scaleX, y: prev.y * scaleY }
    const dxPx = endPx.x - prevPx.x
    const dyPx = endPx.y - prevPx.y
    const len = Math.hypot(dxPx, dyPx)
    if (len === 0) return null
    const dirX = dxPx / len
    const dirY = dyPx / len
    const backX = endPx.x - dirX * ARROW_LENGTH_PX
    const backY = endPx.y - dirY * ARROW_LENGTH_PX
    const perpX = -dirY * (ARROW_WIDTH_PX / 2)
    const perpY = dirX * (ARROW_WIDTH_PX / 2)
    const toPercent = (px, py) => `${px / scaleX},${py / scaleY}`
    return [
      toPercent(endPx.x, endPx.y),
      toPercent(backX + perpX, backY + perpY),
      toPercent(backX - perpX, backY - perpY),
    ].join(' ')
  }

  function toolColor(tool) {
    return activeTheme.strokeColor || tool.color
  }

  function toolDash(tool) {
    return activeTheme.toolDash ? activeTheme.toolDash[tool.id] : tool.dash
  }

  const allDrawings = Object.entries(drawings).flatMap(([type, list]) => list.map((drawing) => ({ ...drawing, type })))
  const chainAnchor = activeChain ? markers.find((marker) => marker.id === activeChain.anchorId) : null
  const isEmpty = markers.length === 0 && allDrawings.length === 0 && textAnnotations.length === 0

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
        <button type="button" className="play-designer-back" onClick={openSettings} aria-label="Play settings">
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              fill="currentColor"
              d="M19.14 12.94a7.14 7.14 0 0 0 .06-.94 7.14 7.14 0 0 0-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54a7.03 7.03 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.14 7.14 0 0 0-.06.94 7.14 7.14 0 0 0 .06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64ZM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
            />
          </svg>
        </button>
        <button type="button" className="play-designer-undo" onClick={handleUndo} disabled={saving || !isDirty}>
          Undo
        </button>
        <button type="button" className="play-designer-save" onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="data-grid-status data-grid-error">Unable to save: {error}</p>}
      {settingsOpen && (
        <div className="dialog-overlay" onClick={() => setSettingsOpen(false)}>
          <form className="dialog-panel" onClick={(event) => event.stopPropagation()} onSubmit={handleSettingsSave}>
            <h2>Play Settings</h2>
            <label className="dialog-field">
              <span>Category</span>
              <select value={draftCategory} onChange={(event) => setDraftCategory(event.target.value)}>
                {PLAY_CATEGORIES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Field Decoration</span>
              <select value={draftFieldDecoration} onChange={(event) => setDraftFieldDecoration(event.target.value)}>
                {FIELD_DECORATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Field Orientation</span>
              <select value={draftFieldOrientation} onChange={(event) => setDraftFieldOrientation(event.target.value)}>
                {FIELD_ORIENTATIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Template</span>
              <select value={draftTemplateId} onChange={(event) => setDraftTemplateId(event.target.value)}>
                {PLAY_TEMPLATES.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Theme</span>
              <select value={draftTheme} onChange={(event) => setDraftTheme(event.target.value)}>
                {PLAY_THEMES.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
        <button type="button" className="play-designer-tool" onClick={addTextAnnotation} title="Add Text">
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path fill="currentColor" d="M5 4h14v2h-6v14h-2V6H5z" />
          </svg>
          <span>Add Text</span>
        </button>
        <div className="toolbar-menu" ref={menuRef}>
          <button
            type="button"
            className="hamburger-button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="More play actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg className="hamburger-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="toolbar-dropdown" role="menu">
              <button type="button" role="menuitem" onClick={() => flipPlay('horizontal')}>
                Flip Horizontal
              </button>
              <button type="button" role="menuitem" onClick={() => flipPlay('vertical')}>
                Flip Vertical
              </button>
              <button type="button" role="menuitem" onClick={restartPlay}>
                Restart Play
              </button>
            </div>
          )}
        </div>
      </div>
      <div
        ref={fieldRef}
        className={`play-designer-field${activeTool !== 'select' ? ' drawing' : ''}${themeClass}`}
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
        {fieldDecoration !== FIELD_DECORATIONS[0] && (
          <div className="play-designer-hash-marks" aria-hidden="true">
            {HASH_MARK_Y_POSITIONS.flatMap((top) =>
              hashMarkXPositions.map((left) => (
                <span
                  key={`${top}-${left}`}
                  className="play-designer-hash-mark"
                  style={{ left: `${left}%`, top: `${top}%` }}
                />
              )),
            )}
          </div>
        )}
        {isEmpty && (
          <p className="play-designer-hint">
            Drag players to reposition them. Pick a tool, click a player to anchor a line, click to add
            segments, and double-click to finish.
          </p>
        )}
        {textAnnotations.map((annotation) => (
          <input
            key={annotation.id}
            className={`play-designer-text-annotation${annotation.id === selectedTextId ? ' selected' : ''}`}
            style={{
              left: `${annotation.x}%`,
              top: `${annotation.y}%`,
              width: `${textAnnotationWidth(annotation.text)}px`,
            }}
            value={annotation.text}
            placeholder="Enter text"
            autoFocus={annotation.id === editingTextId}
            onChange={(event) =>
              setTextAnnotations((current) =>
                current.map((item) => (item.id === annotation.id ? { ...item, text: event.target.value } : item)),
              )
            }
            onPointerDown={(event) => handleTextPointerDown(event, annotation.id)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
            onBlur={() => {
              if (!annotation.text.trim()) {
                setTextAnnotations((current) => current.filter((item) => item.id !== annotation.id))
                setSelectedTextId(null)
                setEditingTextId(null)
              }
            }}
            aria-label="Text annotation"
          />
        ))}
        <svg className="play-designer-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {allDrawings.map((drawing) => {
            const anchor = markers.find((marker) => marker.id === drawing.anchorId)
            if (!anchor) return null
            const tool = DRAWING_TOOLS.find((t) => t.id === drawing.type)
            const points = [
              { x: anchor.x, y: anchor.y },
              ...drawing.points.map((p) => ({ x: anchor.x + p.dx, y: anchor.y + p.dy })),
            ]
            const isSelected = selectedDrawing?.type === drawing.type && selectedDrawing?.id === drawing.id
            const cap = tool.endCap === 'tbar' ? tbarCapPoints(points) : null
            const arrow = tool.arrow ? arrowCapPoints(points) : null
            return (
              <g key={drawing.id}>
                <path
                  className={`play-designer-route${isSelected ? ' selected' : ''}`}
                  d={pathData(points)}
                  stroke={toolColor(tool)}
                  strokeDasharray={toolDash(tool) || undefined}
                  onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                />
                {cap && (
                  <line
                    x1={cap.x1}
                    y1={cap.y1}
                    x2={cap.x2}
                    y2={cap.y2}
                    stroke={toolColor(tool)}
                    strokeWidth={TBAR_THICKNESS_PX}
                    vectorEffect="non-scaling-stroke"
                    onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                  />
                )}
                {arrow && (
                  <polygon
                    points={arrow}
                    fill={toolColor(tool)}
                    onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                  />
                )}
              </g>
            )
          })}
          {activeChain && chainAnchor && (() => {
            const tool = DRAWING_TOOLS.find((t) => t.id === activeChain.type)
            const points = [
              { x: chainAnchor.x, y: chainAnchor.y },
              ...activeChain.points.map((p) => ({ x: chainAnchor.x + p.dx, y: chainAnchor.y + p.dy })),
            ]
            if (cursorPos) points.push(cursorPos)
            const cap = tool.endCap === 'tbar' ? tbarCapPoints(points) : null
            const arrow = tool.arrow ? arrowCapPoints(points) : null
            return (
              <g>
                <path
                  d={pathData(points)}
                  stroke={toolColor(tool)}
                  strokeDasharray={toolDash(tool) || undefined}
                  className="play-designer-route preview"
                />
                {cap && (
                  <line
                    x1={cap.x1}
                    y1={cap.y1}
                    x2={cap.x2}
                    y2={cap.y2}
                    stroke={toolColor(tool)}
                    strokeWidth={TBAR_THICKNESS_PX}
                    vectorEffect="non-scaling-stroke"
                    className="play-designer-route preview"
                  />
                )}
                {arrow && <polygon points={arrow} fill={toolColor(tool)} />}
              </g>
            )
          })()}
        </svg>
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={`play-designer-marker ${marker.team || 'offense'}${marker.id === selectedId ? ' selected' : ''}${activeTool !== 'select' ? ' anchorable' : ''}${themeClass}`}
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
