// Shared field geometry used by both the interactive designer and the read-only print renderer.

// Fixed on-screen size (px) for the block tool's perpendicular endcap, independent of field scaling.
export const TBAR_LENGTH_PX = 12
export const TBAR_THICKNESS_PX = 3

// Fixed on-screen size (px) for route/blitz/coverage arrowheads, independent of field scaling.
export const ARROW_LENGTH_PX = 9
export const ARROW_WIDTH_PX = 11
export const BLITZ_FIRST_SEGMENT_DASH = '6 4'

const FIELD_WIDTH_FEET = 160
const SIDELINE_HASH_MARK_PERCENT = 0
const HASH_MARK_DISTANCE_FEET = {
  'High School': 53 + 4 / 12,
  NCAA: 60,
  NFL: 70 + 9 / 12,
}
const YARD_NUMBER_HEIGHT_FEET = 6
// Distance from the sideline to the bottom edge of the painted yard numbers. NFL numbers sit
// further from the sideline (bottom edge 36ft out) than NCAA/NFHS numbers (bottom edge 21ft out).
const YARD_NUMBER_BOTTOM_EDGE_FEET = {
  'High School': 21,
  NCAA: 21,
  NFL: 36,
}

export const HASH_MARK_Y_POSITIONS = Array.from({ length: 8 }, (_, band) =>
  [2.5, 5, 7.5, 10].map((offset) => band * 12.5 + offset),
).flat()

export function hashMarkXPositions(fieldOrientation) {
  const feet = HASH_MARK_DISTANCE_FEET[fieldOrientation] || HASH_MARK_DISTANCE_FEET['High School']
  const percent = (feet / FIELD_WIDTH_FEET) * 100
  return [SIDELINE_HASH_MARK_PERCENT, percent, 100 - percent, 100 - SIDELINE_HASH_MARK_PERCENT]
}

// Horizontal position (percent from each sideline) of the yard numbers, centered on the painted
// number's footprint for the given field orientation (NFL numbers sit closer to midfield).
export function yardNumberXPositions(fieldOrientation) {
  const bottomEdgeFeet = YARD_NUMBER_BOTTOM_EDGE_FEET[fieldOrientation] ?? YARD_NUMBER_BOTTOM_EDGE_FEET['High School']
  const centerFeet = bottomEdgeFeet + YARD_NUMBER_HEIGHT_FEET / 2
  const percent = (centerFeet / FIELD_WIDTH_FEET) * 100
  return [percent, 100 - percent]
}

// Field Zone determines where the line of scrimmage sits on the full field (yards measured from
// the defense's goal line at 0 to the offense's goal line at 100) when yard numbers are shown.
export const FIELD_ZONES = ['Green Zone', 'Yellow Zone', 'Red Zone', 'Gold Zone']
export const DEFAULT_FIELD_ZONE = FIELD_ZONES[0]
export const PLAY_PERSPECTIVES = ['Offense on Top', 'Offense on bottom']
export const DEFAULT_PLAY_PERSPECTIVE = PLAY_PERSPECTIVES[0]

export function defaultPlayPerspective(category) {
  return category === 'Offense' ? PLAY_PERSPECTIVES[1] : PLAY_PERSPECTIVES[0]
}

function screenFieldPercent(percent, perspective) {
  return perspective === PLAY_PERSPECTIVES[0] ? 100 - percent : percent
}

const FIELD_LENGTH_YARDS = 100
const END_ZONE_YARDS = 10
const WINDOW_YARDS = 40 // matches the 8 alternating 5-yard bands painted on the field background

const FIELD_ZONE_LOS_YARDS = {
  'Green Zone': 60, // offense's own 40 yard line
  'Yellow Zone': FIELD_LENGTH_YARDS - 5, // offense's own 5 yard line
  'Red Zone': 15, // defense's 15 yard line
  'Gold Zone': 5, // defense's 5 yard line
}

const FIELD_ZONE_WINDOW_YARDS = {
  'Green Zone': { defenseSide: 25, offenseSide: 15 },
  'Red Zone': { defenseSide: 25, offenseSide: 15 },
}

export function fieldZoneLosYards(fieldZone) {
  return FIELD_ZONE_LOS_YARDS[fieldZone] ?? FIELD_ZONE_LOS_YARDS[DEFAULT_FIELD_ZONE]
}

// Computes the visible 40-yard window (absolute field yards, defense goal line = 0) for a Field
// Zone. The line of scrimmage stays centered unless that would reveal space beyond the end
// zones, in which case the window shifts just enough to stay within the playable field.
export function fieldWindowForZone(fieldZone, perspective = DEFAULT_PLAY_PERSPECTIVE) {
  const los = fieldZoneLosYards(fieldZone)
  const minTop = -END_ZONE_YARDS
  const maxBottom = FIELD_LENGTH_YARDS + END_ZONE_YARDS
  const zoneWindow = FIELD_ZONE_WINDOW_YARDS[fieldZone]
  let top = los - (zoneWindow?.defenseSide ?? WINDOW_YARDS / 2)
  let bottom = los + (zoneWindow?.offenseSide ?? WINDOW_YARDS / 2)
  if (top < minTop) {
    bottom += minTop - top
    top = minTop
  } else if (bottom > maxBottom) {
    top -= bottom - maxBottom
    bottom = maxBottom
  }
  return { top, bottom, los, losPercent: screenFieldPercent(((los - top) / WINDOW_YARDS) * 100, perspective) }
}

// Yard-line markers (0..100 in 10-yard steps) visible within the window, using standard football
// numbering counted from the nearer goal line. Goal lines are labeled "G"; every other marker
// points an arrow toward its nearer goal line (none at midfield, where both are equidistant).
export function yardNumbersForWindow(window, perspective = DEFAULT_PLAY_PERSPECTIVE) {
  const numbers = []
  for (let yard = 0; yard <= FIELD_LENGTH_YARDS; yard += 10) {
    if (yard < window.top || yard > window.bottom) continue
    const isGoalLine = yard === 0 || yard === FIELD_LENGTH_YARDS
    const label = isGoalLine ? 'G' : yard <= 50 ? yard : FIELD_LENGTH_YARDS - yard
    let arrow = isGoalLine || yard === 50 ? null : yard < 50 ? 'up' : 'down'
    if (perspective === PLAY_PERSPECTIVES[0] && arrow) arrow = arrow === 'up' ? 'down' : 'up'
    const percent = ((yard - window.top) / WINDOW_YARDS) * 100
    numbers.push({ yard, percent: screenFieldPercent(percent, perspective), label, arrow })
  }
  return numbers
}

// Un-hashed, un-numbered end zone bands visible within the window, as top/height percentages.
export function endZoneBandsForWindow(window, perspective = DEFAULT_PLAY_PERSPECTIVE) {
  const bands = []
  const candidates = [
    { start: -END_ZONE_YARDS, end: 0 },
    { start: FIELD_LENGTH_YARDS, end: FIELD_LENGTH_YARDS + END_ZONE_YARDS },
  ]
  for (const band of candidates) {
    const start = Math.max(band.start, window.top)
    const end = Math.min(band.end, window.bottom)
    if (end > start) {
      const top = ((start - window.top) / WINDOW_YARDS) * 100
      const height = ((end - start) / WINDOW_YARDS) * 100
      bands.push({ top: perspective === PLAY_PERSPECTIVES[0] ? 100 - top - height : top, height })
    }
  }
  return bands
}

export function goalLinePositionsForWindow(window, perspective = DEFAULT_PLAY_PERSPECTIVE) {
  return [0, FIELD_LENGTH_YARDS]
    .filter((yard) => yard >= window.top && yard <= window.bottom)
    .map((yard) => screenFieldPercent(((yard - window.top) / WINDOW_YARDS) * 100, perspective))
}

// Filters the fixed hash-mark tick grid down to ticks that fall on the playable field (excludes end zones).
export function hashMarkYPositionsForWindow(window, perspective = DEFAULT_PLAY_PERSPECTIVE) {
  return HASH_MARK_Y_POSITIONS.filter((percent) => {
    const yard = window.top + (percent / 100) * WINDOW_YARDS
    return yard >= 0 && yard <= FIELD_LENGTH_YARDS
  }).map((percent) => screenFieldPercent(percent, perspective))
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

// White and charcoal are handled as special guideline colors (white maps its decoration to
// charcoal for visibility) and are left out of the light-tint treatment below.
const SPECIAL_GUIDELINE_COLORS = new Set(['#ffffff', '#374151'])

// Mixes a hex color toward white to produce the lighter tint used for the non-solid portion of
// half-fill and vertical-line player decorations.
function lightenHexColor(hex, amount = 0.65) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex || '')
  if (!match) return undefined
  const num = parseInt(match[1], 16)
  const mix = (channel) => Math.round(channel + (255 - channel) * amount)
  return `#${[num >> 16, num >> 8, num]
    .map((shifted) => mix(shifted & 0xff).toString(16).padStart(2, '0'))
    .join('')}`
}

// Shared by marker rendering and the decoration-option previews so both pick the same
// solid/light pairing for a given player color.
function decorationColors(color) {
  const normalized = color?.toLowerCase()
  const isSpecial = SPECIAL_GUIDELINE_COLORS.has(normalized)
  return {
    decorationColor: normalized === '#ffffff' ? '#374151' : color,
    lightColor: color && !isSpecial ? lightenHexColor(color) : undefined,
  }
}

export function markerStyleVars(marker) {
  const color = marker.color
  const { decorationColor, lightColor } = decorationColors(color)
  return {
    left: `${marker.x}%`,
    top: `${marker.y}%`,
    '--marker-color': color,
    '--marker-decoration-color': decorationColor,
    '--marker-override-text': color?.toLowerCase() === '#ffffff' ? '#111' : '#fff',
    ...(lightColor ? { '--marker-decoration-light-color': lightColor } : {}),
  }
}

// Style vars for the small decoration-option preview buttons, so they reflect the same
// solid/light color pairing a player's marker would render with.
export function decorationPreviewVars(color) {
  const { decorationColor, lightColor } = decorationColors(color)
  return {
    '--preview-color': decorationColor,
    ...(lightColor ? { '--preview-light-color': lightColor } : {}),
  }
}
