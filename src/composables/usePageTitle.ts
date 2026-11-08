import { toValue, watchEffect, type MaybeRefOrGetter } from 'vue'

const SITE_NAME = 'Mad Spread Lab'

/** Sets the browser-tab title to "<title> | Mad Spread Lab", following `title` if it changes */
export function usePageTitle(title: MaybeRefOrGetter<string>) {
  watchEffect(() => {
    document.title = `${toValue(title)} | ${SITE_NAME}`
  })
}
