const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const authMode = import.meta.env.VITE_AUTH_MODE || ''
const signedOutKey = 'blitzboard:signed-out'
let signedOut = false
try { signedOut = sessionStorage.getItem(signedOutKey) === 'true' } catch { signedOut = false }

export const isDevelopmentAuth = authMode === 'development'
export function isSignedOut() { return signedOut }

export function signOut() {
  signedOut = true
  try {
    sessionStorage.setItem(signedOutKey, 'true')
    sessionStorage.removeItem('blitzboard:workspace')
  } catch { return }
}

export function signIn() {
  if (!isDevelopmentAuth) throw new Error('Sign-in provider is not connected')
  signedOut = false
  try { sessionStorage.removeItem(signedOutKey) } catch { return }
}

function authenticationHeaders(path) {
  if (path === '/health') return {}
  if (signedOut) throw new Error('You are signed out')
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

async function sendRequest(path, options = {}, workspaceId) {
  const { headers = {}, ...fetchOptions } = options
  const response = await fetch(`${baseUrl}/api${path}`, {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...authenticationHeaders(path), ...(workspaceId ? { 'X-Workspace-Id': workspaceId } : {}), ...headers },
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}))
    const error = new Error(detail.error?.message || `Request failed with ${response.status}`)
    error.code = detail.error?.code
    error.status = response.status
    throw error
  }
  return response.status === 204 ? null : response.json()
}

export function createApi(workspaceId, onMutationState) {
  const request = async (path, options = {}) => {
    const mutation = ['POST', 'PATCH', 'DELETE'].includes(options.method)
    if (mutation) onMutationState?.(1)
    try {
      return await sendRequest(path, options, workspaceId)
    } finally {
      if (mutation) onMutationState?.(-1)
    }
  }
  return {
  health: () => request('/health'),
  me: () => request('/me'),
  updateProfile: (payload) => request('/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  updatePreferences: (payload) => request('/me/preferences', { method: 'PATCH', body: JSON.stringify(payload) }),
  workspaces: () => request('/workspaces'),
  workspace: () => request('/workspace'),
  updateWorkspace: (payload) => request('/workspace', { method: 'PATCH', body: JSON.stringify(payload) }),
  members: () => request('/workspace/members'),
  invitations: () => request('/workspace/invitations'),
  invite: (payload) => request('/workspace/invitations', { method: 'POST', body: JSON.stringify(payload) }),
  revokeInvitation: (id) => request(`/workspace/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resendInvitation: (id) => request(`/workspace/invitations/${encodeURIComponent(id)}/resend`, { method: 'POST', body: '{}' }),
  acceptInvitation: (token) => request('/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) }),
  updateMember: (id, role) => request(`/workspace/members/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ role }) }),
  removeMember: (id) => request(`/workspace/members/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  billing: () => request('/workspace/billing'),
  search: (query) => request(`/search${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  listPlaybooks: (category, namePrefix) => request(`/playbooks${listQuery(category, namePrefix)}`),
  createPlaybook: (payload) => request('/playbooks', { method: 'POST', body: JSON.stringify(payload) }),
  getPlaybook: (id) => request(`/playbooks/${id}`),
  updatePlaybook: (id, payload) => request(`/playbooks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePlaybook: (id) => request(`/playbooks/${id}`, { method: 'DELETE' }),
  listPlays: (id, category, namePrefix) => request(`/playbooks/${id}/plays${listQuery(category, namePrefix)}`),
  createPlay: (id, payload) => request(`/playbooks/${id}/plays`, { method: 'POST', body: JSON.stringify(payload) }),
  reorderPlays: (id, ids) => request(`/playbooks/${id}/plays/reorder`, { method: 'POST', body: JSON.stringify({ ids }) }),
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
  reorderScoutPlays: (id, ids) => request(`/game-plans/${id}/scout-plays/reorder`, { method: 'POST', body: JSON.stringify({ ids }) }),
  getScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`),
  updateScoutPlay: (gamePlanId, id, payload) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteScoutPlay: (gamePlanId, id) => request(`/game-plans/${gamePlanId}/scout-plays/${id}`, { method: 'DELETE' }),
  }
}

export const api = createApi()