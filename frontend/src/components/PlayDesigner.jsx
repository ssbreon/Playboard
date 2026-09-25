import { useState } from 'react'
import { api } from '../api'

export function PlayDesigner({ record, onClose }) {
  const [name, setName] = useState(record.name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [markers, setMarkers] = useState(record.initialMarkers || [])
  const [selectedId, setSelectedId] = useState(null)
  const [dragId, setDragId] = useState(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (record.kind === 'play') {
        await api.updatePlay(record.parentId, record.id, { name })
      } else {
        await api.updateScoutPlay(record.parentId, record.id, { name })
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function positionFromEvent(event) {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100)),
    }
  }

  function handleMarkerPointerDown(event, id) {
    event.stopPropagation()
    setSelectedId(id)
    setDragId(id)
  }

  function handleMarkerClick(event) {
    event.stopPropagation()
  }

  function handleFieldPointerMove(event) {
    if (!dragId) return
    const { x, y } = positionFromEvent(event)
    setMarkers((current) => current.map((marker) => (marker.id === dragId ? { ...marker, x, y } : marker)))
  }

  function handleFieldPointerUp() {
    setDragId(null)
  }

  function handleKeyDown(event) {
    if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
      setMarkers((current) => current.filter((marker) => marker.id !== selectedId))
      setSelectedId(null)
    }
  }

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
        <button type="button" className="play-designer-save" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      {error && <p className="data-grid-status data-grid-error">Unable to save: {error}</p>}
      <div
        className="play-designer-field"
        onPointerMove={handleFieldPointerMove}
        onPointerUp={handleFieldPointerUp}
        onPointerLeave={handleFieldPointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        role="application"
        aria-label="Play field"
      >
        {markers.length === 0 && (
          <p className="play-designer-hint">
            Drag players to reposition them. Select a player and press Delete to remove it.
          </p>
        )}
        {markers.map((marker) => (
          <button
            key={marker.id}
            type="button"
            className={`play-designer-marker ${marker.team || 'offense'}${marker.id === selectedId ? ' selected' : ''}`}
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            onPointerDown={(event) => handleMarkerPointerDown(event, marker.id)}
            onClick={handleMarkerClick}
            aria-label="Player marker"
          >
            {marker.label}
          </button>
        ))}
      </div>
    </section>
  )
}
