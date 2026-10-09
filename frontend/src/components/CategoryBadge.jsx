const CATEGORY_COLORS = {
  Offense: { hue: 142, saturation: '58%' },
  Defense: { hue: 215, saturation: '72%' },
  'Special Teams': { hue: 275, saturation: '62%' },
  Front: { hue: 142, saturation: '58%' },
  Stunt: { hue: 275, saturation: '62%' },
  Blitz: { hue: 2, saturation: '70%' },
  Coverage: { hue: 215, saturation: '72%' },
  'Play Call': { hue: 220, saturation: '8%' },
  Run: { hue: 142, saturation: '58%' },
  Pass: { hue: 215, saturation: '72%' },
  'Play-Action Pass': { hue: 185, saturation: '62%' },
  RPO: { hue: 35, saturation: '78%' },
  Gadget: { hue: 275, saturation: '62%' },
  Generic: { hue: 220, saturation: '8%' },
}

export function getCategoryBadgeStyle(category) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS['Play Call']
  return { '--badge-hue': color.hue, '--badge-saturation': color.saturation }
}

export function CategoryBadge({ value }) {
  const label = value == null ? '' : String(value).trim()
  if (!label) return '—'
  return (
    <span className="category-badge" style={getCategoryBadgeStyle(label)}>
      {label}
    </span>
  )
}

export function renderCategoryBadge(value) {
  return <CategoryBadge value={value} />
}
