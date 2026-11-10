<script setup lang="ts">
import { computed, onUnmounted, ref, useId, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import {
  deleteSpread,
  fetchManagedProducts,
  type ManagedProduct,
  type ManagedSpread,
} from '@/api/products'

const open = defineModel<boolean>('open', { required: true })

const uid = useId()
const id = (field: string) => `${uid}-${field}`

const products = ref<ManagedProduct[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
let controller: AbortController | undefined

const productId = ref('')
const spreadId = ref('')
/** Must match the spread's label before the delete button unlocks */
const confirmText = ref('')
const deleting = ref(false)
const deleteError = ref<string | null>(null)
const deleted = ref<{ label: string; productName: string; bars: number } | null>(null)

const numberFmt = new Intl.NumberFormat('en-US')
const barsText = (n: number) => `${numberFmt.format(n)} price bar${n === 1 ? '' : 's'}`
const labelOf = (s: ManagedSpread) => `${s.front}-${s.back}`

const product = computed(() => products.value.find((p) => p._id === productId.value))
const spread = computed(() => product.value?.spreads.find((s) => s.id === spreadId.value))
const hasSpreads = computed(() => products.value.some((p) => p.spreads.length > 0))
const canDelete = computed(
  () =>
    !!spread.value &&
    !deleting.value &&
    confirmText.value.trim().toLowerCase() === labelOf(spread.value).toLowerCase(),
)

async function load() {
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  loadError.value = null
  try {
    products.value = await fetchManagedProducts(undefined, controller.signal)
    loading.value = false
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    loadError.value = (e as Error).message
    loading.value = false
  }
}

// Start fresh, with the current spreads, every time the pop-up opens
watch(
  open,
  (isOpen) => {
    if (!isOpen) {
      controller?.abort()
      return
    }
    productId.value = ''
    spreadId.value = ''
    confirmText.value = ''
    deleteError.value = null
    deleted.value = null
    load()
  },
  { immediate: true },
)
onUnmounted(() => controller?.abort())

watch(productId, () => (spreadId.value = ''))
watch(spreadId, () => {
  confirmText.value = ''
  deleteError.value = null
})

async function submit() {
  const p = product.value
  const s = spread.value
  if (!p || !s || !canDelete.value) return
  deleting.value = true
  deleteError.value = null
  try {
    const bars = await deleteSpread(s.id)
    p.spreads = p.spreads.filter((x) => x.id !== s.id)
    deleted.value = { label: labelOf(s), productName: p.name, bars }
    spreadId.value = ''
  } catch (e) {
    deleteError.value = (e as Error).message || 'Could not delete the spread.'
  } finally {
    deleting.value = false
  }
}

function deleteAnother() {
  deleted.value = null
  if (!product.value?.spreads.length) productId.value = ''
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Delete spread"
    subtitle="Permanently removes a spread and its price data."
    :busy="deleting"
  >
    <!-- Success -->
    <div v-if="deleted" class="done" role="status">
      <span class="done-icon"><AppIcon name="check" :size="28" :stroke-width="2.5" /></span>
      <p class="done-title">{{ deleted.productName }} {{ deleted.label }} deleted</p>
      <p class="sub">{{ barsText(deleted.bars) }} removed</p>
      <div class="actions">
        <button type="button" class="btn" @click="deleteAnother">Delete another</button>
        <button type="button" class="btn primary" @click="open = false">Done</button>
      </div>
    </div>

    <!-- Loading, or the list couldn't be fetched, or there's nothing to delete -->
    <template v-else-if="loading || loadError || !hasSpreads">
      <div class="body">
        <p v-if="loading" class="hint" role="status">Loading spreads…</p>
        <p v-else-if="loadError" class="error banner" role="alert">{{ loadError }}</p>
        <p v-else class="hint">There are no spreads to delete.</p>
      </div>
      <div class="actions">
        <button v-if="loadError" type="button" class="btn" @click="load">Retry</button>
        <button type="button" class="btn ghost" @click="open = false">Close</button>
      </div>
    </template>

    <!-- Form -->
    <form v-else class="form" novalidate @submit.prevent="submit">
      <div class="body">
        <div class="field">
          <label :for="id('product')">Product</label>
          <span class="select-wrap">
            <select
              :id="id('product')"
              v-model="productId"
              :class="{ empty: !productId }"
              :disabled="deleting"
            >
              <option value="" disabled>Select a product</option>
              <option
                v-for="p in products"
                :key="p._id"
                :value="p._id"
                :disabled="!p.spreads.length"
              >
                {{ p.name }} · {{ p.exchange }}{{ p.spreads.length ? '' : ' (no spreads)' }}
              </option>
            </select>
            <AppIcon name="chevron-down" :size="16" class="select-chev" />
          </span>
        </div>

        <div class="field">
          <label :for="id('spread')">Spread</label>
          <span class="select-wrap">
            <select
              :id="id('spread')"
              v-model="spreadId"
              :class="{ empty: !spreadId }"
              :disabled="!product || deleting"
            >
              <option value="" disabled>
                {{ product ? 'Select a spread' : 'Select a product first' }}
              </option>
              <option v-for="s in product?.spreads ?? []" :key="s.id" :value="s.id">
                {{ labelOf(s) }} ({{ s.spreadName }}) · {{ barsText(s.bars) }}
              </option>
            </select>
            <AppIcon name="chevron-down" :size="16" class="select-chev" />
          </span>
        </div>

        <template v-if="product && spread">
          <p class="error banner">
            This deletes {{ product.name }} {{ labelOf(spread) }}, its {{ barsText(spread.bars)
            }}<template v-if="spread.fairValue !== null">
              and its fair value of {{ spread.fairValue }}</template
            >. This can't be undone.
          </p>
          <div class="field">
            <label :for="id('confirm')">Type {{ labelOf(spread) }} to confirm</label>
            <input
              :id="id('confirm')"
              v-model="confirmText"
              type="text"
              autocomplete="off"
              spellcheck="false"
              :readonly="deleting"
            />
          </div>
        </template>

        <p v-if="deleteError" class="error banner" role="alert">{{ deleteError }}</p>
      </div>

      <div class="actions">
        <button type="button" class="btn ghost" :disabled="deleting" @click="open = false">
          Cancel
        </button>
        <button type="submit" class="btn danger" :disabled="!canDelete">
          <AppIcon name="trash" :size="16" />
          {{ deleting ? 'Deleting…' : 'Delete spread' }}
        </button>
      </div>
    </form>
  </AppDialog>
</template>
