import { useEffect, useRef, useState } from 'react'

const PAGE_SIZE = 50

export function DataGrid({ title, columns, fetchRows, onNew, newLabel = 'New', menuItems = [], onRowDoubleClick, onBack }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
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

  // Loading/error/rows are driven by an async fetch, not derivable from props during render.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRows()
      .then((items) => {
        if (!cancelled) setRows(items)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [fetchRows, refreshToken])

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = rows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const dropdownItems = [{ label: 'Refresh', onClick: () => setRefreshToken((t) => t + 1) }, ...menuItems]

  return (
    <section className="data-grid">
      <div className="data-grid-title-row">
        {onBack && (
          <button type="button" className="data-grid-back" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M15 4 7 12l8 8 1.4-1.4L9.8 12l6.6-6.6z" />
            </svg>
          </button>
        )}
        <h1>{title}</h1>
      </div>
      <div className="data-grid-toolbar">
        <button type="button" className="toolbar-new-button" onClick={onNew}>
          <svg className="toolbar-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
          </svg>
          {newLabel}
        </button>
        <div className="toolbar-menu" ref={menuRef}>
          <button
            type="button"
            className="hamburger-button"
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="More actions"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <svg className="hamburger-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="toolbar-dropdown" role="menu">
              {dropdownItems.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    item.onClick()
                    setMenuOpen(false)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {loading && <p className="data-grid-status">Loading {title.toLowerCase()}...</p>}
      {error && <p className="data-grid-status data-grid-error">Unable to load {title.toLowerCase()}: {error}</p>}
      {!loading && !error && (
        <>
          <div className="data-grid-table-wrap">
            <table className="data-grid-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td className="data-grid-empty" colSpan={columns.length}>
                      No {title.toLowerCase()} yet
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                    style={onRowDoubleClick ? { cursor: 'pointer' } : undefined}
                  >
                    {columns.map((column) => (
                      <td key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="data-grid-pager">
            <span>
              {rows.length === 0
                ? '0 rows'
                : `Rows ${currentPage * PAGE_SIZE + 1}-${Math.min(rows.length, (currentPage + 1) * PAGE_SIZE)} of ${rows.length}`}
            </span>
            <div className="data-grid-pager-controls">
              <button type="button" disabled={currentPage === 0} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <span>
                Page {currentPage + 1} of {totalPages}
              </span>
              <button type="button" disabled={currentPage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}
