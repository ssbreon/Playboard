// Shared field geometry used by both the interactive designer and the read-only print renderer.

// Fixed on-screen size (px) for the block tool's perpendicular endcap, independent of field scaling.
export const TBAR_LENGTH_PX = 12
export const TBAR_THICKNESS_PX = 3

// Fixed on-screen size (px) for route/blitz/coverage arrowheads, independent of field scaling.
export const ARROW_LENGTH_PX = 9
export const ARROW_WIDTH_PX = 11
export const BLITZ_FIRST_SEGMENT_DASH = '6 4'

const FIELD_WIDTH_FEET = 160
const SIDELINE_HASH_MARK_PERCENT = 1.5
const HASH_MARK_DISTANCE_FEET = {
  'High School': 53 + 4 / 12,
  NCAA: 60,
  NFL: 70 + 9 / 12,
}

export const HASH_MARK_Y_POSITIONS = Array.from({ length: 8 }, (_, band) =>
  [2.5, 5, 7.5, 10].map((offset) => band * 12.5 + offset),
).flat()

export function hashMarkXPositions(fieldOrientation) {
  const feet = HASH_MARK_DISTANCE_FEET[fieldOrientation] || HASH_MARK_DISTANCE_FEET['High School']
  const percent = (feet / FIELD_WIDTH_FEET) * 100
  return [SIDELINE_HASH_MARK_PERCENT, percent, 100 - percent, 100 - SIDELINE_HASH_MARK_PERCENT]
}

export const DRAWING_TOOLS = [
  { id: 'select', label: 'Select' },
  { id: 'block', label: 'Block', color: '#f59e0b', dash: null, arrow: false, endCap: 'tbar' },
  { id: 'dtb', label: 'DTB', color: '#f59e0b', dash: '2 4', arrow: false, endCap: 'tbar' },
  { id: 'route', label: 'Route', color: '#1d4ed8', dash: null, arrow: true },
  { id: 'blitz', label: 'Blitz', color: '#b91c1c', dash: null, arrow: true },
  { id: 'coverage', label: 'Coverage', color: '#7c3aed', dash: '2 4', arrow: true },
]

export const EMPTY_DRAWINGS = { block: [], dtb: [], route: [], blitz: [], coverage: [] }

export function normalizeDrawings(source) {
  return { ...EMPTY_DRAWINGS, ...(source || {}) }
}

export function normalizeTextAnnotations(source) {
  return Array.isArray(source) ? source : []
}

export function toolColor(tool, theme) {
  return theme.strokeColor || tool.color
}

export function toolDash(tool, theme) {
  return theme.toolDash && tool.id in theme.toolDash ? theme.toolDash[tool.id] : tool.dash
}

export function pathData(points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
}

export function drawingAnchor(drawing, drawings, markers) {
  if (drawing.blockId) {
    const block = drawings.block.find((item) => item.id === drawing.blockId)
    const player = block && markers.find((marker) => marker.id === block.anchorId)
    const end = block?.points.at(-1)
    return player && end ? { x: player.x + end.dx, y: player.y + end.dy } : null
  }
  return markers.find((marker) => marker.id === drawing.anchorId)
}

export function drawingPoints(drawing, drawings, markers) {
  const anchor = drawingAnchor(drawing, drawings, markers)
  if (!anchor) return null
  return [
    { x: anchor.x, y: anchor.y },
    ...drawing.points.map((p) => ({ x: anchor.x + p.dx, y: anchor.y + p.dy })),
  ]
}

export function flattenDrawings(drawings) {
  return Object.entries(drawings).flatMap(([type, list]) => list.map((drawing) => ({ ...drawing, type })))
}

// Computes a perpendicular cap segment (in field percent coordinates) that renders as a
// fixed-length, fixed-thickness line on screen regardless of the field's aspect ratio.
export function tbarCapPoints(points, fieldPxSize) {
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
export function arrowCapPoints(points, fieldPxSize) {
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

export function textAnnotationStyle(annotation) {
  return {
    color: annotation.color,
    fontSize: annotation.fontSize ? `${annotation.fontSize}px` : undefined,
    fontWeight: annotation.bold ? 700 : undefined,
    fontStyle: annotation.italic ? 'italic' : undefined,
    textDecoration: annotation.underline ? 'underline' : undefined,
  }
}

let measureCanvas = null

export function textAnnotationWidth(annotation, fieldEl) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas')
  const context = measureCanvas.getContext('2d')
  if (!context || !fieldEl) return 150
  const style = window.getComputedStyle(fieldEl)
  const fontSize = annotation.fontSize ? `${annotation.fontSize}px` : style.fontSize
  context.font = `${annotation.italic ? 'italic ' : ''}${annotation.bold ? '700 ' : ''}${fontSize} ${style.fontFamily}`
  return Math.max(134, Math.ceil(context.measureText(annotation.text || 'Enter text').width))
}

export function markerStyleVars(marker) {
  return {
    left: `${marker.x}%`,
    top: `${marker.y}%`,
    '--marker-color': marker.color,
    '--marker-decoration-color': marker.color?.toLowerCase() === '#ffffff' ? '#374151' : marker.color,
    '--marker-override-text': marker.color?.toLowerCase() === '#ffffff' ? '#111' : '#fff',
  }
}
