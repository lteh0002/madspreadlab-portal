<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import AppDialog from '@/components/AppDialog.vue'
import AppIcon from '@/components/AppIcon.vue'
import { UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES, uploadProductData } from '@/api/products'
import { DATA_FILE_EXAMPLE, parseDataFileName, type DataFileInfo } from '@/api/dataFileName'

const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ uploaded: [name: string, file: File] }>()

const uid = useId()
const id = (field: string) => `${uid}-${field}`

/** queued = in the current batch, waiting its turn (files go up one at a time) */
type Status = 'invalid' | 'ready' | 'queued' | 'uploading' | 'done' | 'failed'
interface Item {
  key: number
  file: File
  /** What the file name says: product, months, structure, interval (null when invalid) */
  info: DataFileInfo | null
  status: Status
  /** Why the file can't be uploaded, why the upload failed, or the server's summary */
  message: string
}

let nextKey = 0
const items = ref<Item[]>([])
const dragging = ref(false)
const submitted = ref(false)
const uploading = ref(false)
const finished = ref(false)

const formEl = ref<HTMLFormElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLUListElement | null>(null)

const ACCEPT = UPLOAD_EXTENSIONS.join(',')
const TYPES_LABEL = UPLOAD_EXTENSIONS.join(', ')
const MAX_LABEL = `${UPLOAD_MAX_BYTES / 1024 / 1024} MB`

/** Files still to send: never tried, or failed last time (so "Upload" retries them) */
const pending = computed(() =>
  items.value.filter((i) => i.status === 'ready' || i.status === 'failed'),
)
const doneCount = computed(() => items.value.filter((i) => i.status === 'done').length)
const failedCount = computed(() => items.value.filter((i) => i.status === 'failed').length)
const invalidCount = computed(() => items.value.filter((i) => i.status === 'invalid').length)

// "No file" waits for submit; a bad file shows its reason in its own row right away
const fileError = computed(() =>
  submitted.value && !items.value.length ? 'Choose at least one file to upload.' : undefined,
)

const uploadLabel = computed(() => {
  if (uploading.value) return `Uploading ${uploadIndex.value} of ${uploadTotal.value}…`
  const n = pending.value.length
  if (failedCount.value && n === failedCount.value) return n > 1 ? `Retry ${n} files` : 'Retry'
  return n > 1 ? `Upload ${n} files` : 'Upload'
})
/** Size of the current batch, so the button can say "Uploading 2 of 5" */
const uploadTotal = ref(0)
const uploadIndex = ref(0)
/** The file being sent right now */
const current = computed(() => items.value.find((i) => i.status === 'uploading'))

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function check(f: File): Pick<Item, 'info' | 'status' | 'message'> {
  const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext))
    return { info: null, status: 'invalid', message: `Not a supported file. Use ${TYPES_LABEL}.` }
  if (f.size > UPLOAD_MAX_BYTES)
    return {
      info: null,
      status: 'invalid',
      message: `${formatSize(f.size)} is over the ${MAX_LABEL} limit.`,
    }
  // The file name tells the backend which product this is, so it must follow the format
  const parsed = parseDataFileName(f.name)
  if (!parsed.ok) return { info: null, status: 'invalid', message: parsed.reason }
  return { info: parsed.info, status: 'ready', message: '' }
}

function add(list: FileList | null | undefined) {
  if (!list?.length) return
  finished.value = false
  for (const f of Array.from(list)) {
    // Same file picked twice: keep the one already listed
    if (items.value.some((i) => i.file.name === f.name && i.file.size === f.size)) continue
    items.value.push({ key: nextKey++, file: f, ...check(f) })
  }
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  add(input.files)
  input.value = '' // so picking the same file again still fires change
}

function onDrop(e: DragEvent) {
  dragging.value = false
  if (uploading.value) return
  add(e.dataTransfer?.files)
}

async function remove(item: Item) {
  items.value = items.value.filter((i) => i !== item)
  await nextTick()
  fileInput.value?.focus()
}

function clearInvalid() {
  items.value = items.value.filter((i) => i.status !== 'invalid')
}

function reset() {
  items.value = []
  dragging.value = false
  submitted.value = false
  uploading.value = false
  finished.value = false
}

// Start fresh every time the pop-up opens
watch(open, (isOpen) => isOpen && reset(), { immediate: true })

async function submit() {
  submitted.value = true
  if (!items.value.length) {
    await nextTick()
    fileInput.value?.focus()
    return
  }
  const batch = pending.value
  if (!batch.length) return
  uploading.value = true
  uploadTotal.value = batch.length
  uploadIndex.value = 0
  // Line up the whole batch first so every file shows "Waiting" until its turn
  // (this also clears last attempt's errors on files being retried)
  for (const item of batch) {
    item.status = 'queued'
    item.message = ''
  }
  // One request per file, one at a time: the backend reads one file per request and
  // each request body must stay under Vercel's 4.5 MB cap
  for (const item of batch) {
    uploadIndex.value++
    item.status = 'uploading'
    // Keep the file being sent in view when the list scrolls
    nextTick(() =>
      listEl.value
        ?.querySelector(`[data-key="${item.key}"]`)
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    )
    try {
      item.message = await uploadProductData(item.file)
      item.status = 'done'
      emit('uploaded', item.info!.product, item.file)
    } catch (e) {
      item.status = 'failed'
      item.message = (e as Error).message || 'Could not upload the file.'
    }
  }
  uploading.value = false
  // Everything sent and nothing left to fix: show the success screen
  finished.value = !failedCount.value && !invalidCount.value
}

async function uploadMore() {
  reset()
  await nextTick()
  fileInput.value?.focus()
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Upload data"
    subtitle="Import prices from Excel or CSV files. Each file name says which product it belongs to."
    :busy="uploading"
  >
    <!-- Success -->
    <div v-if="finished" class="done" role="status">
      <span class="done-icon"><AppIcon name="check" :size="28" :stroke-width="2.5" /></span>
      <p class="done-title">
        {{ doneCount === 1 ? `${items[0]!.file.name} uploaded` : `${doneCount} files uploaded` }}
      </p>
      <p v-if="doneCount === 1" class="sub">
        {{ items[0]!.message || `Data added to ${items[0]!.info!.product}.` }}
      </p>
      <ul v-else class="done-list">
        <li v-for="item in items" :key="item.key">
          <strong>{{ item.file.name }}</strong>
          <span>{{ item.message || `Data added to ${item.info!.product}.` }}</span>
        </li>
      </ul>
      <div class="actions">
        <button type="button" class="btn" @click="uploadMore">Upload more</button>
        <button type="button" class="btn primary" @click="open = false">Done</button>
      </div>
    </div>

    <!-- Form -->
    <form v-else ref="formEl" class="form" novalidate @submit.prevent="submit">
      <div class="body">
        <div class="field">
          <span :id="id('file-label')" class="file-label">Files</span>

          <!-- Drop zone: the whole area is the file input's label. Shrinks once files are added. -->
          <label
            class="drop"
            :class="{ dragging, compact: items.length, invalid: !!fileError, disabled: uploading }"
            @dragenter.prevent="dragging = !uploading"
            @dragover.prevent="dragging = !uploading"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <input
              ref="fileInput"
              class="file-input"
              type="file"
              multiple
              :accept="ACCEPT"
              :disabled="uploading"
              autofocus
              :aria-labelledby="id('file-label')"
              :aria-invalid="!!fileError"
              :aria-describedby="fileError ? id('file-err') : id('file-hint')"
              @change="onFileChange"
            />
            <span class="drop-icon"
              ><AppIcon name="upload" :size="items.length ? 18 : 24" :stroke-width="2"
            /></span>
            <span class="drop-text">
              <template v-if="items.length"
                ><strong>Add more files</strong> or drag them here</template
              >
              <template v-else><strong>Choose files</strong> or drag them here</template>
            </span>
            <span v-show="!items.length" :id="id('file-hint')" class="hint">
              Name each like <code class="example">{{ DATA_FILE_EXAMPLE }}.csv</code><br />
              {{ TYPES_LABEL }} · up to {{ MAX_LABEL }} each<br />
              Columns: Timestamp (UTC), Open, High, Low, Close · optional AVol, BVol
            </span>
          </label>

          <p v-if="fileError" :id="id('file-err')" class="error">{{ fileError }}</p>

          <!-- Picked files, with what each name says so the admin can check before uploading -->
          <!-- Which file is going up now; also read out by screen readers -->
          <p v-if="uploading" class="now" role="status" aria-live="polite">
            <span class="now-count">{{ uploadIndex }} of {{ uploadTotal }}</span>
            <span class="now-name">Uploading {{ current?.file.name }}</span>
          </p>

          <ul v-if="items.length" ref="listEl" class="files" aria-label="Files to upload">
            <li
              v-for="item in items"
              :key="item.key"
              :data-key="item.key"
              class="file-card"
              :class="item.status"
              :aria-current="item.status === 'uploading' ? 'step' : undefined"
            >
              <span class="file-icon">
                <span v-if="item.status === 'uploading'" class="spinner" aria-hidden="true" />
                <AppIcon
                  v-else-if="item.status === 'done'"
                  name="check"
                  :size="20"
                  :stroke-width="2.5"
                />
                <AppIcon
                  v-else-if="item.status === 'invalid' || item.status === 'failed'"
                  name="x"
                  :size="20"
                  :stroke-width="2.5"
                />
                <AppIcon v-else name="file" :size="20" />
              </span>
              <span class="file-meta">
                <span class="file-name">{{ item.file.name }}</span>
                <span
                  v-if="item.status === 'invalid' || item.status === 'failed'"
                  class="file-msg error"
                >
                  {{ item.message }}
                </span>
                <span v-else-if="item.status === 'queued'" class="file-msg">Waiting…</span>
                <span v-else-if="item.status === 'uploading'" class="file-msg uploading-msg">
                  Uploading…
                </span>
                <span v-else-if="item.status === 'done'" class="file-msg">
                  {{ item.message || `Data added to ${item.info!.product}.` }}
                </span>
                <span v-else-if="item.info" class="file-msg">
                  {{ item.info.product }} · {{ item.info.near }} – {{ item.info.far }} ·
                  {{ item.info.structure }} · {{ item.info.minutes }} min ·
                  {{ formatSize(item.file.size) }}
                </span>
              </span>
              <button
                v-if="item.status !== 'done'"
                type="button"
                class="file-remove"
                :aria-label="`Remove ${item.file.name}`"
                :disabled="uploading"
                @click="remove(item)"
              >
                <AppIcon name="x" :size="18" />
              </button>
            </li>
          </ul>

          <p v-if="invalidCount && !uploading" class="hint skip-note">
            {{ invalidCount }} file{{ invalidCount > 1 ? 's' : '' }} can't be uploaded and will be
            skipped.
            <button type="button" class="link-btn" @click="clearInvalid">
              Remove {{ invalidCount > 1 ? 'them' : 'it' }}
            </button>
          </p>
        </div>

        <p v-if="failedCount && !uploading" class="error banner" role="alert">
          {{ failedCount }} file{{ failedCount > 1 ? 's' : '' }} failed to upload{{
            doneCount ? `, ${doneCount} uploaded` : ''
          }}. Fix the problem and retry.
        </p>
      </div>

      <footer class="actions">
        <button type="button" class="btn" :disabled="uploading" @click="open = false">
          {{ doneCount ? 'Close' : 'Cancel' }}
        </button>
        <button
          type="submit"
          class="btn primary"
          :disabled="uploading || (!!items.length && !pending.length)"
        >
          {{ uploadLabel }}
        </button>
      </footer>
    </form>
  </AppDialog>
</template>

<style scoped>
.file-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-heading);
}

.drop {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  padding: 1.75rem 1rem;
  border: 1.5px dashed var(--color-border-hover);
  border-radius: var(--radius-md);
  background: var(--color-background);
  text-align: center;
  cursor: pointer;
  transition:
    border-color 0.15s,
    background 0.15s;
}
.drop:hover,
.drop.dragging {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.drop.invalid {
  border-color: #e5484d;
}
.drop:has(.file-input:focus-visible) {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
/* Visually hidden but still focusable and announced; the label is the click target */
.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.drop-icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 0.25rem;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.drop-text {
  font-size: 0.95rem;
  color: var(--color-text);
}
.drop-text strong {
  font-weight: 600;
  color: var(--color-accent);
}

.example {
  font-size: 0.8rem;
  color: var(--color-heading);
  overflow-wrap: anywhere;
}

.file-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 0.75rem 0.75rem 0.9rem;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-md);
  background: var(--color-background);
  transition:
    opacity 0.2s,
    border-color 0.2s,
    background-color 0.2s;
}
.file-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.file-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
  color: var(--color-heading);
}
.file-remove {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-text);
  cursor: pointer;
}
.file-remove:hover:not(:disabled) {
  background: var(--color-background-mute);
  color: var(--color-heading);
}
.file-remove:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Compact drop zone once files are listed */
.drop.compact {
  flex-direction: row;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
}
.drop.compact .drop-icon {
  width: 32px;
  height: 32px;
  margin: 0;
}
.drop.disabled {
  opacity: 0.55;
  cursor: not-allowed;
  pointer-events: none;
}

.files {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 18rem;
  margin: 0.25rem 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}
.file-msg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.file-msg.error {
  white-space: normal;
  color: #e5484d;
}
.file-card.invalid,
.file-card.failed {
  border-color: color-mix(in srgb, #e5484d 45%, transparent);
}
.file-card.invalid .file-icon,
.file-card.failed .file-icon {
  background: color-mix(in srgb, #e5484d 14%, transparent);
  color: #e5484d;
}
.file-card.queued {
  opacity: 0.6;
}
.file-card.uploading {
  border-color: var(--color-accent);
  background: var(--color-accent-soft);
}
.uploading-msg {
  font-weight: 500;
  color: var(--color-accent);
}

/* Current-file line shown while a batch uploads */
.now {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  min-width: 0;
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
}
.now-count {
  flex: none;
  padding: 0.1rem 0.55rem;
  border-radius: 999px;
  background: var(--color-accent-soft);
  color: var(--color-accent-strong);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.now-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-heading);
}

.file-card.done {
  border-color: var(--color-accent-border);
}
.file-card.done .file-icon {
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid var(--color-accent-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 2.4s;
  }
}

.skip-note {
  margin: 0;
}
.link-btn {
  padding: 0;
  border: 0;
  background: none;
  color: var(--color-accent);
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.done-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  width: 100%;
  max-height: 14rem;
  margin: 0.25rem 0 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
  text-align: left;
  font-size: 0.85rem;
}
.done-list li {
  display: flex;
  flex-direction: column;
  padding: 0.5rem 0.75rem;
  border-radius: 8px;
  background: var(--color-background-mute);
}
.done-list strong {
  overflow-wrap: anywhere;
  font-weight: 600;
  color: var(--color-heading);
}
</style>
