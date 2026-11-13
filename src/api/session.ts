/** The signed-in session from POST /api/login, kept in localStorage */
export interface Session {
  token: string
  user: { id: string; email: string; name?: string }
}

const SESSION_KEY = 'msl-session'

export function getSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    return s?.token ? s : null
  } catch {
    return null
  }
}

export function saveSession(session: Session) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  } catch {
    // storage unavailable (private mode etc.)
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
