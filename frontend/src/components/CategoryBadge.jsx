// FNV-1a keeps the hue stable for a given category across sessions and grids.
export function hashHue(text) {
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0) % 360
}

export function CategoryBadge({ value }) {
  const label = value == null ? '' : String(value).trim()
  if (!label) return '—'
  return (
    <span className="category-badge" style={{ '--badge-hue': hashHue(label) }}>
      {label}
    </span>
  )
}

export function renderCategoryBadge(value) {
  return <CategoryBadge value={value} />
}
