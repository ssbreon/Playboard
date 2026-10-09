import { useEffect, useId, useRef, useState } from 'react'
import { Check, FlipHorizontal2, FlipVertical2, Pencil, Play, Plus, Printer, RotateCcw, Settings, Undo2, X } from 'lucide-react'
import { api as defaultApi } from '../api'
import { FIELD_DECORATIONS, FIELD_ORIENTATIONS, PLAY_CATEGORIES } from './NewPlayDialog'
import { PrintPreviewDialog } from './PrintPreviewDialog'
import { PLAY_TEMPLATES, buildMarkersFromTemplate } from '../utils/formations'
import { PLAY_THEMES, getTheme, normalizeThemeId } from '../utils/themes'
import {
  BLITZ_FIRST_SEGMENT_DASH,
  DEFAULT_PLAY_PERSPECTIVE,
  DEFAULT_FIELD_ZONE,
  DRAWING_TOOLS,
  FIELD_ZONES,
  PLAY_PERSPECTIVES,
  TBAR_THICKNESS_PX,
  arrowCapPoints,
  drawingAnchor as resolveDrawingAnchor,
  drawingIdsWithDependents,
  decorationPreviewVars,
  endZoneBandsForWindow,
  goalLinePositionsForWindow,
  fieldWindowForZone,
  fixedSizeEllipse,
  flattenDrawings,
  hashMarkXPositions,
  hashMarkYPositionsForWindow,
  markerStyleVars,
  normalizeDrawings,
  normalizeTextAnnotations,
  normalizeZones,
  motionPathPoints,
  pathData,
  removeDrawingDependents,
  tbarCapPoints,
  textAnnotationStyle,
  textAnnotationWidth,
  toolColor as resolveToolColor,
  toolDash as resolveToolDash,
  yardNumberXPositions,
  yardNumbersForWindow,
  DEFAULT_ZONE_FILL,
  MIN_ZONE_SIZE,
  ZONE_FILLS,
  ZONE_SHAPES,
  zoneBoxStyle,
  zoneFillColor,
} from '../utils/playGeometry'

const TOOL_ICONS = {
  select: <path fill="currentColor" d="M6 3v18l4.6-4.6L13.2 21l2.6-1.4-2.6-4.6L18 13.4z" />,
  block: <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" d="M5 19 15 9M11 5l8 8" />,
  dtb: <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path strokeDasharray="1 3" d="M5 19 15 9" /><path d="M11 5l8 8" /></g>,
  route: <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path d="M5 19 19 5" /><path d="M13 5h6v6" /></g>,
  blitz: <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path strokeDasharray="4 3" d="M5 19 19 5" /><path d="M13 5h6v6" /></g>,
  coverage: <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"><path strokeDasharray="1 3" d="M5 19 19 5" /><path d="M13 5h6v6" /></g>,
  motion: <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" d="M3 12 7 8l4 8 4-8 6 4" />,
}

const PLAYER_COLORS = ['#ffffff', '#1d4ed8', '#b91c1c', '#15803d', '#f59e0b', '#7c3aed', '#374151']
const TEXT_FONT_SIZES = [12, 14, 16, 20, 24, 32]
const TEXT_STYLE_TOGGLES = [
  { id: 'bold', label: 'Bold', glyph: 'B' },
  { id: 'italic', label: 'Italic', glyph: 'I' },
  { id: 'underline', label: 'Underline', glyph: 'U' },
  { id: 'box', label: 'Box', glyph: 'Box' },
]
const PLAYER_DECORATIONS = [
  { id: 'solid', label: 'Solid' },
  { id: 'half-left', label: 'Left half' },
  { id: 'half-right', label: 'Right half' },
  { id: 'vertical-line', label: 'Vertical line' },
]
const MAX_ADJUSTMENT_SLIDES = 3
const MOTION_CAP_RADIUS_PX = 3.5
const PATH_ANCHOR_TOOLS = new Set(DRAWING_TOOLS.map((tool) => tool.id).filter((id) => !['select', 'dtb', 'line'].includes(id)))
const BLOCK_ANCHOR_TOOLS = new Set(['dtb', 'route', 'blitz', 'coverage'])
const MOTION_CAP_ANCHOR_TOOLS = new Set(DRAWING_TOOLS.map((tool) => tool.id).filter((id) => !['select', 'motion'].includes(id)))
const ZONE_HANDLES = [
  { id: 'nw', left: 0, top: 0 },
  { id: 'n', left: 50, top: 0 },
  { id: 'ne', left: 100, top: 0 },
  { id: 'e', left: 100, top: 50 },
  { id: 'se', left: 100, top: 100 },
  { id: 's', left: 50, top: 100 },
  { id: 'sw', left: 0, top: 100 },
  { id: 'w', left: 0, top: 50 },
]

function adjustmentDesign(slide, fallback) {
  return {
    markers: Array.isArray(slide.markers) ? slide.markers : fallback.markers,
    drawings: normalizeDrawings(slide.drawings || fallback.drawings),
    textAnnotations: normalizeTextAnnotations(slide.textAnnotations || fallback.textAnnotations),
    zones: normalizeZones(slide.zones || fallback.zones),
    templateId: slide.template || fallback.templateId,
    category: slide.category || fallback.category,
    fieldDecoration: slide.fieldDecoration || fallback.fieldDecoration,
    fieldOrientation: slide.fieldOrientation || fallback.fieldOrientation,
    fieldZone: slide.fieldZone || fallback.fieldZone,
    perspective: slide.perspective || fallback.perspective,
    theme: normalizeThemeId(slide.theme || fallback.theme),
  }
}

export function PlayDesigner({ record, onClose, api = defaultApi, readOnly = false, canDelete = true, onGuardChange }) {
  const drawingMaskId = useId()
  const initialTemplateId = record.template || PLAY_TEMPLATES[0].id
  const initialCategory = record.category || PLAY_CATEGORIES[0]
  const initialFieldDecoration = record.fieldDecoration || FIELD_DECORATIONS[0]
  const initialFieldOrientation = record.fieldOrientation || FIELD_ORIENTATIONS[0]
  const initialFieldZone = record.fieldZone || DEFAULT_FIELD_ZONE
  const initialPerspective = record.perspective || DEFAULT_PLAY_PERSPECTIVE
  const initialTheme = normalizeThemeId(record.initialTheme)
  const [name, setName] = useState(record.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [markers, setMarkers] = useState(record.initialMarkers || [])
  const [drawings, setDrawings] = useState(normalizeDrawings(record.initialDrawings))
    const [textAnnotations, setTextAnnotations] = useState(normalizeTextAnnotations(record.initialTextAnnotations))
  const [zones, setZones] = useState(normalizeZones(record.initialZones))
  const [templateId, setTemplateId] = useState(initialTemplateId)
  const [category, setCategory] = useState(initialCategory)
  const [fieldDecoration, setFieldDecoration] = useState(initialFieldDecoration)
  const [fieldOrientation, setFieldOrientation] = useState(initialFieldOrientation)
  const [fieldZone, setFieldZone] = useState(initialFieldZone)
  const [perspective, setPerspective] = useState(initialPerspective)
  const [theme, setTheme] = useState(initialTheme)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedDrawing, setSelectedDrawing] = useState(null)
  const [pathDrag, setPathDrag] = useState(null)
  const [selectedTextId, setSelectedTextId] = useState(null)
  const [selectedZoneId, setSelectedZoneId] = useState(null)
  const [zoneDrag, setZoneDrag] = useState(null)
  const [hoveredBlockCapId, setHoveredBlockCapId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [multiSelectedIds, setMultiSelectedIds] = useState([])
  const [groupDrag, setGroupDrag] = useState(null)
  const [marquee, setMarquee] = useState(null)
  const suppressFieldClickRef = useRef(false)
  const [dragTextId, setDragTextId] = useState(null)
  const [dragTextOffset, setDragTextOffset] = useState(null)
  const [activeTool, setActiveTool] = useState('select')
  const [activeChain, setActiveChain] = useState(null)
  const [cursorPos, setCursorPos] = useState(null)
  const [drawHistory, setDrawHistory] = useState([])
  const [redoHistory, setRedoHistory] = useState([])
  const [editingTextId, setEditingTextId] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const [draftTemplateId, setDraftTemplateId] = useState(initialTemplateId)
  const [draftCategory, setDraftCategory] = useState(initialCategory)
  const [draftFieldDecoration, setDraftFieldDecoration] = useState(initialFieldDecoration)
  const [draftFieldOrientation, setDraftFieldOrientation] = useState(initialFieldOrientation)
  const [draftFieldZone, setDraftFieldZone] = useState(initialFieldZone)
  const [draftPerspective, setDraftPerspective] = useState(initialPerspective)
  const [draftTheme, setDraftTheme] = useState(initialTheme)
  const [savedName, setSavedName] = useState(record.name)
  const [savedMarkers, setSavedMarkers] = useState(record.initialMarkers || [])
  const [savedDrawings, setSavedDrawings] = useState(normalizeDrawings(record.initialDrawings))
  const [savedTextAnnotations, setSavedTextAnnotations] = useState(normalizeTextAnnotations(record.initialTextAnnotations))
  const [savedZones, setSavedZones] = useState(normalizeZones(record.initialZones))
  const [savedTemplateId, setSavedTemplateId] = useState(initialTemplateId)
  const [savedCategory, setSavedCategory] = useState(initialCategory)
  const [savedFieldDecoration, setSavedFieldDecoration] = useState(initialFieldDecoration)
  const [savedFieldOrientation, setSavedFieldOrientation] = useState(initialFieldOrientation)
  const [savedFieldZone, setSavedFieldZone] = useState(initialFieldZone)
  const [savedPerspective, setSavedPerspective] = useState(initialPerspective)
  const [savedTheme, setSavedTheme] = useState(initialTheme)
  const [slides, setSlides] = useState([])
  const [slidesLoadError, setSlidesLoadError] = useState(false)
  const [slideDraftTitles, setSlideDraftTitles] = useState({})
  const [slidesLoading, setSlidesLoading] = useState(record.kind === 'play')
  const [activeSlideId, setActiveSlideId] = useState(null)
  const [activeSlideTitle, setActiveSlideTitle] = useState('')
  const [editingSlideId, setEditingSlideId] = useState(null)
  const [playerAnimation, setPlayerAnimation] = useState(null)
  const [removingSlideId, setRemovingSlideId] = useState(null)
  const slideDraftsRef = useRef({})
  const fieldRef = useRef(null)
  const menuRef = useRef(null)
  const animationFrameRef = useRef(null)
  const [fieldPxSize, setFieldPxSize] = useState({ width: 100, height: 100 })
  const activeTheme = getTheme(theme)
  const themeClass = activeTheme.fieldClass ? ` ${activeTheme.fieldClass}` : ''
  const fieldDecorationClass = fieldDecoration === FIELD_DECORATIONS[0] ? ' no-field-decoration' : ''
  const hashXPositions = hashMarkXPositions(fieldOrientation)
  const showHashMarks = fieldDecoration !== FIELD_DECORATIONS[0]
  const showYardNumbers = fieldDecoration === FIELD_DECORATIONS[2]
  const fieldWindow = fieldWindowForZone(fieldZone, perspective)
  const hashYPositions = hashMarkYPositionsForWindow(fieldWindow, perspective)
  const yardNumbers = showYardNumbers ? yardNumbersForWindow(fieldWindow, perspective) : []
  const yardNumberX = yardNumberXPositions(fieldOrientation)
  const endZoneBands = showYardNumbers ? endZoneBandsForWindow(fieldWindow, perspective) : []
  const goalLinePositions = showYardNumbers ? goalLinePositionsForWindow(fieldWindow, perspective) : []
  const losPercent = fieldWindow.losPercent

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

  useEffect(() => () => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
  }, [])

  useEffect(() => {
    if (record.kind !== 'play') return undefined
    let cancelled = false
    api.listSlides(record.parentId, record.id)
      .then((result) => {
        if (!cancelled) {
          const items = result.items || []
          setSlides(items)
          setSlideDraftTitles(Object.fromEntries(items.map((slide) => [slide.id, slide.title || 'Adjustment'])))
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setSlidesLoadError(true)
          setError(`Unable to load adjustments: ${err.message}`)
        }
      })
      .finally(() => {
        if (!cancelled) setSlidesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [record.kind, record.parentId, record.id, api])

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeSlide = slides.find((slide) => slide.id === activeSlideId)
  const savedBaseDesign = {
    markers: savedMarkers,
    drawings: savedDrawings,
    textAnnotations: savedTextAnnotations,
    zones: savedZones,
    templateId: savedTemplateId,
    category: savedCategory,
    fieldDecoration: savedFieldDecoration,
    fieldOrientation: savedFieldOrientation,
    fieldZone: savedFieldZone,
    perspective: savedPerspective,
    theme: savedTheme,
  }
  const savedActiveDesign = activeSlide ? adjustmentDesign(activeSlide, savedBaseDesign) : savedBaseDesign
  const currentDesign = {
    markers,
    drawings,
    textAnnotations,
    zones,
    templateId,
    category,
    fieldDecoration,
    fieldOrientation,
    fieldZone,
    perspective,
    theme,
  }
  const designIsDirty = Object.keys(currentDesign).some(
    (key) => JSON.stringify(currentDesign[key]) !== JSON.stringify(savedActiveDesign[key]),
  )
  const isDirty = activeSlideId
    ? designIsDirty || activeSlideTitle !== (activeSlide?.title || 'Adjustment')
    : name !== savedName || designIsDirty

  const canUndoDrawing =
    isDirty && drawHistory.some((entry) => (drawings[entry.type] || []).some((drawing) => drawing.id === entry.id))
  const canRedoDrawing = redoHistory.length > 0

  function captureCurrentDraft() {
    return { ...currentDesign, name, title: activeSlideTitle }
  }

  function restoreDesign(design) {
    setMarkers(design.markers)
    setDrawings(normalizeDrawings(design.drawings))
    setTextAnnotations(normalizeTextAnnotations(design.textAnnotations))
    setZones(normalizeZones(design.zones))
    setTemplateId(design.templateId)
    setCategory(design.category)
    setFieldDecoration(design.fieldDecoration)
    setFieldOrientation(design.fieldOrientation)
    setFieldZone(design.fieldZone)
    setPerspective(design.perspective)
    setTheme(design.theme)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setSelectedZoneId(null)
    setEditingTextId(null)
    setActiveTool('select')
    setHoveredBlockCapId(null)
    setActiveChain(null)
    setCursorPos(null)
    setDrawHistory([])
    setRedoHistory([])
  }

  function activateSlide(slideId) {
    if (slideId === activeSlideId) return
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    animationFrameRef.current = null
    setPlayerAnimation(null)
    slideDraftsRef.current[activeSlideId || 'base'] = captureCurrentDraft()
    setActiveSlideId(slideId)
    setEditingSlideId(null)
    const slide = slides.find((item) => item.id === slideId)
    const draft = slideDraftsRef.current[slideId || 'base']
    if (draft) {
      restoreDesign(draft)
      if (!slideId) setName(draft.name ?? savedName)
      setActiveSlideTitle(slideId ? draft.title || slide?.title || 'Adjustment' : '')
      if (slideId) setSlideDraftTitles((current) => ({ ...current, [slideId]: draft.title || slide?.title || 'Adjustment' }))
    } else if (slideId && slide) {
      restoreDesign(adjustmentDesign(slide, savedBaseDesign))
      setActiveSlideTitle(slide.title || 'Adjustment')
    } else {
      restoreDesign(savedBaseDesign)
      setName(savedName)
      setActiveSlideTitle('')
    }
  }

  function runAdjustment(slide) {
    const baseDesign = activeSlideId
      ? slideDraftsRef.current.base || savedBaseDesign
      : currentDesign
    const adjustment = slide.id === activeSlideId
      ? { markers }
      : adjustmentDesign(slide, baseDesign)
    activateSlide(slide.id)

    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    const baseMarkers = new Map((baseDesign.markers || []).map((marker) => [marker.id, marker]))
    const players = Object.fromEntries(
      adjustment.markers.flatMap((marker) => {
        const start = baseMarkers.get(marker.id)
        return start
          ? [[marker.id, { fromX: start.x, fromY: start.y, toX: marker.x, toY: marker.y }]]
          : []
      }),
    )

    if (Object.keys(players).length === 0) {
      animationFrameRef.current = null
      setPlayerAnimation(null)
      return
    }

    const duration = 2400
    let startedAt
    setPlayerAnimation({ players, progress: 0 })
    const animate = (timestamp) => {
      if (startedAt === undefined) startedAt = timestamp
      const progress = Math.min((timestamp - startedAt) / duration, 1)
      setPlayerAnimation({ players, progress })
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        animationFrameRef.current = null
        setPlayerAnimation(null)
      }
    }
    animationFrameRef.current = requestAnimationFrame(animate)
  }

  async function handleSave() {
    if (readOnly) return false
    setSaving(true)
    setError(null)
    try {
      const designPayload = {
        markers,
        drawings,
        textAnnotations,
        zones,
        template: templateId,
        category,
        fieldDecoration,
        fieldOrientation,
        fieldZone,
        perspective,
        theme,
      }
      if (activeSlideId) {
        const title = activeSlideTitle.trim() || activeSlide?.title || 'Adjustment'
        const updated = await api.updateSlide(record.parentId, record.id, activeSlideId, { ...designPayload, title })
        setSlides((current) => current.map((slide) => (slide.id === activeSlideId ? { ...slide, ...updated } : slide)))
        setActiveSlideTitle(title)
        setSlideDraftTitles((current) => ({ ...current, [activeSlideId]: title }))
      } else {
        const payload = { ...designPayload, name }
        if (record.kind === 'play') {
          await api.updatePlay(record.parentId, record.id, payload)
        } else {
          await api.updateScoutPlay(record.parentId, record.id, payload)
        }
        setSavedName(name)
        setSavedMarkers(markers)
        setSavedDrawings(drawings)
        setSavedTextAnnotations(textAnnotations)
        setSavedZones(zones)
        setSavedTemplateId(templateId)
        setSavedCategory(category)
        setSavedFieldDecoration(fieldDecoration)
        setSavedFieldOrientation(fieldOrientation)
        setSavedFieldZone(fieldZone)
        setSavedPerspective(perspective)
        setSavedTheme(theme)
      }
      delete slideDraftsRef.current[activeSlideId || 'base']
      return true
    } catch (err) {
      setError(`Unable to save: ${err.message}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  function draftIsDirty(slideId, draft) {
    const savedSlide = slides.find((slide) => slide.id === slideId)
    const baseline = slideId === 'base' ? savedBaseDesign : adjustmentDesign(savedSlide || {}, savedBaseDesign)
    return Object.keys(currentDesign).some((property) => JSON.stringify(draft[property]) !== JSON.stringify(baseline[property]))
      || (slideId === 'base' ? draft.name !== savedName : draft.title !== (savedSlide?.title || 'Adjustment'))
  }

  function navigationIsDirty() {
    return !readOnly && (isDirty || settingsOpen || Object.entries(slideDraftsRef.current).some(([slideId, draft]) => draftIsDirty(slideId, draft)))
  }

  async function saveNavigationDrafts() {
    if (readOnly || settingsOpen) return false
    setSaving(true)
    setError(null)
    const drafts = { ...slideDraftsRef.current, [activeSlideId || 'base']: captureCurrentDraft() }
    try {
      for (const [slideId, draft] of Object.entries(drafts).sort(([first], [second]) => first === 'base' ? -1 : second === 'base' ? 1 : 0)) {
        if (!draftIsDirty(slideId, draft)) continue
        const { templateId: draftTemplate, name: draftName, title: draftTitle, ...design } = draft
        const payload = { ...design, template: draftTemplate }
        if (slideId === 'base') {
          if (record.kind === 'play') await api.updatePlay(record.parentId, record.id, { ...payload, name: draftName })
          else await api.updateScoutPlay(record.parentId, record.id, { ...payload, name: draftName })
        } else {
          await api.updateSlide(record.parentId, record.id, slideId, { ...payload, title: draftTitle || 'Adjustment' })
        }
      }
      slideDraftsRef.current = {}
      return true
    } catch (failure) {
      setError(`Unable to save: ${failure.message}`)
      return false
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    onGuardChange?.({ dirty: navigationIsDirty(), saving, canSave: !settingsOpen, save: saveNavigationDrafts })
    return () => onGuardChange?.(null)
  })

  useEffect(() => {
    function beforeUnload(event) {
      if (navigationIsDirty()) { event.preventDefault(); event.returnValue = '' }
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  })

  function handleCancel() {
    delete slideDraftsRef.current[activeSlideId || 'base']
    if (activeSlideId && activeSlide) {
      restoreDesign(adjustmentDesign(activeSlide, savedBaseDesign))
      setActiveSlideTitle(activeSlide.title || 'Adjustment')
      setSlideDraftTitles((current) => ({ ...current, [activeSlideId]: activeSlide.title || 'Adjustment' }))
    } else {
      restoreDesign(savedBaseDesign)
      setName(savedName)
    }
    setError(null)
  }

  async function handleAddAdjustment() {
    if (readOnly || record.kind !== 'play' || slides.length >= MAX_ADJUSTMENT_SLIDES || slidesLoading || slidesLoadError) return
    setSaving(true)
    setError(null)
    const currentDraft = captureCurrentDraft()
    slideDraftsRef.current[activeSlideId || 'base'] = currentDraft
    try {
      let sequence = 1
      const titles = new Set(slides.map((slide) => slide.title))
      while (titles.has(`Adjustment ${sequence}`)) sequence += 1
      const title = `Adjustment ${sequence}`
      const created = await api.createSlide(record.parentId, record.id, {
        markers,
        drawings,
        textAnnotations,
        zones,
        template: templateId,
        category,
        fieldDecoration,
        fieldOrientation,
        fieldZone,
        perspective,
        theme,
        title,
      })
      setSlides((current) => [...current, created])
      setSlideDraftTitles((current) => ({ ...current, [created.id]: created.title || title }))
      setActiveSlideId(created.id)
      setActiveSlideTitle(created.title || title)
      restoreDesign(adjustmentDesign(created, currentDesign))
    } catch (err) {
      setError(`Unable to add adjustment: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAdjustment(slide) {
    if (readOnly || !canDelete) return
    if (!window.confirm(`Delete "${slide.title || 'Adjustment'}"? This cannot be undone.`)) return
    setRemovingSlideId(slide.id)
    setError(null)
    try {
      await api.deleteSlide(record.parentId, record.id, slide.id)
      setSlides((current) => current.filter((item) => item.id !== slide.id))
      setSlideDraftTitles((current) => {
        const next = { ...current }
        delete next[slide.id]
        return next
      })
      delete slideDraftsRef.current[slide.id]
      if (activeSlideId === slide.id) {
        const baseDraft = slideDraftsRef.current.base
        setActiveSlideId(null)
        setActiveSlideTitle('')
        setEditingSlideId(null)
        restoreDesign(baseDraft || savedBaseDesign)
        setName(baseDraft?.name ?? savedName)
        delete slideDraftsRef.current.base
      }
    } catch (err) {
      setError(`Unable to delete adjustment: ${err.message}`)
    } finally {
      setRemovingSlideId(null)
    }
  }

  function undoLastDrawing() {
    const history = [...drawHistory]
    while (history.length > 0) {
      const last = history.pop()
      const drawing = (drawings[last.type] || []).find((item) => item.id === last.id)
      if (drawing) {
        const removedIds = drawingIdsWithDependents(drawings, [last.id])
        const removedDrawings = Object.entries(drawings).flatMap(([type, items]) =>
          items.filter((item) => removedIds.has(item.id)).map((item) => ({ type, drawing: item })),
        )
        setDrawings((current) => {
          return removeDrawingDependents(current, [last.id])
        })
        setRedoHistory((current) => [...current, { entry: last, drawings: removedDrawings }])
        setSelectedDrawing(null)
        break
      }
    }
    setDrawHistory(history)
  }

  function redoLastDrawing() {
    const history = [...redoHistory]
    const action = history.pop()
    if (!action) return
    setDrawings((current) => {
      const next = { ...current }
      for (const { type, drawing } of action.drawings) {
        if (!next[type].some((item) => item.id === drawing.id)) {
          next[type] = [...next[type], drawing]
        }
      }
      return next
    })
    setDrawHistory((current) => [...current, action.entry])
    setRedoHistory(history)
  }

  function openSettings() {
    setDraftTemplateId(templateId)
    setDraftCategory(category)
    setDraftFieldDecoration(fieldDecoration)
    setDraftFieldOrientation(fieldOrientation)
    setDraftFieldZone(fieldZone)
    setDraftPerspective(perspective)
    setDraftTheme(theme)
    setSettingsOpen(true)
  }

  function handleSettingsSave(event) {
    event.preventDefault()
    setCategory(draftCategory)
    setFieldDecoration(draftFieldDecoration)
    setFieldOrientation(draftFieldOrientation)
    setFieldZone(draftFieldZone)
    setPerspective(draftPerspective)
    setTheme(draftTheme)
    if (draftTemplateId !== templateId) {
      const template = PLAY_TEMPLATES.find((t) => t.id === draftTemplateId) || PLAY_TEMPLATES[0]
      setTemplateId(draftTemplateId)
      setMarkers(buildMarkersFromTemplate(template))
      setDrawings(normalizeDrawings())
        setTextAnnotations([])
        setZones([])
        setSelectedZoneId(null)
        setSelectedTextId(null)
        setEditingTextId(null)
      setSelectedId(null)
      setSelectedDrawing(null)
      setActiveChain(null)
      setCursorPos(null)
      setDrawHistory([])
      setRedoHistory([])
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
          ...(drawing.origin && {
            origin: axis === 'horizontal'
              ? { x: 100 - drawing.origin.x, y: drawing.origin.y }
              : { x: drawing.origin.x, y: 100 - drawing.origin.y },
          }),
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
    setZones((current) =>
      current.map((zone) => (axis === 'horizontal' ? { ...zone, x: 100 - zone.x } : { ...zone, y: 100 - zone.y })),
    )
    setSelectedZoneId(null)
    if (axis === 'vertical') {
      setPerspective((current) => (current === PLAY_PERSPECTIVES[0] ? PLAY_PERSPECTIVES[1] : PLAY_PERSPECTIVES[0]))
    }
    setSelectedId(null)
    setMultiSelectedIds([])
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
    setZones([])
    setSelectedZoneId(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setEditingTextId(null)
    setActiveChain(null)
    setCursorPos(null)
    setDrawHistory([])
    setRedoHistory([])
  }

  function restartAdjustment() {
    if (!activeSlideId || !activeSlide) return
    restoreDesign(slideDraftsRef.current.base || savedBaseDesign)
    setMenuOpen(false)
  }

  function positionFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function startPlacementTool(tool) {
    setActiveTool(tool)
    setActiveChain(null)
    setCursorPos(null)
    setSelectedDrawing(null)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedTextId(null)
    setEditingTextId(null)
    setSelectedZoneId(null)
  }

  function addTextAnnotation(position) {
    const id = crypto.randomUUID()
    setTextAnnotations((current) => [...current, { id, text: '', x: position.x, y: position.y }])
    setEditingTextId(id)
    setSelectedTextId(id)
    setSelectedZoneId(null)
    setActiveTool('select')
  }

  function addZone(position) {
    const id = crypto.randomUUID()
    const width = 20
    const height = 14
    const x = Math.min(100 - width / 2, Math.max(width / 2, position.x))
    const y = Math.min(100 - height / 2, Math.max(height / 2, position.y))
    setZones((current) => [...current, { id, x, y, width, height, shape: 'oval', fill: DEFAULT_ZONE_FILL, border: true }])
    setSelectedZoneId(id)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setEditingTextId(null)
    setActiveTool('select')
    setActiveChain(null)
    setCursorPos(null)
  }

  function handleZonePointerDown(event, zone, handle = null) {
    if (activeTool !== 'select' || event.button !== 0) return
    event.stopPropagation()
    const fieldRect = fieldRef.current?.getBoundingClientRect()
    if (!fieldRect) return
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelectedZoneId(zone.id)
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedDrawing(null)
    setSelectedTextId(null)
    setZoneDrag({
      id: zone.id,
      handle,
      start: {
        x: ((event.clientX - fieldRect.left) / fieldRect.width) * 100,
        y: ((event.clientY - fieldRect.top) / fieldRect.height) * 100,
      },
      origin: { x: zone.x, y: zone.y, width: zone.width, height: zone.height },
    })
  }

  function updateZoneAppearance(id, updates) {
    setZones((current) => current.map((zone) => (zone.id === id ? { ...zone, ...updates } : zone)))
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
    setSelectedZoneId(null)
    setSelectedTextId(id)
    setDragTextId(id)
  }

  function updateTextAppearance(id, updates) {
    setTextAnnotations((current) =>
      current.map((annotation) => {
        if (annotation.id !== id) return annotation
        const updated = { ...annotation, ...updates }
        for (const key of ['color', 'fontSize', 'bold', 'italic', 'underline', 'box']) {
          if (!updated[key]) delete updated[key]
        }
        return updated
      }),
    )
  }

  function drawingAnchor(drawing) {
    return resolveDrawingAnchor(drawing, drawings, markers)
  }

  function handleMarkerPointerDown(event, id) {
    if (activeTool !== 'select' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    if (event.shiftKey) {
      setMultiSelectedIds((current) => {
        const base = current.length === 0 && selectedId ? [selectedId] : current
        return base.includes(id) ? base.filter((item) => item !== id) : [...base, id]
      })
      setSelectedId(null)
      setSelectedDrawing(null)
      setSelectedTextId(null)
      setSelectedZoneId(null)
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (multiSelectedIds.includes(id)) {
      const fieldRect = fieldRef.current?.getBoundingClientRect()
      if (!fieldRect) return
      const origins = {}
      for (const marker of markers) {
        if (multiSelectedIds.includes(marker.id)) origins[marker.id] = { x: marker.x, y: marker.y }
      }
      setGroupDrag({
        start: {
          x: ((event.clientX - fieldRect.left) / fieldRect.width) * 100,
          y: ((event.clientY - fieldRect.top) / fieldRect.height) * 100,
        },
        origins,
      })
      return
    }
    setMultiSelectedIds([])
    setSelectedId(id)
    setSelectedDrawing(null)
      setSelectedTextId(null)
    setSelectedZoneId(null)
    setDragId(id)
  }

  function handleMarkerClick(event, id) {
    event.stopPropagation()
    if (!PATH_ANCHOR_TOOLS.has(activeTool) || activeChain) return
    setActiveChain({ type: activeTool, anchorId: id, points: [] })
    setSelectedDrawing(null)
    setCursorPos(null)
  }

  function updateMarkerAppearance(id, updates) {
    setMarkers((current) =>
      current.map((marker) => {
        if (marker.id !== id) return marker
        const updated = { ...marker, ...updates }
        if (!updated.color) delete updated.color
        if (!updated.decoration || updated.decoration === 'solid') delete updated.decoration
        return updated
      }),
    )
  }

  function updateDrawingAppearance(type, id, updates) {
    setDrawings((current) => ({
      ...current,
      [type]: current[type].map((drawing) => {
        if (drawing.id !== id) return drawing
        const updated = { ...drawing, ...updates }
        if (!updated.color) delete updated.color
        return updated
      }),
    }))
  }

  function handleDrawingClick(event, type, id) {
    if (activeTool !== 'select') return
    event.stopPropagation()
    fieldRef.current?.focus({ preventScroll: true })
    setSelectedDrawing({ type, id })
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedTextId(null)
    setSelectedZoneId(null)
  }

  function handleDrawingPointerDown(event, type, drawing, indices = null) {
    if (activeTool !== 'select' || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const rect = fieldRef.current?.getBoundingClientRect()
    const anchor = drawingAnchor(drawing)
    if (!rect || !anchor) return
    const isFreeLine = type === 'line' && !drawing.motionId && !drawing.blockId && !drawing.anchorId
    const movableIndices = isFreeLine ? indices : indices?.filter((index) => index !== 0)
    if (movableIndices?.length === 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    fieldRef.current.focus({ preventScroll: true })
    setSelectedDrawing({ type, id: drawing.id })
    setSelectedId(null)
    setMultiSelectedIds([])
    setSelectedTextId(null)
    setSelectedZoneId(null)
    setPathDrag({
      type,
      id: drawing.id,
      indices: movableIndices,
      isFreeLine,
      start: { x: (event.clientX - rect.left) / rect.width * 100, y: (event.clientY - rect.top) / rect.height * 100 },
      points: [anchor, ...drawing.points.map((point) => ({ x: anchor.x + point.dx, y: anchor.y + point.dy }))],
    })
  }

  function handleBlockCapClick(event, drawing) {
    if (!BLOCK_ANCHOR_TOOLS.has(activeTool) || activeChain) {
      handleDrawingClick(event, 'block', drawing.id)
      return
    }
    event.stopPropagation()
    setActiveChain({ type: activeTool, blockId: drawing.id, points: [] })
    setSelectedDrawing(null)
    setCursorPos(null)
  }

  function handleMotionCapClick(event, drawing) {
    if (activeChain) {
      event.stopPropagation()
      return
    }
    if (!MOTION_CAP_ANCHOR_TOOLS.has(activeTool)) {
      handleDrawingClick(event, 'motion', drawing.id)
      return
    }
    event.stopPropagation()
    setActiveChain({ type: activeTool, motionId: drawing.id, points: [] })
    setSelectedDrawing(null)
    setCursorPos(null)
  }

  function handleFieldClick(event) {
    if (suppressFieldClickRef.current) {
      suppressFieldClickRef.current = false
      return
    }
    if (activeTool === 'select') {
      // Marker/drawing clicks stop propagation, so reaching here means empty field was clicked.
      setSelectedId(null)
      setMultiSelectedIds([])
      setSelectedDrawing(null)
      setSelectedTextId(null)
      setSelectedZoneId(null)
      return
    }
    if (!activeChain) {
      if (activeTool === 'text') {
        addTextAnnotation(positionFromEvent(event))
        return
      }
      if (activeTool === 'zone') {
        addZone(positionFromEvent(event))
        return
      }
      if (activeTool === 'line') {
        setActiveChain({ type: 'line', origin: positionFromEvent(event), points: [] })
        setSelectedDrawing(null)
        setSelectedId(null)
        setMultiSelectedIds([])
        setSelectedTextId(null)
        setSelectedZoneId(null)
        setCursorPos(null)
      }
      return
    }
    const anchor = drawingAnchor(activeChain)
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
      const newDrawing = activeChain.motionId
        ? { id: crypto.randomUUID(), motionId: activeChain.motionId, points }
        : activeChain.blockId
          ? { id: crypto.randomUUID(), blockId: activeChain.blockId, points }
          : activeChain.type === 'line'
            ? { id: crypto.randomUUID(), origin: activeChain.origin, points }
            : { id: crypto.randomUUID(), anchorId: activeChain.anchorId, points }
      setDrawings((current) => ({ ...current, [activeChain.type]: [...current[activeChain.type], newDrawing] }))
      setDrawHistory((current) => [...current, { type: activeChain.type, id: newDrawing.id }])
      setRedoHistory([])
      if (activeChain.type === 'line') {
        setActiveTool('select')
        setSelectedDrawing({ type: 'line', id: newDrawing.id })
        fieldRef.current?.focus({ preventScroll: true })
      }
    }
    setActiveChain(null)
    setCursorPos(null)
  }

  function handleFieldPointerDown(event) {
    if (activeTool !== 'select' || event.button !== 0) return
    const point = positionFromEvent(event)
    setMarquee({ start: point, end: point, additive: event.shiftKey })
  }

  function handleFieldPointerMove(event) {
    if (pathDrag) {
      const point = positionFromEvent(event)
      const affected = pathDrag.points.filter((_, index) => !pathDrag.indices || pathDrag.indices.includes(index))
      const dx = Math.min(100 - Math.max(...affected.map((item) => item.x)), Math.max(-Math.min(...affected.map((item) => item.x)), point.x - pathDrag.start.x))
      const dy = Math.min(100 - Math.max(...affected.map((item) => item.y)), Math.max(-Math.min(...affected.map((item) => item.y)), point.y - pathDrag.start.y))
      const points = pathDrag.points.map((item, index) => !pathDrag.indices || pathDrag.indices.includes(index)
        ? { x: item.x + dx, y: item.y + dy }
        : item)
      const origin = points[0]
      setDrawings((current) => ({
        ...current,
        [pathDrag.type]: current[pathDrag.type].map((drawing) => drawing.id === pathDrag.id
          ? { ...drawing, ...(pathDrag.isFreeLine && { origin }), points: points.slice(1).map((item) => ({ dx: item.x - origin.x, dy: item.y - origin.y })) }
          : drawing),
      }))
      return
    }
    if (marquee) {
      if (!marquee.active) event.currentTarget.setPointerCapture(event.pointerId)
      const end = positionFromEvent(event)
      // Ignore tiny jitters so plain clicks still behave as clicks.
      const active = marquee.active || Math.hypot(end.x - marquee.start.x, end.y - marquee.start.y) > 1
      setMarquee({ ...marquee, end, active })
      return
    }
    if (groupDrag) {
      const fieldRect = fieldRef.current?.getBoundingClientRect()
      if (!fieldRect) return
      const origins = Object.values(groupDrag.origins)
      // Clamp the shared delta so no selected player leaves the field.
      const minDx = -Math.min(...origins.map((point) => point.x))
      const maxDx = 100 - Math.max(...origins.map((point) => point.x))
      const minDy = -Math.min(...origins.map((point) => point.y))
      const maxDy = 100 - Math.max(...origins.map((point) => point.y))
      const pointerX = ((event.clientX - fieldRect.left) / fieldRect.width) * 100
      const pointerY = ((event.clientY - fieldRect.top) / fieldRect.height) * 100
      const dx = Math.min(maxDx, Math.max(minDx, pointerX - groupDrag.start.x))
      const dy = Math.min(maxDy, Math.max(minDy, pointerY - groupDrag.start.y))
      setMarkers((current) =>
        current.map((marker) => {
          const origin = groupDrag.origins[marker.id]
          return origin ? { ...marker, x: origin.x + dx, y: origin.y + dy } : marker
        }),
      )
      return
    }
    if (dragId) {
      const { x, y } = positionFromEvent(event)
      setMarkers((current) => current.map((marker) => (marker.id === dragId ? { ...marker, x, y } : marker)))
      return
    }
    if (zoneDrag) {
      const { x, y } = positionFromEvent(event)
      const { origin, start, handle } = zoneDrag
      let next
      if (!handle) {
        next = {
          x: Math.min(100, Math.max(0, origin.x + x - start.x)),
          y: Math.min(100, Math.max(0, origin.y + y - start.y)),
        }
      } else {
        let left = origin.x - origin.width / 2
        let right = origin.x + origin.width / 2
        let top = origin.y - origin.height / 2
        let bottom = origin.y + origin.height / 2
        if (handle.includes('w')) left = Math.min(x, right - MIN_ZONE_SIZE)
        if (handle.includes('e')) right = Math.max(x, left + MIN_ZONE_SIZE)
        if (handle.includes('n')) top = Math.min(y, bottom - MIN_ZONE_SIZE)
        if (handle.includes('s')) bottom = Math.max(y, top + MIN_ZONE_SIZE)
        next = { x: (left + right) / 2, y: (top + bottom) / 2, width: right - left, height: bottom - top }
      }
      setZones((current) => current.map((zone) => (zone.id === zoneDrag.id ? { ...zone, ...next } : zone)))
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
    if (marquee) {
      if (marquee.active) {
        const left = Math.min(marquee.start.x, marquee.end.x)
        const right = Math.max(marquee.start.x, marquee.end.x)
        const top = Math.min(marquee.start.y, marquee.end.y)
        const bottom = Math.max(marquee.start.y, marquee.end.y)
        const inside = markers
          .filter((marker) => marker.x >= left && marker.x <= right && marker.y >= top && marker.y <= bottom)
          .map((marker) => marker.id)
        setMultiSelectedIds((current) => (marquee.additive ? [...new Set([...current, ...inside])] : inside))
        setSelectedId(null)
        setSelectedDrawing(null)
        setSelectedTextId(null)
        setSelectedZoneId(null)
        suppressFieldClickRef.current = true
      }
      setMarquee(null)
    }
    if (groupDrag) {
      setGroupDrag(null)
      setMultiSelectedIds([])
    }
    setDragId(null)
    setDragTextId(null)
    setDragTextOffset(null)
    setZoneDrag(null)
    setPathDrag(null)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape' && multiSelectedIds.length > 0) {
      setMultiSelectedIds([])
      return
    }
    if (event.key === 'Escape' && activeChain) {
      setActiveChain(null)
      setCursorPos(null)
      return
    }
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (selectedId) {
      setMarkers((current) => current.filter((marker) => marker.id !== selectedId))
      setDrawings((current) => {
        const anchoredIds = flattenDrawings(current)
          .filter((drawing) => drawing.anchorId === selectedId)
          .map((drawing) => drawing.id)
        return removeDrawingDependents(current, anchoredIds)
      })
      setSelectedId(null)
    } else if (selectedDrawing) {
      setDrawings((current) => {
        return removeDrawingDependents(current, [selectedDrawing.id])
      })
      setSelectedDrawing(null)
    } else if (selectedTextId) {
      setTextAnnotations((current) => current.filter((annotation) => annotation.id !== selectedTextId))
      setSelectedTextId(null)
      setEditingTextId(null)
    } else if (selectedZoneId) {
      setZones((current) => current.filter((zone) => zone.id !== selectedZoneId))
      setSelectedZoneId(null)
    }
  }
  function tbarCap(points) {
    return tbarCapPoints(points, fieldPxSize)
  }

  function arrowCap(points) {
    return arrowCapPoints(points, fieldPxSize)
  }

  function toolColor(tool) {
    return resolveToolColor(tool, activeTheme)
  }

  function toolDash(tool, drawing) {
    return resolveToolDash(tool, activeTheme, drawing)
  }

  const allDrawings = flattenDrawings(drawings)
  const chainAnchor = activeChain ? drawingAnchor(activeChain) : null
  const selectedMarker = markers.find((marker) => marker.id === selectedId)
  const multiSelectMode = multiSelectedIds.length > 0
  const appearanceEnabled = Boolean(selectedMarker && activeTool === 'select' && !multiSelectMode)
  const selectedPath = selectedDrawing && (drawings[selectedDrawing.type] || []).find((drawing) => drawing.id === selectedDrawing.id)
  const selectedPathTool = selectedPath && DRAWING_TOOLS.find((tool) => tool.id === selectedDrawing.type)
  const pathAppearanceVisible = Boolean(selectedPath && selectedPathTool && activeTool === 'select')
  const selectedText = textAnnotations.find((annotation) => annotation.id === selectedTextId)
  const textAppearanceVisible = Boolean(selectedText && activeTool === 'select')
  const defaultTextColor = activeTheme.fieldClass === 'printer-friendly' ? '#000000' : '#ffffff'
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId)
  const zoneAppearanceVisible = Boolean(selectedZone && activeTool === 'select')
  const isEmpty = markers.length === 0 && allDrawings.length === 0 && textAnnotations.length === 0 && zones.length === 0

  function toolButton(tool) {
    return (
      <button
        key={tool.id}
        type="button"
        className={`play-designer-tool${tool.id === 'select' ? ' select-tool' : ' path-tool'}${tool.id === activeTool ? ' active' : ''}`}
        onClick={() => {
          setActiveTool(tool.id)
          setMultiSelectedIds([])
          setActiveChain(null)
          setCursorPos(null)
        }}
        aria-pressed={tool.id === activeTool}
        aria-label={tool.id === 'dtb' ? 'Double-team To Backer' : tool.label}
        title={tool.id === 'dtb' ? 'Double-team To Backer' : tool.label}
      >
        <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
          {TOOL_ICONS[tool.id]}
        </svg>
        {tool.id === 'select' && <span>{tool.label}</span>}
      </button>
    )
  }

  return (
    <section className={`play-designer${record.kind === 'play' ? ' has-adjustment-tabs' : ''}${readOnly ? ' is-read-only' : ''}`}>
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
          readOnly={readOnly || Boolean(activeSlideId)}
        />
        <button type="button" className="play-designer-back" onClick={openSettings} disabled={readOnly} aria-label="Play settings">
          <Settings size={18} aria-hidden="true" />
        </button>
        <button type="button" className="play-designer-cancel" onClick={handleCancel} disabled={saving || !isDirty}>
          Cancel
        </button>
        <button type="button" className="play-designer-save" onClick={handleSave} disabled={readOnly || saving || !isDirty}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="data-grid-status data-grid-error">{error}</p>}
      {printOpen && (
        <PrintPreviewDialog
          play={{
            name: activeSlideId ? activeSlideTitle : name,
            markers,
            drawings,
            textAnnotations,
            zones,
            theme,
            fieldDecoration,
            fieldOrientation,
            fieldZone,
            perspective,
          }}
          onClose={() => setPrintOpen(false)}
        />
      )}
      {settingsOpen && (
        <div className="dialog-overlay" onClick={() => setSettingsOpen(false)}>
          <form className="dialog-panel" onClick={(event) => event.stopPropagation()} onSubmit={handleSettingsSave}>
            <h2><Settings size={26} strokeWidth={1.8} aria-hidden="true" />Play Settings</h2>
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
              <span>Field Zone</span>
              <select value={draftFieldZone} onChange={(event) => setDraftFieldZone(event.target.value)}>
                {FIELD_ZONES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="dialog-field">
              <span>Perspective</span>
              <select value={draftPerspective} onChange={(event) => setDraftPerspective(event.target.value)}>
                {PLAY_PERSPECTIVES.map((option) => (
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
        {toolButton(DRAWING_TOOLS[0])}
        <div className="play-designer-drawing-tools" role="group" aria-label="Path tools">
          {DRAWING_TOOLS.slice(1).filter((tool) => tool.id !== 'line').map(toolButton)}
          <div className="play-designer-history-tools" role="group" aria-label="Drawing history">
            <button
              type="button"
              className="play-designer-tool"
              onClick={undoLastDrawing}
              disabled={!canUndoDrawing}
              title="Undo"
            >
              <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                <path fill="currentColor" d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z" />
              </svg>
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="play-designer-tool"
              onClick={redoLastDrawing}
              disabled={!canRedoDrawing}
              title="Redo"
            >
              <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
                <path fill="currentColor" d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z" />
              </svg>
              <span>Redo</span>
            </button>
          </div>
        </div>
        <button
          type="button"
          className={`play-designer-tool text-tool${activeTool === 'text' ? ' active' : ''}`}
          onClick={() => startPlacementTool('text')}
          aria-pressed={activeTool === 'text'}
          title="Add Text"
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path fill="currentColor" d="M5 4h14v2h-6v14h-2V6H5z" />
          </svg>
          <span>Add Text</span>
        </button>
        <button
          type="button"
          className={`play-designer-tool zone-tool${activeTool === 'zone' ? ' active' : ''}`}
          onClick={() => startPlacementTool('zone')}
          aria-pressed={activeTool === 'zone'}
          title="Add Zone"
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <ellipse cx="12" cy="12" rx="9" ry="6" fill="currentColor" fillOpacity="0.25" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" />
          </svg>
          <span>Add Zone</span>
        </button>
        <button
          type="button"
          className={`play-designer-tool line-tool${activeTool === 'line' ? ' active' : ''}`}
          onClick={() => startPlacementTool('line')}
          aria-pressed={activeTool === 'line'}
          title="Add Line"
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path d="M5 18 12 7 19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="5" cy="18" r="2.5" fill="currentColor" />
            <circle cx="19" cy="7" r="2.5" fill="currentColor" />
          </svg>
          <span>Add Line</span>
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
                <FlipVertical2 className="menu-item-icon" aria-hidden="true" />
                Flip Horizontal
              </button>
              <button type="button" role="menuitem" onClick={() => flipPlay('vertical')}>
                <FlipHorizontal2 className="menu-item-icon" aria-hidden="true" />
                Flip Vertical
              </button>
              <button type="button" role="menuitem" onClick={restartPlay}>
                <RotateCcw className="menu-item-icon" aria-hidden="true" />
                Restart Play
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={restartAdjustment}
                disabled={!activeSlideId || saving || Boolean(removingSlideId)}
              >
                <Undo2 className="menu-item-icon" aria-hidden="true" />
                Restart Adjustment
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  setPrintOpen(true)
                }}
              >
                <Printer className="menu-item-icon" aria-hidden="true" />
                Print...
              </button>
            </div>
          )}
        </div>
      </div>
      {pathAppearanceVisible ? (
      <div className={`player-appearance-panel${selectedDrawing.type === 'line' ? ' line-appearance-panel' : ''}`} aria-label={`Appearance for ${selectedPathTool.label} path`}>
        <span className="player-label-field">{selectedPathTool.label}</span>
        <div className="player-appearance-group" role="group" aria-label="Path color">
          <button
            type="button"
            className={`player-color-reset${!selectedPath.color ? ' active' : ''}`}
            onClick={() => updateDrawingAppearance(selectedDrawing.type, selectedPath.id, { color: null })}
            aria-pressed={!selectedPath.color}
          >
            Default color
          </button>
          {PLAYER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`player-color-swatch${selectedPath.color === color ? ' active' : ''}`}
              style={{ '--swatch-color': color }}
              onClick={() => updateDrawingAppearance(selectedDrawing.type, selectedPath.id, { color })}
              aria-label={`Set path color to ${color}`}
              aria-pressed={selectedPath.color === color}
            />
          ))}
          <label className="player-custom-color" title="Custom color">
            <input
              type="color"
              value={selectedPath.color || toolColor(selectedPathTool)}
              onChange={(event) => updateDrawingAppearance(selectedDrawing.type, selectedPath.id, { color: event.target.value })}
              aria-label="Custom path color"
            />
          </label>
        </div>
        {selectedDrawing.type === 'line' && (
          <div className="player-appearance-group" role="group" aria-label="Line style">
            {['solid', 'dashed', 'dotted'].map((lineStyle) => (
              <button
                key={lineStyle}
                type="button"
                className={`player-color-reset${(selectedPath.lineStyle || 'solid') === lineStyle ? ' active' : ''}`}
                onClick={() => updateDrawingAppearance('line', selectedPath.id, { lineStyle })}
                aria-pressed={(selectedPath.lineStyle || 'solid') === lineStyle}
                title={`${lineStyle[0].toUpperCase()}${lineStyle.slice(1)} line`}
              >
                {lineStyle[0].toUpperCase()}{lineStyle.slice(1)}
              </button>
            ))}
          </div>
        )}
        {selectedDrawing.type === 'line' && ['dashed', 'dotted'].includes(selectedPath.lineStyle) && (
          <label className="player-label-field line-spacing-field">
            <span>Spacing</span>
            <input
              type="range"
              min="2"
              max="20"
              step="1"
              value={selectedPath.dashSpacing ?? 4}
              onChange={(event) => updateDrawingAppearance('line', selectedPath.id, { dashSpacing: Number(event.target.value) })}
              aria-label="Line dash spacing"
            />
            <output>{selectedPath.dashSpacing ?? 4}</output>
          </label>
        )}
      </div>
      ) : textAppearanceVisible ? (
      <div className="player-appearance-panel" aria-label="Text appearance">
        <span className="player-label-field">Text</span>
        <div className="player-appearance-group" role="group" aria-label="Text color">
          <button
            type="button"
            className={`player-color-reset${!selectedText.color ? ' active' : ''}`}
            onClick={() => updateTextAppearance(selectedText.id, { color: null })}
            aria-pressed={!selectedText.color}
          >
            Default color
          </button>
          {PLAYER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`player-color-swatch${selectedText.color === color ? ' active' : ''}`}
              style={{ '--swatch-color': color }}
              onClick={() => updateTextAppearance(selectedText.id, { color })}
              aria-label={`Set text color to ${color}`}
              aria-pressed={selectedText.color === color}
            />
          ))}
          <label className="player-custom-color" title="Custom color">
            <input
              type="color"
              value={selectedText.color || defaultTextColor}
              onChange={(event) => updateTextAppearance(selectedText.id, { color: event.target.value })}
              aria-label="Custom text color"
            />
          </label>
        </div>
        <label className="text-size-field">
          <span>Size</span>
          <select
            value={selectedText.fontSize || ''}
            onChange={(event) => updateTextAppearance(selectedText.id, { fontSize: Number(event.target.value) || null })}
            aria-label="Text size"
          >
            <option value="">Default</option>
            {TEXT_FONT_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}px
              </option>
            ))}
          </select>
        </label>
        <div className="player-appearance-group" role="group" aria-label="Text style">
          {TEXT_STYLE_TOGGLES.map((toggle) => (
            <button
              key={toggle.id}
              type="button"
              className={`text-style-toggle ${toggle.id}${selectedText[toggle.id] ? ' active' : ''}`}
              onClick={() => updateTextAppearance(selectedText.id, { [toggle.id]: !selectedText[toggle.id] })}
              aria-label={toggle.label}
              aria-pressed={Boolean(selectedText[toggle.id])}
              title={toggle.label}
            >
              {toggle.glyph}
            </button>
          ))}
        </div>
      </div>
      ) : zoneAppearanceVisible ? (
      <div className="player-appearance-panel" aria-label="Zone appearance">
        <span className="player-label-field">Zone</span>
        <div className="player-appearance-group" role="group" aria-label="Zone fill">
          {ZONE_FILLS.map((fill) => {
            const isActive = (selectedZone.fill || DEFAULT_ZONE_FILL) === fill.id
            return (
              <button
                key={fill.id}
                type="button"
                className={`player-color-swatch zone-fill-swatch ${fill.id}${isActive ? ' active' : ''}`}
                style={{ '--swatch-color': fill.color }}
                onClick={() => updateZoneAppearance(selectedZone.id, { fill: fill.id })}
                aria-label={`${fill.label} fill`}
                aria-pressed={isActive}
                title={fill.label}
              />
            )
          })}
        </div>
        <div className="player-appearance-group" role="group" aria-label="Zone shape">
          {ZONE_SHAPES.map((shape) => {
            const isActive = (selectedZone.shape || 'oval') === shape.id
            return (
              <button
                key={shape.id}
                type="button"
                className={`text-style-toggle box${isActive ? ' active' : ''}`}
                onClick={() => updateZoneAppearance(selectedZone.id, { shape: shape.id })}
                aria-pressed={isActive}
                title={shape.label}
              >
                {shape.label}
              </button>
            )
          })}
        </div>
        <div className="player-appearance-group" role="group" aria-label="Zone border">
          <button
            type="button"
            className={`text-style-toggle box${selectedZone.border !== false ? ' active' : ''}`}
            onClick={() => updateZoneAppearance(selectedZone.id, { border: selectedZone.border === false })}
            aria-pressed={selectedZone.border !== false}
            title="Show border"
          >
            Border
          </button>
        </div>
      </div>
      ) : (
      <div
        className={`player-appearance-panel${appearanceEnabled ? '' : ' disabled'}`}
        aria-label={appearanceEnabled ? `Appearance for ${selectedMarker.label || 'player'}` : 'Player appearance'}
        aria-disabled={!appearanceEnabled}
      >
        <label className="player-label-field">
          <span>Player</span>
          <input
            type="text"
            value={selectedMarker?.label ?? ''}
            onChange={(event) => updateMarkerAppearance(selectedMarker.id, { label: event.target.value })}
            aria-label="Player label"
            disabled={!appearanceEnabled}
          />
        </label>
        <div className="player-appearance-group" role="group" aria-label="Player color">
          <button
            type="button"
            className={`player-color-reset${appearanceEnabled && !selectedMarker.color ? ' active' : ''}`}
            onClick={() => updateMarkerAppearance(selectedMarker.id, { color: null })}
            aria-pressed={appearanceEnabled && !selectedMarker.color}
            disabled={!appearanceEnabled}
          >
            Team color
          </button>
          {PLAYER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`player-color-swatch${appearanceEnabled && selectedMarker.color === color ? ' active' : ''}`}
              style={{ '--swatch-color': color }}
              onClick={() => updateMarkerAppearance(selectedMarker.id, { color })}
              aria-label={`Set player color to ${color}`}
              aria-pressed={appearanceEnabled && selectedMarker.color === color}
              disabled={!appearanceEnabled}
            />
          ))}
          <label className="player-custom-color" title="Custom color">
            <input
              type="color"
              value={selectedMarker?.color || (selectedMarker?.team === 'defense' ? '#b91c1c' : '#1d4ed8')}
              onChange={(event) => updateMarkerAppearance(selectedMarker.id, { color: event.target.value })}
              aria-label="Custom player color"
              disabled={!appearanceEnabled}
            />
          </label>
        </div>
        <div className="player-appearance-group" role="group" aria-label="Player decoration">
          {PLAYER_DECORATIONS.map((decoration) => {
            const isActive = appearanceEnabled && (selectedMarker.decoration || 'solid') === decoration.id
            const previewColor = selectedMarker?.color || (selectedMarker?.team === 'defense' ? '#b91c1c' : '#1d4ed8')
            return (
              <button
                key={decoration.id}
                type="button"
                className={`player-decoration-option ${decoration.id}${isActive ? ' active' : ''}`}
                style={decorationPreviewVars(previewColor)}
                onClick={() => updateMarkerAppearance(selectedMarker.id, { decoration: decoration.id })}
                aria-label={decoration.label}
                aria-pressed={isActive}
                title={decoration.label}
                disabled={!appearanceEnabled}
              />
            )
          })}
        </div>
      </div>
      )}
      <div
        ref={fieldRef}
        id="play-designer-field"
        className={`play-designer-field${activeTool !== 'select' ? ' drawing' : ''}${themeClass}${fieldDecorationClass} zone-windowed`}
        onClick={handleFieldClick}
        onDoubleClick={handleFieldDoubleClick}
        onPointerDown={handleFieldPointerDown}
        onPointerMove={handleFieldPointerMove}
        onPointerUp={handleFieldPointerUp}
        onPointerLeave={() => { if (!pathDrag) handleFieldPointerUp() }}
        onPointerCancel={handleFieldPointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Play field"
      >
        <span className="play-designer-los-line" style={{ top: `${losPercent}%` }} aria-hidden="true" />
        {endZoneBands.map((band) => (
          <div
            key={`${band.top}-${band.height}`}
            className="play-designer-end-zone"
            style={{ top: `${band.top}%`, height: `${band.height}%` }}
            aria-hidden="true"
          />
        ))}
        {goalLinePositions.map((top) => (
          <span key={top} className="play-designer-goal-line" style={{ top: `${top}%` }} aria-hidden="true" />
        ))}
        {showHashMarks && (
          <div className="play-designer-hash-marks" aria-hidden="true">
            {hashYPositions.flatMap((top) =>
              hashXPositions.map((left, index) => (
                <span
                  key={`${top}-${left}`}
                  className={`play-designer-hash-mark${index === 0 || index === hashXPositions.length - 1 ? ' sideline' : ''}`}
                  style={{ left: `${left}%`, top: `${top}%` }}
                />
              )),
            )}
          </div>
        )}
        {showYardNumbers &&
          yardNumbers.map((number) =>
            yardNumberX.map((left, side) => (
              <span key={`${number.yard}-${left}`}>
                <span
                  className={`play-designer-yard-number ${side === 0 ? 'left' : 'right'}`}
                  style={{ left: `${left}%`, top: `${number.percent}%` }}
                  aria-hidden="true"
                >
                  {number.label}
                </span>
                {number.arrow && (
                  <span
                    className={`play-designer-yard-arrow ${number.arrow}`}
                    style={{ left: `${left}%`, top: `${number.percent}%` }}
                    aria-hidden="true"
                  >
                    {number.arrow === 'up' ? '▲' : '▼'}
                  </span>
                )}
              </span>
            )),
          )}
        {isEmpty && (
          <p className="play-designer-hint">
            Drag players to reposition them. Pick a tool, click a player to anchor a line, click to add
            segments, and double-click to finish.
          </p>
        )}
        {zones.map((zone) => {
          const isSelected = zone.id === selectedZoneId && activeTool === 'select'
          return (
            <div
              key={zone.id}
              className={`play-designer-zone${isSelected ? ' selected' : ''}`}
              style={zoneBoxStyle(zone)}
            >
              <div
                className={`play-designer-zone-shape${zone.shape === 'rectangle' ? ' rectangle' : ''}${zone.border === false ? ' no-border' : ''}`}
                style={{ background: zoneFillColor(zone) }}
                onPointerDown={(event) => handleZonePointerDown(event, zone)}
                onClick={(event) => event.stopPropagation()}
                aria-label="Zone"
              />
              {isSelected &&
                ZONE_HANDLES.map((handle) => (
                  <span
                    key={handle.id}
                    className={`play-designer-zone-handle ${handle.id}`}
                    style={{ left: `${handle.left}%`, top: `${handle.top}%` }}
                    onPointerDown={(event) => handleZonePointerDown(event, zone, handle.id)}
                    onClick={(event) => event.stopPropagation()}
                    aria-label={`Resize zone ${handle.id}`}
                  />
                ))}
            </div>
          )
        })}
        {textAnnotations.map((annotation) => {
          const isSelected = annotation.id === selectedTextId
          const annotationWidth = textAnnotationWidth(annotation, fieldRef.current)
          return (
            <div
              key={annotation.id}
              className={`play-designer-text-annotation-wrap${isSelected ? ' selected' : ''}`}
              style={{ left: `${annotation.x}%`, top: `${annotation.y}%` }}
            >
              <textarea
                className={`play-designer-text-annotation${annotation.box ? ' boxed' : ''}${isSelected ? ' selected' : ''}`}
                style={{ width: `${annotationWidth}px`, ...textAnnotationStyle(annotation) }}
                value={annotation.text}
                rows={(annotation.text || '').split('\n').length}
                wrap="off"
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
              {isSelected && (
                <button
                  type="button"
                  className="play-designer-text-delete"
                  aria-label="Delete text annotation"
                  title="Delete text annotation"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    setTextAnnotations((current) => current.filter((item) => item.id !== annotation.id))
                    setSelectedTextId(null)
                    setEditingTextId(null)
                  }}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              )}
            </div>
          )
        })}
        <svg className="play-designer-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {allDrawings.map((drawing) => {
            const anchor = drawingAnchor(drawing)
            if (!anchor) return null
            const tool = DRAWING_TOOLS.find((t) => t.id === drawing.type)
            const points = [
              { x: anchor.x, y: anchor.y },
              ...drawing.points.map((p) => ({ x: anchor.x + p.dx, y: anchor.y + p.dy })),
            ]
            const renderedPoints = tool.id === 'motion' ? motionPathPoints(points, fieldPxSize) : points
            const playerStart = drawing.anchorId && !drawing.blockId && !drawing.motionId && !drawing.origin
              ? fixedSizeEllipse(anchor, fieldPxSize, 14)
              : null
            const maskId = `${drawingMaskId}-${drawing.id}`
            const isSelected = selectedDrawing?.type === drawing.type && selectedDrawing?.id === drawing.id
            const color = drawing.color || toolColor(tool)
            const cap = tool.endCap === 'tbar' ? tbarCap(points) : null
            const arrow = tool.arrow ? arrowCap(points) : null
            const motionCap = tool.id === 'motion' && points.length > 1
              ? fixedSizeEllipse(points.at(-1), fieldPxSize, MOTION_CAP_RADIUS_PX)
              : null
            return (
              <g key={drawing.id} className={isSelected ? 'play-designer-drawing selected' : 'play-designer-drawing'} mask={playerStart ? `url(#${maskId})` : undefined}>
                {playerStart && (
                  <defs>
                    <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style={{ maskType: 'luminance' }}>
                      <rect width="100" height="100" fill="white" />
                      <ellipse {...playerStart} fill="black" />
                    </mask>
                  </defs>
                )}
                {isSelected && (
                  <g className="play-designer-selection-halo">
                    <path d={pathData(renderedPoints)} />
                    {cap && <line x1={cap.x1} y1={cap.y1} x2={cap.x2} y2={cap.y2} />}
                    {arrow && <polygon points={arrow} />}
                    {motionCap && <ellipse {...motionCap} />}
                  </g>
                )}
                <path
                  className={`play-designer-route${isSelected ? ' selected' : ''}`}
                  d={pathData(tool.id === 'blitz' ? renderedPoints.slice(0, 2) : renderedPoints)}
                  stroke={color}
                  strokeDasharray={tool.id === 'blitz' ? BLITZ_FIRST_SEGMENT_DASH : toolDash(tool, drawing) || undefined}
                  strokeLinecap={tool.id === 'dtb' || (tool.id === 'line' && drawing.lineStyle === 'dotted') ? 'round' : undefined}
                  strokeLinejoin={tool.id === 'line' ? 'round' : undefined}
                  onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                />
                <path
                  className="play-designer-path-hit"
                  d={pathData(points)}
                  onPointerDown={(event) => handleDrawingPointerDown(event, drawing.type, drawing)}
                  onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                />
                {tool.id === 'blitz' && points.length > 2 && (
                  <path
                    className={`play-designer-route${isSelected ? ' selected' : ''}`}
                    d={pathData(points.slice(1))}
                    stroke={color}
                    onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                  />
                )}
                {cap && (
                  <>
                    <line
                      className={`play-designer-block-cap${drawing.type === 'block' && hoveredBlockCapId === drawing.id && BLOCK_ANCHOR_TOOLS.has(activeTool) && !activeChain ? ' anchor-hover' : ''}`}
                      x1={cap.x1}
                      y1={cap.y1}
                      x2={cap.x2}
                      y2={cap.y2}
                      stroke={color}
                      strokeWidth={TBAR_THICKNESS_PX}
                      vectorEffect="non-scaling-stroke"
                      onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                    />
                    {drawing.type === 'block' && (
                      <line
                        x1={cap.x1}
                        y1={cap.y1}
                        x2={cap.x2}
                        y2={cap.y2}
                        stroke="transparent"
                        strokeWidth={16}
                        vectorEffect="non-scaling-stroke"
                        pointerEvents="stroke"
                        onPointerEnter={() => {
                          if (BLOCK_ANCHOR_TOOLS.has(activeTool) && !activeChain) setHoveredBlockCapId(drawing.id)
                        }}
                        onPointerLeave={() => setHoveredBlockCapId(null)}
                        onClick={(event) => handleBlockCapClick(event, drawing)}
                      />
                    )}
                  </>
                )}
                {arrow && (
                  <polygon
                    points={arrow}
                    fill={color}
                    onClick={(event) => handleDrawingClick(event, drawing.type, drawing.id)}
                  />
                )}
                {motionCap && <ellipse {...motionCap} fill={color} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
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
            const renderedPoints = tool.id === 'motion' ? motionPathPoints(points, fieldPxSize) : points
            const playerStart = activeChain.anchorId && !activeChain.blockId && !activeChain.motionId && !activeChain.origin
              ? fixedSizeEllipse(chainAnchor, fieldPxSize, 14)
              : null
            const maskId = `${drawingMaskId}-preview`
            const cap = tool.endCap === 'tbar' ? tbarCap(points) : null
            const arrow = tool.arrow ? arrowCap(points) : null
            const motionCap = tool.id === 'motion' && points.length > 1
              ? fixedSizeEllipse(points.at(-1), fieldPxSize, MOTION_CAP_RADIUS_PX)
              : null
            return (
              <g mask={playerStart ? `url(#${maskId})` : undefined}>
                {playerStart && (
                  <defs>
                    <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style={{ maskType: 'luminance' }}>
                      <rect width="100" height="100" fill="white" />
                      <ellipse {...playerStart} fill="black" />
                    </mask>
                  </defs>
                )}
                <path
                  d={pathData(tool.id === 'blitz' ? renderedPoints.slice(0, 2) : renderedPoints)}
                  stroke={toolColor(tool)}
                  strokeDasharray={tool.id === 'blitz' ? BLITZ_FIRST_SEGMENT_DASH : toolDash(tool) || undefined}
                  strokeLinecap={tool.id === 'dtb' ? 'round' : undefined}
                  strokeLinejoin={tool.id === 'line' ? 'round' : undefined}
                  className="play-designer-route preview"
                />
                {tool.id === 'blitz' && points.length > 2 && (
                  <path
                    d={pathData(points.slice(1))}
                    stroke={toolColor(tool)}
                    className="play-designer-route preview"
                  />
                )}
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
                {motionCap && <ellipse {...motionCap} fill={toolColor(tool)} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
              </g>
            )
          })()}
        </svg>
        {!activeChain && MOTION_CAP_ANCHOR_TOOLS.has(activeTool) && (
          <div className="play-designer-motion-cap-controls">
            {drawings.motion.map((drawing) => {
              const anchor = drawingAnchor(drawing)
              const end = drawing.points.at(-1)
              if (!anchor || !end) return null
              const endpoint = { x: anchor.x + end.dx, y: anchor.y + end.dy }
              return (
                <button
                  key={drawing.id}
                  type="button"
                  className="play-designer-motion-cap-hit"
                  style={{ left: `${endpoint.x}%`, top: `${endpoint.y}%` }}
                  aria-label="Start path from Motion endpoint"
                  title="Start path from Motion endpoint"
                  onClick={(event) => handleMotionCapClick(event, drawing)}
                />
              )
            })}
          </div>
        )}
        {pathAppearanceVisible && (() => {
          const anchor = drawingAnchor(selectedPath)
          if (!anchor) return null
          const points = [anchor, ...selectedPath.points.map((point) => ({
            x: anchor.x + point.dx,
            y: anchor.y + point.dy,
          }))]
          const label = selectedPathTool.label.toLowerCase()
          return (
            <div className="play-designer-line-controls">
              {points.slice(1).map((point, index) => (
                <span
                  key={`segment-${index}`}
                  className="play-designer-line-handle segment"
                  style={{ left: `${(points[index].x + point.x) / 2}%`, top: `${(points[index].y + point.y) / 2}%` }}
                  aria-label={`Move ${label} segment ${index + 1}`}
                  onPointerDown={(event) => handleDrawingPointerDown(event, selectedDrawing.type, selectedPath, [index, index + 1])}
                  onClick={(event) => handleDrawingClick(event, selectedDrawing.type, selectedPath.id)}
                />
              ))}
              {points.map((point, index) => (index === 0 && selectedDrawing.type !== 'line' ? null : (
                <span
                  key={`vertex-${index}`}
                  className="play-designer-line-handle"
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  aria-label={`Reshape ${label} point ${index + 1}`}
                  onPointerDown={(event) => handleDrawingPointerDown(event, selectedDrawing.type, selectedPath, [index])}
                  onClick={(event) => handleDrawingClick(event, selectedDrawing.type, selectedPath.id)}
                />
              )))}
            </div>
          )
        })()}
        {markers.map((marker) => {
          const animation = playerAnimation?.players[marker.id]
          const progress = playerAnimation?.progress || 0
          const easedProgress = progress * progress * (3 - 2 * progress)
          const displayMarker = animation
            ? {
                ...marker,
                x: animation.fromX + (animation.toX - animation.fromX) * easedProgress,
                y: animation.fromY + (animation.toY - animation.fromY) * easedProgress,
              }
            : marker
          return (
            <button
              key={marker.id}
              type="button"
              className={`play-designer-marker ${marker.team || 'offense'} ${marker.decoration || 'solid'}${marker.color ? ' color-override' : ''}${marker.id === selectedId || multiSelectedIds.includes(marker.id) ? ' selected' : ''}${PATH_ANCHOR_TOOLS.has(activeTool) ? ' anchorable' : ''}${themeClass}`}
              style={markerStyleVars(displayMarker)}
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onPointerDown={(event) => handleMarkerPointerDown(event, marker.id)}
              onClick={(event) => handleMarkerClick(event, marker.id)}
              aria-label="Player marker"
            >
              {marker.label}
            </button>
          )
        })}
        {marquee?.active && (
          <div
            className="play-designer-marquee"
            style={{
              left: `${Math.min(marquee.start.x, marquee.end.x)}%`,
              top: `${Math.min(marquee.start.y, marquee.end.y)}%`,
              width: `${Math.abs(marquee.end.x - marquee.start.x)}%`,
              height: `${Math.abs(marquee.end.y - marquee.start.y)}%`,
            }}
            aria-hidden="true"
          />
        )}
      </div>
      {record.kind === 'play' && (
        <>
          <div className={`play-designer-slides${themeClass}`} aria-busy={slidesLoading}>
            <div className="play-designer-sheet-tabs" role="tablist" aria-label="Play adjustments">
              <button
                type="button"
                role="tab"
                aria-selected={!activeSlideId}
                aria-controls="play-designer-field"
                className={`play-designer-tab${!activeSlideId ? ' active' : ''}`}
                onClick={() => activateSlide(null)}
                disabled={saving || Boolean(removingSlideId)}
                title={name || 'Saved play'}
              >
                {name || 'Untitled Play'}
              </button>
            {slides.map((slide, index) => {
              const title = slideDraftTitles[slide.id] || slide.title || `Adjustment ${index + 1}`
              const isActive = slide.id === activeSlideId
              return (
                <div className={`play-designer-tab-item${isActive ? ' active' : ''}`} key={slide.id}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="play-designer-field"
                    className="play-designer-tab"
                    onClick={() => activateSlide(slide.id)}
                    disabled={saving || Boolean(removingSlideId)}
                    title={title}
                  >
                    <span>{title}</span>
                  </button>
                  <button
                    type="button"
                    className="play-designer-tab-action"
                    aria-label={`Run ${title}`}
                    title={`Run ${title}`}
                    onClick={() => runAdjustment(slide)}
                    disabled={saving || Boolean(removingSlideId)}
                  >
                    <Play size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="play-designer-tab-action"
                    aria-label={`Rename ${title}`}
                    title={`Rename ${title}`}
                    onClick={() => {
                      activateSlide(slide.id)
                      setEditingSlideId(slide.id)
                    }}
                    disabled={readOnly || saving || Boolean(removingSlideId)}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="play-designer-tab-action remove"
                    aria-label={`Delete ${title}`}
                    title={`Delete ${title}`}
                    onClick={() => handleDeleteAdjustment(slide)}
                    disabled={readOnly || !canDelete || saving || removingSlideId === slide.id}
                  >
                    <X size={15} aria-hidden="true" />
                  </button>
                </div>
              )
            })}
              <button
                type="button"
                className="play-designer-tab play-designer-add-adjustment"
                onClick={handleAddAdjustment}
                disabled={readOnly || slidesLoading || slidesLoadError || saving || slides.length >= MAX_ADJUSTMENT_SLIDES}
                title={slides.length >= MAX_ADJUSTMENT_SLIDES ? 'Maximum of 3 adjustments' : 'Add an adjustment slide'}
                aria-label={slides.length >= MAX_ADJUSTMENT_SLIDES ? 'Maximum of 3 adjustments reached' : 'Add Adjustment'}
              >
                <Plus size={15} aria-hidden="true" />
                <span>Add Adjustment</span>
              </button>
            </div>
          </div>
          {editingSlideId && activeSlideId === editingSlideId && (
            <div className="play-designer-rename-adjustment">
              <label htmlFor="adjustment-slide-title">Adjustment name</label>
              <input
                id="adjustment-slide-title"
                value={activeSlideTitle}
                maxLength={80}
                autoFocus
                onChange={(event) => {
                  const title = event.target.value
                  setActiveSlideTitle(title)
                  setSlideDraftTitles((current) => ({ ...current, [editingSlideId]: title }))
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') setEditingSlideId(null)
                }}
              />
              <button type="button" className="play-designer-tab-action" onClick={() => setEditingSlideId(null)} aria-label="Finish renaming">
                <Check size={16} aria-hidden="true" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}
