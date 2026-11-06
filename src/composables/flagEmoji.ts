/**
 * Whether this device renders flag emoji as actual flags.
 * Windows (and some Linux setups) show the two regional letters instead, e.g. "JP".
 * Detected once by drawing 🇯🇵 on a canvas: a real flag contains a red, coloured pixel;
 * the letter fallback is monochrome.
 */
let cached: boolean | undefined

export function supportsFlagEmoji(): boolean {
  if (cached !== undefined) return cached
  cached = false
  try {
    const size = 32
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return cached
    ctx.textBaseline = 'top'
    ctx.font = `${size - 4}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`
    ctx.fillText('🇯🇵', 0, 0)
    const data = ctx.getImageData(0, 0, size, size).data
    for (let i = 0; i < data.length; i += 4) {
      const [r, g, b, a] = [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
      if (a > 0 && r > 150 && r - g > 60 && r - b > 60) {
        cached = true
        break
      }
    }
  } catch {
    // canvas unavailable — fall back to text badges
  }
  return cached
}
