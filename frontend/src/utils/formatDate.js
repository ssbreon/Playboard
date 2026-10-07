export function formatDate(value, timeZone) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, typeof timeZone === 'string' && timeZone ? { timeZone } : undefined)
}
