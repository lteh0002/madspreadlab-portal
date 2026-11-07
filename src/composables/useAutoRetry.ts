import { computed, onUnmounted, ref } from 'vue'

/**
 * Loading / error state for a request that retries itself after a failure, counting down
 * "Retrying in 8s…". Call `begin()` at the start of each request, then `succeed()` or `fail(e)`.
 */
export function useAutoRetry(retry: () => void, seconds = 10) {
  const loading = ref(true)
  const error = ref<string | null>(null)
  const retryIn = ref(0)
  let timer: ReturnType<typeof setInterval> | undefined

  const errorHint = computed(() =>
    retryIn.value > 0 ? `Retrying in ${retryIn.value}s…` : 'Retrying…',
  )

  function stop() {
    clearInterval(timer)
    timer = undefined
  }

  /** Cancel a pending auto-retry. While an error is showing, keep it up (with "Retrying…")
   * instead of flashing the loading state, so the screen doesn't flicker. */
  function begin() {
    stop()
    retryIn.value = 0
    if (!error.value) loading.value = true
  }

  function succeed() {
    error.value = null
    loading.value = false
  }

  /** Show the error, count down, then try again automatically */
  function fail(e: unknown) {
    error.value = (e as Error).message
    loading.value = false
    stop()
    retryIn.value = seconds
    timer = setInterval(() => {
      retryIn.value -= 1
      if (retryIn.value <= 0) {
        stop()
        retry()
      }
    }, 1000)
  }

  onUnmounted(stop)

  return { loading, error, errorHint, begin, succeed, fail }
}
