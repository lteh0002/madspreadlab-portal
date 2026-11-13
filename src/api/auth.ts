import { API_BASE_URL, NETWORK_ERROR, apiFetch, errorMessage } from './client'
import { clearSession, getSession, saveSession, type Session } from './session'

/**
 * GET /api/me: refreshes the signed-in user's details (e.g. a userType changed in the database).
 * A 401 signs out via apiFetch; other failures keep what we have.
 */
export async function refreshUser() {
  const s = getSession()
  if (!s) return
  try {
    const res = await apiFetch(`${API_BASE_URL}/api/me`)
    if (!res.ok) return
    const { user } = (await res.json()) as { user: Session['user'] }
    // Only if still the same session (not signed out or switched meanwhile)
    if (getSession()?.token === s.token) saveSession({ ...s, user })
  } catch {
    // offline: keep the stored details
  }
}

/**
 * POST /api/login
 * Body: { "email": "...", "password": "..." }
 * Returns: { "token": "...", "user": { "id": "...", "email": "...", "name": "..." } }
 *
 * Rejects with a message to show: the server's error (e.g. "Incorrect email or password")
 * or NETWORK_ERROR.
 */
export async function login(email: string, password: string): Promise<Session> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new Error(NETWORK_ERROR)
  }
  if (!res.ok) throw new Error(await errorMessage(res))
  return (await res.json()) as Session
}

/**
 * Signs out here at once, and tells the server to end the session so the token stops working.
 * The server call is best effort: if it fails, the session still expires on its own.
 */
export function logout() {
  const token = getSession()?.token
  clearSession()
  if (!token) return
  fetch(`${API_BASE_URL}/api/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {})
}
