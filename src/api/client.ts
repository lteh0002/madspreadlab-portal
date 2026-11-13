import { clearSession, getSession } from './session'

/** Shown when the backend can't be reached at all (server down, DNS, CORS, offline) */
export const NETWORK_ERROR = "Can't reach server"

/** Backend base URL from the API_BASE_URL env var (no trailing slash); empty = same origin */
export const API_BASE_URL = (import.meta.env.API_BASE_URL ?? '').replace(/\/$/, '')

/**
 * fetch() for API calls that need a login: sends the session token, and on a 401 (no session,
 * or it expired) forgets the session and goes to the login page, returning here afterwards.
 * Callers handle the response as usual.
 */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const token = getSession()?.token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(url, { ...init, headers })
  if (res.status === 401) {
    clearSession()
    // Imported here, not at the top: the router imports the views, which import this file
    const { default: router } = await import('@/router')
    const here = router.currentRoute.value
    if (here.name !== 'login') void router.replace({ name: 'login', query: { redirect: here.fullPath } })
  }
  return res
}

/** The message to show for a failed response: the server's own one if it sent JSON with one */
export async function errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: unknown; error?: unknown }
    const msg = body.message ?? body.error
    if (typeof msg === 'string' && msg.trim()) return msg
  } catch {
    // not JSON; fall through to the generic message
  }
  return `The server returned an error (${res.status}).`
}
