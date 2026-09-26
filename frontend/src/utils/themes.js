// Add a new entry here (plus a matching `fieldClass` rule in App.css) to introduce another play theme.
export const PLAY_THEMES = [
  {
    id: 'color',
    label: 'Green Field',
    fieldClass: '',
    strokeColor: null,
    toolDash: null,
  },
  {
    id: 'printerFriendly',
    label: 'Printer-friendly',
    fieldClass: 'printer-friendly',
    strokeColor: '#000',
    // Distinguishes tool types by dash pattern instead of color when printing in black & white.
    toolDash: { block: null, route: null, blitz: '6 4', coverage: '1 4' },
  },
  {
    id: 'blackboard',
    label: 'Blackboard',
    fieldClass: 'blackboard',
    strokeColor: '#fff',
    toolDash: null,
  },
]

export const DEFAULT_THEME_ID = PLAY_THEMES[0].id

export function normalizeThemeId(id) {
  return PLAY_THEMES.some((theme) => theme.id === id) ? id : DEFAULT_THEME_ID
}

export function getTheme(id) {
  return PLAY_THEMES.find((theme) => theme.id === id) || PLAY_THEMES[0]
}

export function themeLabel(id) {
  return getTheme(id).label
}
