const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    throw new Error(detail.error?.message || `Request failed with ${response.status}`)
  }
  return response.status === 204 ? null : response.json()
}

export const api = {
  health: () => request('/health'),
  search: (query) => request(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  listPlaybooks: () => request('/playbooks'),
  createPlaybook: (payload) => request('/playbooks', { method: 'POST', body: JSON.stringify(payload) }),
  getPlaybook: (id) => request(`/playbooks/${id}`),
  updatePlaybook: (id, payload) => request(`/playbooks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlaybook: (id) => request(`/playbooks/${id}`, { method: 'DELETE' }),
  listPlays: (id) => request(`/playbooks/${id}/plays`),
  createPlay: (id, payload) => request(`/playbooks/${id}/plays`, { method: 'POST', body: JSON.stringify(payload) }),
  getPlay: (bookId, id) => request(`/playbooks/${bookId}/plays/${id}`),
  updatePlay: (bookId, id, payload) => request(`/playbooks/${bookId}/plays/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlay: (bookId, id) => request(`/playbooks/${bookId}/plays/${id}`, { method: 'DELETE' }),
  listSlides: (id) => request(`/playbooks/${id}/slides`),
  createSlide: (id, payload) => request(`/playbooks/${id}/slides`, { method: 'POST', body: JSON.stringify(payload) }),
  getSlide: (bookId, id) => request(`/playbooks/${bookId}/slides/${id}`),
  updateSlide: (bookId, id, payload) => request(`/playbooks/${bookId}/slides/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteSlide: (bookId, id) => request(`/playbooks/${bookId}/slides/${id}`, { method: 'DELETE' }),
  createExport: (payload) => request('/exports', { method: 'POST', body: JSON.stringify(payload) }),
  getExport: (id) => request(`/exports/${id}`),
  listGamePlans: () => request('/game-plans'),
  createGamePlan: (payload) => request('/game-plans', { method: 'POST', body: JSON.stringify(payload) }),
  getGamePlan: (id) => request(`/game-plans/${id}`),
  updateGamePlan: (id, payload) => request(`/game-plans/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteGamePlan: (id) => request(`/game-plans/${id}`, { method: 'DELETE' }),
  listScoutPlays: (id) => request(`/game-plans/${id}/scout-plays`),
  createScoutPlay: (id, payload) => request(`/game-plans/${id}/scout-plays`, { method: 'POST', body: JSON.stringify(payload) }),
  getScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`),
  updateScoutPlay: (gamePlanId, id, payload) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'DELETE' }),
}