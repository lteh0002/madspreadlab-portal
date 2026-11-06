/** Backend base URL from the API_BASE_URL env var (no trailing slash); empty = same origin */
export const API_BASE_URL = (import.meta.env.API_BASE_URL ?? '').replace(/\/$/, '')

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
