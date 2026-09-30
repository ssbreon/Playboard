const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const authMode = import.meta.env.VITE_AUTH_MODE || ''

function authenticationHeaders(path) {
  if (path === '/health') return {}
  if (authMode !== 'development') return {}

  const secret = import.meta.env.VITE_DEV_AUTH_SECRET
  if (!secret) throw new Error('VITE_DEV_AUTH_SECRET is required in development authentication mode')
  return {
    'X-Dev-User': import.meta.env.VITE_DEV_USER_ID || 'local-coach',
    'X-Dev-Auth-Secret': secret,
  }
}

const listQuery = (category, namePrefix) => {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (namePrefix) params.set('namePrefix', namePrefix)
  const query = params.toString()
  return query ? `?${query}` : ''
}

async function request(path, options = {}) {
  const { headers = {}, ...fetchOptions } = options
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...authenticationHeaders(path), ...headers },
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.error?.message || `Request failed with ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export const api = {
  health: () => request('/health'),
  me: () => request('/me'),
  search: (query) => request(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  listPlaybooks: (category, namePrefix) => request(`/playbooks${listQuery(category, namePrefix)}`),
  createPlaybook: (payload) => request('/playbooks', { method: 'POST', body: JSON.stringify(payload) }),
  getPlaybook: (id) => request(`/playbooks/${id}`),
  updatePlaybook: (id, payload) => request(`/playbooks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlaybook: (id) => request(`/playbooks/${id}`, { method: 'DELETE' }),
  listPlays: (id, category, namePrefix) => request(`/playbooks/${id}/plays${listQuery(category, namePrefix)}`),
  createPlay: (id, payload) => request(`/playbooks/${id}/plays`, { method: 'POST', body: JSON.stringify(payload) }),
  getPlay: (bookId, id) => request(`/playbooks/${bookId}/plays/${id}`),
  updatePlay: (bookId, id, payload) => request(`/playbooks/${bookId}/plays/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlay: (bookId, id) => request(`/playbooks/${bookId}/plays/${id}`, { method: 'DELETE' }),
  listSlides: (bookId, playId) => request(`/playbooks/${bookId}/plays/${playId}/slides`),
  createSlide: (bookId, playId, payload) => request(`/playbooks/${bookId}/plays/${playId}/slides`, { method: 'POST', body: JSON.stringify(payload) }),
  getSlide: (bookId, playId, slideId) => request(`/playbooks/${bookId}/plays/${playId}/slides/${slideId}`),
  updateSlide: (bookId, playId, slideId, payload) => request(`/playbooks/${bookId}/plays/${playId}/slides/${slideId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSlide: (bookId, playId, slideId) => request(`/playbooks/${bookId}/plays/${playId}/slides/${slideId}`, { method: 'DELETE' }),
  createExport: (payload) => request('/exports', { method: 'POST', body: JSON.stringify(payload) }),
  getExport: (id) => request(`/exports/${id}`),
  listGamePlans: (category, namePrefix) => request(`/game-plans${listQuery(category, namePrefix)}`),
  createGamePlan: (payload) => request('/game-plans', { method: 'POST', body: JSON.stringify(payload) }),
  getGamePlan: (id) => request(`/game-plans/${id}`),
  updateGamePlan: (id, payload) => request(`/game-plans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGamePlan: (id) => request(`/game-plans/${id}`, { method: 'DELETE' }),
  listScoutPlays: (id, category, namePrefix) => request(`/game-plans/${id}/scout-plays${listQuery(category, namePrefix)}`),
  createScoutPlay: (id, payload) => request(`/game-plans/${id}/scout-plays`, { method: 'POST', body: JSON.stringify(payload) }),
  getScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`),
  updateScoutPlay: (gamePlanId, id, payload) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'DELETE' }),
}