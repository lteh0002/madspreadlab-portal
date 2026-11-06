<script setup lang="ts">
import { computed, nextTick, reactive, ref, useId, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import { createProduct, type NewProduct } from '@/api/products'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ created: [product: NewProduct] }>()

const uid = useId()
const id = (field: string) => `${uid}-${field}`

/** The only exchanges that can be picked; add one here to offer it */
const EXCHANGES = [
  { code: 'JPX', name: 'Japan Exchange Group' },
  { code: 'SGX', name: 'Singapore Exchange' },
  { code: 'TAIFEX', name: 'Taiwan Futures Exchange' },
  { code: 'BMD', name: 'Bursa Malaysia Derivatives' },
  { code: 'HKEX', name: 'Hong Kong Exchanges' },
  { code: 'CME', name: 'CME Group' },
  { code: 'ICE', name: 'Intercontinental Exchange' },
]
/** The only currencies that can be picked; add one here to offer it */
const CURRENCIES = [
  { code: 'JPY', name: 'Japanese yen' },
  { code: 'SGD', name: 'Singapore dollar' },
  { code: 'TWD', name: 'New Taiwan dollar' },
  { code: 'MYR', name: 'Malaysian ringgit' },
  { code: 'HKD', name: 'Hong Kong dollar' },
  { code: 'CNY', name: 'Chinese yuan' },
  { code: 'USD', name: 'US dollar' },
  { code: 'EUR', name: 'Euro' },
]

const blank = () => ({ name: '', exchange: '', currency: '' })

const form = reactive(blank())
const submitted = ref(false)
const saving = ref(false)
const saveError = ref<string | null>(null)
const created = ref<NewProduct | null>(null)
const formEl = ref<HTMLFormElement | null>(null)
const firstField = ref<HTMLInputElement | null>(null)

// Duplicate names are checked by the database; its error shows in the banner
const errors = computed(() => {
  const e: Partial<Record<keyof typeof form, string>> = {}
  if (!form.name.trim()) e.name = 'Enter a product name.'
  if (!form.exchange) e.exchange = 'Choose an exchange.'
  if (!form.currency) e.currency = 'Choose a currency.'
  return e
})
const showError = (field: keyof typeof form) => (submitted.value ? errors.value[field] : undefined)

function reset() {
  Object.assign(form, blank())
  submitted.value = false
  saving.value = false
  saveError.value = null
  created.value = null
}

// Start fresh every time the pop-up opens
watch(open, (isOpen) => isOpen && reset(), { immediate: true })

async function submit() {
  submitted.value = true
  if (Object.keys(errors.value).length) {
    await nextTick()
    formEl.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
    return
  }
  saving.value = true
  saveError.value = null
  try {
    created.value = await createProduct({
      name: form.name.trim(),
      exchange: form.exchange,
      currency: form.currency,
    })
    emit('created', created.value)
  } catch (e) {
    saveError.value = (e as Error).message || 'Could not save the product.'
  } finally {
    saving.value = false
  }
}

async function addAnother() {
  reset()
  await nextTick()
  firstField.value?.focus()
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Add new product"
    subtitle="Creates the product in the database. Upload its data afterwards."
    :busy="saving"
  >
    <!-- Success -->
    <div v-if="created" class="done" role="status">
      <span class="done-icon"><AppIcon name="check" :size="28" :stroke-width="2.5" /></span>
      <p class="done-title">{{ created.name }} added</p>
      <p class="sub">{{ created.exchange }} · {{ created.currency }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="addAnother">Add another</button>
        <button type="button" class="btn primary" @click="open = false">Done</button>
      </div>
    </div>

    <!-- Form -->
    <form v-else ref="formEl" class="form" novalidate @submit.prevent="submit">
      <div class="body">
        <div class="field">
          <label :for="id('name')">Name</label>
          <input
            :id="id('name')"
            ref="firstField"
            v-model="form.name"
            type="text"
            placeholder="e.g. 1x6"
            autocomplete="off"
            autofocus
            :aria-invalid="!!showError('name')"
            :aria-describedby="showError('name') ? id('name-err') : undefined"
          />
          <p v-if="showError('name')" :id="id('name-err')" class="error">
            {{ showError('name') }}
          </p>
        </div>

        <div class="row">
          <div class="field">
            <label :for="id('exchange')">Exchange</label>
            <span class="select-wrap">
              <select
                :id="id('exchange')"
                v-model="form.exchange"
                :class="{ empty: !form.exchange }"
                :aria-invalid="!!showError('exchange')"
                :aria-describedby="showError('exchange') ? id('exchange-err') : undefined"
              >
                <option value="" disabled>Select exchange</option>
                <option v-for="x in EXCHANGES" :key="x.code" :value="x.code">
                  {{ x.code }} · {{ x.name }}
                </option>
              </select>
              <AppIcon name="chevron-down" :size="18" class="select-chev" />
            </span>
            <p v-if="showError('exchange')" :id="id('exchange-err')" class="error">
              {{ showError('exchange') }}
            </p>
          </div>

          <div class="field">
            <label :for="id('currency')">Currency</label>
            <span class="select-wrap">
              <select
                :id="id('currency')"
                v-model="form.currency"
                :class="{ empty: !form.currency }"
                :aria-invalid="!!showError('currency')"
                :aria-describedby="showError('currency') ? id('currency-err') : undefined"
              >
                <option value="" disabled>Select currency</option>
                <option v-for="c in CURRENCIES" :key="c.code" :value="c.code">
                  {{ c.code }} · {{ c.name }}
                </option>
              </select>
              <AppIcon name="chevron-down" :size="18" class="select-chev" />
            </span>
            <p v-if="showError('currency')" :id="id('currency-err')" class="error">
              {{ showError('currency') }}
            </p>
          </div>
        </div>

        <p v-if="saveError" class="error banner" role="alert">{{ saveError }}</p>
      </div>

      <footer class="actions">
        <button type="button" class="btn" :disabled="saving" @click="open = false">Cancel</button>
        <button type="submit" class="btn primary" :disabled="saving">
          {{ saving ? 'Saving…' : 'Add product' }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>
