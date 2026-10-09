const HANDLE_SELECTOR = '.dialog-panel > h2, .print-dialog-header'

function getOffset(panel) {
  return { x: Number(panel.dataset.dragX) || 0, y: Number(panel.dataset.dragY) || 0 }
}

function setOffset(panel, x, y) {
  panel.dataset.dragX = x
  panel.dataset.dragY = y
  panel.style.transform = `translate(${x}px, ${y}px)`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

// Moves the panel by (dx, dy) relative to its rect/offset at drag start, keeping it inside the viewport.
function movePanel(panel, startRect, startOffset, dx, dy) {
  const left = clamp(startRect.left + dx, 0, window.innerWidth - startRect.width)
  const top = clamp(startRect.top + dy, 0, window.innerHeight - startRect.height)
  setOffset(panel, startOffset.x + left - startRect.left, startOffset.y + top - startRect.top)
}

function handlePointerDown(event) {
  if (event.button !== 0) return
  const handle = event.target.closest(HANDLE_SELECTOR)
  if (!handle) return
  const panel = handle.parentElement

  event.preventDefault()
  const startX = event.clientX
  const startY = event.clientY
  const startRect = panel.getBoundingClientRect()
  const startOffset = getOffset(panel)
  let moved = false

  function onMove(moveEvent) {
    moved = true
    movePanel(panel, startRect, startOffset, moveEvent.clientX - startX, moveEvent.clientY - startY)
  }

  function onUp() {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    document.body.style.userSelect = ''
    if (moved) {
      // Releasing over the overlay would otherwise trigger its click-to-close handler.
      const suppressClick = (clickEvent) => clickEvent.stopPropagation()
      window.addEventListener('click', suppressClick, { capture: true, once: true })
      setTimeout(() => window.removeEventListener('click', suppressClick, { capture: true }), 0)
    }
  }

  document.body.style.userSelect = 'none'
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
}

function handleResize() {
  document.querySelectorAll('.dialog-panel[data-drag-x]').forEach((panel) => {
    movePanel(panel, panel.getBoundingClientRect(), getOffset(panel), 0, 0)
  })
}

export function enableDraggableDialogs() {
  document.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('resize', handleResize)
}
