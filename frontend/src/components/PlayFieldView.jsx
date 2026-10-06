import { useEffect, useRef, useState } from 'react'
import { getTheme } from '../utils/themes'
import {
  DEFAULT_PLAY_PERSPECTIVE,
  BLITZ_FIRST_SEGMENT_DASH,
  DRAWING_TOOLS,
  TBAR_THICKNESS_PX,
  arrowCapPoints,
  drawingPoints,
  endZoneBandsForWindow,
  fixedSizeEllipse,
  goalLinePositionsForWindow,
  fieldWindowForZone,
  flattenDrawings,
  hashMarkXPositions,
  hashMarkYPositionsForWindow,
  markerStyleVars,
  normalizeDrawings,
  normalizeTextAnnotations,
  normalizeZones,
  motionPathPoints,
  pathData,
  tbarCapPoints,
  textAnnotationStyle,
  textAnnotationWidth,
  toolColor,
  toolDash,
  yardNumberXPositions,
  yardNumbersForWindow,
  zoneBoxStyle,
  zoneFillColor,
} from '../utils/playGeometry'

/** Read-only rendering of a play's field, markers, drawings and text. Used for print output. */
export function PlayFieldView({ play, className = '' }) {
  const fieldRef = useRef(null)
  const [fieldPxSize, setFieldPxSize] = useState({ width: 100, height: 100 })

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

  const markers = play.markers || []
  const drawings = normalizeDrawings(play.drawings)
  const textAnnotations = normalizeTextAnnotations(play.textAnnotations)
  const zones = normalizeZones(play.zones)
  const theme = getTheme(play.theme)
  const themeClass = theme.fieldClass ? ` ${theme.fieldClass}` : ''
  const noFieldDecoration = !play.fieldDecoration || play.fieldDecoration === 'None'
  const fieldDecorationClass = noFieldDecoration ? ' no-field-decoration' : ''
  const perspective = play.perspective || DEFAULT_PLAY_PERSPECTIVE
  const showHashMarks = Boolean(play.fieldDecoration) && play.fieldDecoration !== 'None'
  const showYardNumbers = play.fieldDecoration === 'Hash Marks and Numbers'
  const xPositions = hashMarkXPositions(play.fieldOrientation)
  const fieldWindow = fieldWindowForZone(play.fieldZone, perspective)
  const yPositions = hashMarkYPositionsForWindow(fieldWindow, perspective)
  const yardNumbers = showYardNumbers ? yardNumbersForWindow(fieldWindow, perspective) : []
  const yardNumberX = yardNumberXPositions(play.fieldOrientation)
  const endZoneBands = showYardNumbers ? endZoneBandsForWindow(fieldWindow, perspective) : []
  const goalLinePositions = showYardNumbers ? goalLinePositionsForWindow(fieldWindow, perspective) : []
  const losPercent = fieldWindow.losPercent

  return (
    <div
      ref={fieldRef}
      className={`play-designer-field play-field-view${themeClass}${fieldDecorationClass} zone-windowed ${className}`.trim()}
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
          {yPositions.flatMap((top) =>
            xPositions.map((left, index) => (
              <span
                key={`${top}-${left}`}
                className={`play-designer-hash-mark${index === 0 || index === xPositions.length - 1 ? ' sideline' : ''}`}
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
      {zones.map((zone) => (
        <div key={zone.id} className="play-designer-zone" style={zoneBoxStyle(zone)} aria-hidden="true">
          <div
            className={`play-designer-zone-shape${zone.shape === 'rectangle' ? ' rectangle' : ''}${zone.border === false ? ' no-border' : ''}`}
            style={{ background: zoneFillColor(zone) }}
          />
        </div>
      ))}
      {textAnnotations.map((annotation) => (
        <span
          key={annotation.id}
          className={`play-designer-text-annotation${annotation.box ? ' boxed' : ''}`}
          style={{
            left: `${annotation.x}%`,
            top: `${annotation.y}%`,
            width: `${textAnnotationWidth(annotation, fieldRef.current)}px`,
            ...textAnnotationStyle(annotation),
          }}
        >
          {annotation.text}
        </span>
      ))}
      <svg className="play-designer-routes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {flattenDrawings(drawings).map((drawing) => {
          const points = drawingPoints(drawing, drawings, markers)
          if (!points) return null
          const tool = DRAWING_TOOLS.find((t) => t.id === drawing.type)
          const color = drawing.color || toolColor(tool, theme)
          const renderedPoints = tool.id === 'motion' ? motionPathPoints(points, fieldPxSize) : points
          const cap = tool.endCap === 'tbar' ? tbarCapPoints(points, fieldPxSize) : null
          const arrow = tool.arrow ? arrowCapPoints(points, fieldPxSize) : null
          const motionCap = tool.id === 'motion' ? fixedSizeEllipse(points.at(-1), fieldPxSize, 3.5) : null
          return (
            <g key={drawing.id}>
              <path
                className="play-designer-route"
                d={pathData(tool.id === 'blitz' ? renderedPoints.slice(0, 2) : renderedPoints)}
                stroke={color}
                strokeDasharray={tool.id === 'blitz' ? BLITZ_FIRST_SEGMENT_DASH : toolDash(tool, theme, drawing) || undefined}
                strokeLinecap={tool.id === 'dtb' || (tool.id === 'line' && drawing.lineStyle === 'dotted') ? 'round' : undefined}
                strokeLinejoin={tool.id === 'line' ? 'round' : undefined}
              />
              {tool.id === 'blitz' && points.length > 2 && (
                <path className="play-designer-route" d={pathData(points.slice(1))} stroke={color} />
              )}
              {cap && (
                <line
                  className="play-designer-block-cap"
                  x1={cap.x1}
                  y1={cap.y1}
                  x2={cap.x2}
                  y2={cap.y2}
                  stroke={color}
                  strokeWidth={TBAR_THICKNESS_PX}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              {arrow && <polygon points={arrow} fill={color} />}
              {motionCap && <ellipse {...motionCap} fill={color} stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
            </g>
          )
        })}
      </svg>
      {markers.map((marker) => (
        <span
          key={marker.id}
          className={`play-designer-marker ${marker.team || 'offense'} ${marker.decoration || 'solid'}${marker.color ? ' color-override' : ''}${themeClass}`}
          style={markerStyleVars(marker)}
        >
          {marker.label}
        </span>
      ))}
    </div>
  )
}
