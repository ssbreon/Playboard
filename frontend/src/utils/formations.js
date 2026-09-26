// Field coordinates are percentages: x = 0 (left) to 100 (right), y = 0 (top) to 100 (bottom).
export const PLAY_TEMPLATES = [
  {
    id: '11v11',
    label: '11v11 (Pro Set vs 4-3)',
    offense: [
      // Offensive line: LT, LG, C, RG, RT (rendered y = 85 - pos.y, so a smaller
      // pos.y here means closer to the line of scrimmage)
      { x: 36, y: 38 },
      { x: 43, y: 38 },
      { x: 50, y: 38 },
      { x: 57, y: 38 },
      { x: 64, y: 38 },
      // Tight end
      { x: 78, y: 38 },
      // Split end / flanker
      { x: 10, y: 38 },
      { x: 90, y: 38 },
      // Quarterback
      { x: 50, y: 46 },
      // Halfback / fullback (pro set split backs)
      { x: 42, y: 53 },
      { x: 58, y: 53 },
    ],
    defense: [
      // Down linemen: DE, DT, DT, DE (DE over LT/RT, DT over LG/RG; just below the line of scrimmage)
      { x: 36, y: 53 },
      { x: 43, y: 53 },
      { x: 57, y: 53 },
      { x: 64, y: 53 },
      // Linebackers: WLB, MLB, SLB
      { x: 40, y: 68 },
      { x: 50, y: 68 },
      { x: 60, y: 68 },
      // Cornerbacks
      { x: 10, y: 62 },
      { x: 90, y: 62 },
      // Safeties
      { x: 42, y: 78 },
      { x: 58, y: 78 },
    ],
  },
  {
    id: '7v7',
    label: '7v7',
    offense: [
      { x: 10, y: 42 },
      { x: 30, y: 42 },
      { x: 70, y: 42 },
      { x: 90, y: 42 },
      { x: 50, y: 50 },
      { x: 42, y: 56 },
      { x: 58, y: 56 },
    ],
    defense: [
      { x: 10, y: 60 },
      { x: 90, y: 60 },
      { x: 35, y: 62 },
      { x: 50, y: 64 },
      { x: 65, y: 62 },
      { x: 38, y: 76 },
      { x: 62, y: 76 },
    ],
  },
  {
    id: '4v4',
    label: '4v4',
    offense: [
      { x: 20, y: 42 },
      { x: 80, y: 42 },
      { x: 50, y: 52 },
      { x: 50, y: 58 },
    ],
    defense: [
      { x: 20, y: 62 },
      { x: 80, y: 62 },
      { x: 40, y: 74 },
      { x: 60, y: 74 },
    ],
  },
]

const POSITION_LABELS = {
  '11v11': {
    offense: ['LT', 'LG', 'C', 'RG', 'RT', 'Y', 'Z', 'X', 'QB', 'HB', 'FB'],
    defense: ['DE', 'DT', 'DT', 'DE', 'W', 'M', 'S', 'CB', 'CB', 'FS', 'SS'],
  },
  '7v7': {
    offense: ['X', 'C', 'Z', 'WR', 'QB', 'RB', 'TE'],
    defense: ['CB', 'CB', 'W', 'M', 'S', 'FS', 'SS'],
  },
  '4v4': {
    offense: ['WR', 'WR', 'QB', 'RB'],
    defense: ['CB', 'CB', 'S', 'S'],
  },
}

export function buildMarkersFromTemplate(template) {
  const markers = []
  const labels = POSITION_LABELS[template.id] || POSITION_LABELS['11v11']
  template.offense.forEach((pos, index) => {
    markers.push({
      id: `offense-${index}`,
      label: labels.offense[index] || 'O',
      x: pos.x,
      y: 85 - pos.y,
      team: 'offense',
    })
  })
  template.defense.forEach((pos, index) => {
    markers.push({
      id: `defense-${index}`,
      label: labels.defense[index] || 'D',
      x: pos.x,
      y: pos.y,
      team: 'defense',
    })
  })
  return markers
}
