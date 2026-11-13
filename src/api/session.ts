import { computed, readonly, ref } from 'vue'

/** The signed-in session from POST /api/login, kept in localStorage */
export interface Session {
  token: string
  user: { id: string; email: string; name?: string; userType?: 'admin' | 'user' }
}

const SESSION_KEY = 'msl-session'

function read(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const s = raw ? (JSON.parse(raw) as Session) : null
    return s?.token ? s : null
  } catch {
    return null
  }
}

// Module-level and reactive, so the sidebar etc. update on sign-in/out
const current = ref<Session | null>(read())

/** The current session, reactive */
export const session = readonly(current)

/**
 * Whether to show admin pages. Only hides them: the API checks userType itself on every admin action,
 * so editing this in the browser gets nothing.
 */
export const isAdmin = computed(() => current.value?.user.userType === 'admin')

export const getSession = (): Session | null => current.value

export function saveSession(s: Session) {
  current.value = s
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s))
  } catch {
    // storage unavailable (private mode etc.)
  }
}

export function clearSession() {
  current.value = null
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
}
