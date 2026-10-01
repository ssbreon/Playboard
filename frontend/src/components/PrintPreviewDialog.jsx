import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PlayFieldView } from './PlayFieldView'
import { defaultPlayPerspective } from '../utils/playGeometry'

const DPI = 96
const PAGE_MARGIN_IN = 0.5

const PAGE_SIZES = [
  { id: 'letter', label: 'Letter (8.5 × 11 in)', cssSize: 'letter', width: 8.5, height: 11 },
  { id: 'legal', label: 'Legal (8.5 × 14 in)', cssSize: 'legal', width: 8.5, height: 14 },
  { id: 'a4', label: 'A4 (210 × 297 mm)', cssSize: 'A4', width: 8.27, height: 11.69 },
]

const ORIENTATIONS = [
  { id: 'landscape', label: 'Landscape' },
  { id: 'portrait', label: 'Portrait' },
]

const PLAYS_PER_PAGE = [1, 2, 4]

function sheetPixels(pageSize, orientation) {
  const width = (pageSize.width - PAGE_MARGIN_IN * 2) * DPI
  const height = (pageSize.height - PAGE_MARGIN_IN * 2) * DPI
  return orientation === 'landscape' ? { width: height, height: width } : { width, height }
}

function chunk(items, size) {
  const pages = []
  for (let i = 0; i < items.length; i += size) pages.push(items.slice(i, i + size))
  return pages
}

// Two plays stack along the page's short axis so each cell keeps a usable aspect ratio.
function gridColumns(perPage, orientation) {
  if (perPage === 1) return 1
  if (perPage === 2) return orientation === 'landscape' ? 2 : 1
  return 2
}

export function PrintPreviewDialog({ play, plays, collection, onClose }) {
  const items = play ? [play] : plays || []
  const [pageSizeId, setPageSizeId] = useState(PAGE_SIZES[0].id)
  const [orientation, setOrientation] = useState('landscape')
  const [showTitle, setShowTitle] = useState(true)
  const [titlePage, setTitlePage] = useState(Boolean(collection))
  const [perPage, setPerPage] = useState(collection ? 2 : 1)
  const [scale, setScale] = useState(1)
  const stageRef = useRef(null)

  const pageSize = PAGE_SIZES.find((size) => size.id === pageSizeId) || PAGE_SIZES[0]
  const sheet = sheetPixels(pageSize, orientation)
  const columns = gridColumns(perPage, orientation)
  const playPages = chunk(items, perPage)

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) {
        setScale(Math.min(width / sheet.width, height / sheet.height, 1))
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [sheet.width, sheet.height])

  function renderPage(key, children) {
    return (
      <div key={key} className="print-page" style={{ width: sheet.width * scale, height: sheet.height * scale }}>
        <div className="print-sheet" style={{ width: sheet.width, height: sheet.height, '--print-scale': scale }}>
          {children}
        </div>
      </div>
    )
  }

  return createPortal(
    <div className="print-portal">
      <style>{`@page { size: ${pageSize.cssSize} ${orientation}; margin: ${PAGE_MARGIN_IN}in; }`}</style>
      <div className="print-overlay" role="dialog" aria-modal="true" aria-label="Print preview">
        <div className="print-dialog">
          <div className="print-dialog-chrome print-dialog-header">
            <h2>Print Preview</h2>
            <span className="print-dialog-subject">{collection ? collection.name : items[0]?.name}</span>
          </div>
          <div className="print-dialog-body">
            <div className="print-dialog-chrome print-options" aria-label="Print options">
              <fieldset className="print-option-group">
                <legend>Orientation</legend>
                {ORIENTATIONS.map((option) => (
                  <label key={option.id} className="print-option">
                    <input
                      type="radio"
                      name="print-orientation"
                      value={option.id}
                      checked={orientation === option.id}
                      onChange={() => setOrientation(option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
              <label className="dialog-field">
                <span>Paper size</span>
                <select value={pageSizeId} onChange={(event) => setPageSizeId(event.target.value)}>
                  {PAGE_SIZES.map((size) => (
                    <option key={size.id} value={size.id}>
                      {size.label}
                    </option>
                  ))}
                </select>
              </label>
              {items.length > 1 && (
                <fieldset className="print-option-group">
                  <legend>Plays per page</legend>
                  {PLAYS_PER_PAGE.map((count) => (
                    <label key={count} className="print-option">
                      <input
                        type="radio"
                        name="print-per-page"
                        value={count}
                        checked={perPage === count}
                        onChange={() => setPerPage(count)}
                      />
                      <span>{count}</span>
                    </label>
                  ))}
                </fieldset>
              )}
              {collection && (
                <label className="dialog-field dialog-checkbox">
                  <input type="checkbox" checked={titlePage} onChange={(event) => setTitlePage(event.target.checked)} />
                  <span>Print a title page</span>
                </label>
              )}
              <label className="dialog-field dialog-checkbox">
                <input type="checkbox" checked={showTitle} onChange={(event) => setShowTitle(event.target.checked)} />
                <span>{items.length > 1 ? 'Include play names' : 'Include play name'}</span>
              </label>
            </div>
            <div className="print-stage" ref={stageRef}>
              <div className="print-pages">
                {collection &&
                  titlePage &&
                  renderPage(
                    'title-page',
                    <div className="print-title-page">
                      <div className="print-title-main">
                        <h1>{collection.name}</h1>
                        <p className="print-title-meta">
                          {[collection.category, collection.year].filter(Boolean).join(' \u00b7 ')}
                        </p>
                        {collection.opponent && <p className="print-title-meta">vs {collection.opponent}</p>}
                      </div>
                      <div className="print-title-brand">
                        <img src="/blitzboard-mark.svg" alt="" aria-hidden="true" />
                        <span>
                          BLITZBOARD <span className="print-title-brand-accent">Studio</span>
                        </span>
                      </div>
                    </div>,
                  )}
                {playPages.map((pagePlays, index) =>
                  renderPage(
                    `plays-${index}`,
                    <div className={`print-grid per-page-${perPage}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
                      {pagePlays.map((item) => (
                        <div key={item.id || item.name} className="print-cell">
                          {showTitle && <h1 className="print-sheet-title">{item.name}</h1>}
                          <PlayFieldView
                            play={{ ...item, perspective: item.perspective || defaultPlayPerspective(collection?.category) }}
                            className="print-field"
                          />
                        </div>
                      ))}
                    </div>,
                  ),
                )}
              </div>
            </div>
          </div>
          <div className="print-dialog-chrome dialog-actions print-dialog-actions">
            <button type="button" className="dialog-cancel" onClick={onClose}>
              Close
            </button>
            <button type="button" className="dialog-create" onClick={() => window.print()}>
              Print
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
