import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Info, MoreVertical, RefreshCw, Search, X } from 'lucide-react'
import { getCategoryBadgeStyle } from './CategoryBadge'

const PAGE_SIZE = 50

export function DataGrid({ title, subtitle, columns, rowIcon: RowIcon, rowType, categoryOptions, fetchRows, onNew, newLabel = 'New', menuItems = [], rowActions, onRowDoubleClick, onBack, items, compact = false, busy = false, rowActionLabel }) {
  const openHintStorageKey = `blitzboard:data-grid-open-hint:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const [fetchedRows, setRows] = useState([])
  const rows = items ?? fetchedRows
  const [loading, setLoading] = useState(true)
  const isLoading = items === undefined && loading
  const [error, setError] = useState(null)
  const [page, setPage] = useState(0)
  const [selectedCategories, setSelectedCategories] = useState([])
  const [searchName, setSearchName] = useState('')
  const [namePrefix, setNamePrefix] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [openRowMenuId, setOpenRowMenuId] = useState(null)
  const [rowMenuPosition, setRowMenuPosition] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [showOpenHint, setShowOpenHint] = useState(() => {
    try {
      return typeof window !== 'undefined' && window.localStorage.getItem(openHintStorageKey) !== 'dismissed'
    } catch {
      return true
    }
  })
  const menuRef = useRef(null)
  const rowMenuRef = useRef(null)
  const rowMenuTriggerRef = useRef(null)
  const rowMenuPortalTargetRef = useRef(null)

  function dismissOpenHint() {
    setShowOpenHint(false)
    try {
      window.localStorage.setItem(openHintStorageKey, 'dismissed')
    } catch {
      return
    }
  }

  function closeRowMenu() {
    setOpenRowMenuId(null)
    setRowMenuPosition(null)
  }

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
      if (!event.target.closest('.row-actions') && !event.target.closest('.row-actions-dropdown')) {
        closeRowMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Closes the portaled menu on scroll since its fixed position is only computed on open.
  useEffect(() => {
    if (openRowMenuId === null) return undefined
    const focusTarget = rowMenuRef.current?.querySelector('button:not(:disabled)') || rowMenuRef.current
    focusTarget?.focus()
    window.addEventListener('scroll', closeRowMenu, true)
    window.addEventListener('resize', closeRowMenu)
    return () => {
      window.removeEventListener('scroll', closeRowMenu, true)
      window.removeEventListener('resize', closeRowMenu)
    }
  }, [openRowMenuId])

  useEffect(() => {
    const timeout = setTimeout(() => setNamePrefix(searchName), 250)
    return () => clearTimeout(timeout)
  }, [searchName])

  // Loading/error/rows are driven by an async fetch, not derivable from props during render.
  useEffect(() => {
    if (items !== undefined) return undefined
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchRows({ namePrefix })
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
  }, [fetchRows, refreshToken, namePrefix, items])

  function toggleCategory(option) {
    setSelectedCategories((current) => current.includes(option) ? current.filter((c) => c !== option) : [...current, option])
    setPage(0)
  }

  const filteredRows = selectedCategories.length ? rows.filter((row) => selectedCategories.includes(row.category)) : rows
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages - 1)
  const pageRows = filteredRows.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)

  const dropdownItems = [{ label: 'Refresh', icon: RefreshCw, onClick: () => setRefreshToken((t) => t + 1) }, ...menuItems]

  return (
    <section className={`data-grid${compact ? ' data-grid-compact' : ''}`} aria-label={compact ? title : undefined}>
      {!compact && <div className="data-grid-title-row">
        {onBack && (
          <button type="button" className="data-grid-back" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M15 4 7 12l8 8 1.4-1.4L9.8 12l6.6-6.6z" />
            </svg>
          </button>
        )}
        <div className="data-grid-heading">
          <h1>{title}</h1>
          {subtitle && <p className="data-grid-context">{subtitle}</p>}
        </div>
      </div>}
      {!compact && <div className="data-grid-toolbar">
        <div className="data-grid-toolbar-actions">
          <button type="button" className="toolbar-new-button" onClick={onNew} disabled={!onNew}>
            <svg className="toolbar-icon" viewBox="0 0 24 24" role="presentation" aria-hidden="true">
              <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
            </svg>
            {newLabel}
          </button>
          <label className="data-grid-name-filter">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search by name"
              value={searchName}
              onChange={(event) => {
                setSearchName(event.target.value)
                setPage(0)
              }}
              placeholder="Search name"
            />
          </label>
          {categoryOptions && (
            <div className="data-grid-category-filter" role="group" aria-label="Filter by category">
              {categoryOptions.map((option) => {
                const active = selectedCategories.includes(option)
                return (
                  <button
                    key={option}
                    type="button"
                    className={`category-badge category-filter-badge${active ? ' is-active' : ''}`}
                    style={getCategoryBadgeStyle(option)}
                    aria-pressed={active}
                    onClick={() => toggleCategory(option)}
                  >
                    {option}
                  </button>
                )
              })}
            </div>
          )}
        </div>
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
                  {item.icon && <item.icon className="menu-item-icon" aria-hidden="true" />}
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>}
      {onRowDoubleClick && showOpenHint && pageRows.length > 0 && (
        <div className="data-grid-open-hint" role="status">
          <Info size={16} aria-hidden="true" />
          <span className="data-grid-open-hint-desktop">Double-click a row to open it, or choose Open from its actions menu.</span>
          <span className="data-grid-open-hint-touch">Choose Open from a row actions menu to open it.</span>
          <button type="button" className="data-grid-open-hint-dismiss" aria-label="Dismiss open tip" onClick={dismissOpenHint}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {isLoading && <p className="data-grid-status data-grid-loading" role="status">Loading {title.toLowerCase()}...</p>}
      {error && <p className="data-grid-status data-grid-error">Unable to load {title.toLowerCase()}: {error}</p>}
      {!isLoading && !error && (
        <>
          <div className="data-grid-table-wrap">
            <table className="data-grid-table">
              <thead>
                <tr>
                  {RowIcon && <th className="data-grid-type-header" scope="col" aria-label="Type" />}
                  {columns.map((column) => (
                    <th key={column.key}>{column.header}</th>
                  ))}
                  {rowActions && <th className="data-grid-actions-header" aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 && (
                  <tr>
                    <td className="data-grid-empty" colSpan={columns.length + (RowIcon ? 1 : 0) + (rowActions ? 1 : 0)}>
                      {namePrefix ? `No ${title.toLowerCase()} match your search` : selectedCategories.length ? `No ${title.toLowerCase()} in ${selectedCategories.join(', ')}` : `No ${title.toLowerCase()} yet`}
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    onDoubleClick={onRowDoubleClick ? () => {
                      onRowDoubleClick(row)
                      dismissOpenHint()
                    } : undefined}
                    style={onRowDoubleClick ? { cursor: 'pointer' } : undefined}
                  >
                    {RowIcon && (
                      <td className="data-grid-type-cell" aria-label={rowType} title={rowType}>
                        <RowIcon size={17} strokeWidth={2} aria-hidden="true" />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td key={column.key} className={column.key === 'name' ? 'data-grid-name-cell' : undefined}>
                        {column.render ? column.render(row[column.key], row) : row[column.key]}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="data-grid-actions-cell">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="row-actions-button"
                            disabled={busy}
                            title={rowActionLabel ? rowActionLabel(row) : 'Row actions'}
                            aria-haspopup="menu"
                            aria-expanded={openRowMenuId === row.id}
                            aria-label={rowActionLabel ? rowActionLabel(row) : 'Row actions'}
                            onClick={(event) => {
                              event.stopPropagation()
                              if (openRowMenuId === row.id) {
                                closeRowMenu()
                                return
                              }
                              const rect = event.currentTarget.getBoundingClientRect()
                              rowMenuTriggerRef.current = event.currentTarget
                              rowMenuPortalTargetRef.current = event.currentTarget.closest('[role="dialog"]') || document.body
                              const menuHeight = rowActions(row).length * 44 + 12
                              const top = rect.bottom + 4 + menuHeight <= window.innerHeight
                                ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4)
                              setRowMenuPosition({ top, right: Math.max(8, window.innerWidth - rect.right) })
                              setOpenRowMenuId(row.id)
                            }}
                          >
                            <MoreVertical size={18} aria-hidden="true" />
                          </button>
                          {openRowMenuId === row.id && rowMenuPosition &&
                            createPortal(
                              <div
                                className="toolbar-dropdown row-actions-dropdown"
                                ref={rowMenuRef}
                                role="menu"
                                tabIndex={-1}
                                style={{ position: 'fixed', top: rowMenuPosition.top, right: rowMenuPosition.right }}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    event.stopPropagation()
                                    closeRowMenu()
                                    rowMenuTriggerRef.current?.focus()
                                  } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
                                    event.preventDefault()
                                    const buttons = [...event.currentTarget.querySelectorAll('button:not(:disabled)')]
                                    const currentIndex = buttons.indexOf(document.activeElement)
                                    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
                                      : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                                    buttons[nextIndex]?.focus()
                                  } else if (event.key === 'Tab') {
                                    closeRowMenu()
                                    rowMenuTriggerRef.current?.focus()
                                  }
                                }}
                              >
                                {rowActions(row).map((item) => (
                                  <button
                                    key={item.key}
                                    type="button"
                                    role="menuitem"
                                    disabled={busy || item.disabled}
                                    className={item.destructive ? 'row-actions-destructive' : undefined}
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      closeRowMenu()
                                      rowMenuTriggerRef.current?.focus()
                                      item.onClick(row)
                                      if (item.key === 'open') dismissOpenHint()
                                    }}
                                  >
                                    {item.icon && <item.icon className="menu-item-icon" aria-hidden="true" />}
                                    {item.label}
                                  </button>
                                ))}
                              </div>,
                              rowMenuPortalTargetRef.current || document.body
                            )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(!compact || totalPages > 1) && <div className="data-grid-pager">
            <span>
              {filteredRows.length === 0
                ? '0 rows'
                : `Rows ${currentPage * PAGE_SIZE + 1}-${Math.min(filteredRows.length, (currentPage + 1) * PAGE_SIZE)} of ${filteredRows.length}`}
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
          </div>}
        </>
      )}
    </section>
  )
}
