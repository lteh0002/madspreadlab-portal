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

const file = ref<File | null>(null)
/** What the file name says: product, months, structure, interval */
const info = ref<DataFileInfo | null>(null)
/** Problem with a picked/dropped file; shown right away, not only after submit */
const fileProblem = ref<string | null>(null)
const dragging = ref(false)
const submitted = ref(false)
const uploading = ref(false)
const uploadError = ref<string | null>(null)
const done = ref<{ product: string; file: string; message: string } | null>(null)

const formEl = ref<HTMLFormElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

const ACCEPT = UPLOAD_EXTENSIONS.join(',')
const TYPES_LABEL = UPLOAD_EXTENSIONS.join(', ')
const MAX_LABEL = `${UPLOAD_MAX_BYTES / 1024 / 1024} MB`

const errors = computed(() => {
  const e: { file?: string } = {}
  if (fileProblem.value) e.file = fileProblem.value
  else if (!file.value) e.file = 'Choose a file to upload.'
  return e
})
// File problems show as soon as a bad file is picked; "no file" waits for submit
const fileError = computed(
  () => fileProblem.value ?? (submitted.value ? errors.value.file : undefined),
)

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pick(f: File | undefined) {
  if (!f) return
  file.value = null
  info.value = null
  uploadError.value = null
  const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
  if (!(UPLOAD_EXTENSIONS as readonly string[]).includes(ext)) {
    fileProblem.value = `${f.name} isn't a supported file. Use ${TYPES_LABEL}.`
    return
  }
  if (f.size > UPLOAD_MAX_BYTES) {
    fileProblem.value = `${f.name} is ${formatSize(f.size)}. The limit is ${MAX_LABEL}.`
    return
  }
  // The file name tells the backend which product this is, so it must follow the format
  const parsed = parseDataFileName(f.name)
  if (!parsed.ok) {
    fileProblem.value = parsed.reason
    return
  }
  file.value = f
  info.value = parsed.info
  fileProblem.value = null
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  pick(input.files?.[0])
  input.value = '' // so picking the same file again still fires change
}

function onDrop(e: DragEvent) {
  dragging.value = false
  if (uploading.value) return
  pick(e.dataTransfer?.files[0])
}

async function removeFile() {
  file.value = null
  info.value = null
  fileProblem.value = null
  await nextTick()
  fileInput.value?.focus()
}

function reset() {
  file.value = null
  info.value = null
  fileProblem.value = null
  dragging.value = false
  submitted.value = false
  uploading.value = false
  uploadError.value = null
  done.value = null
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
  const f = file.value!
  const product = info.value!.product
  uploading.value = true
  uploadError.value = null
  try {
    const message = await uploadProductData(f)
    done.value = { product, file: f.name, message }
    emit('uploaded', product, f)
  } catch (e) {
    uploadError.value = (e as Error).message || 'Could not upload the file.'
  } finally {
    uploading.value = false
  }
}

async function uploadAnother() {
  reset()
  await nextTick()
  fileInput.value?.focus()
}
</script>

<template>
  <AppDialog
    v-model:open="open"
    title="Upload data"
    subtitle="Import prices from an Excel or CSV file. The file name says which product it belongs to."
    :busy="uploading"
  >
    <!-- Success -->
    <div v-if="done" class="done" role="status">
      <span class="done-icon"><AppIcon name="check" :size="28" :stroke-width="2.5" /></span>
      <p class="done-title">{{ done.file }} uploaded</p>
      <p class="sub">{{ done.message || `Data added to ${done.product}.` }}</p>
      <div class="actions">
        <button type="button" class="btn" @click="uploadAnother">Upload another</button>
        <button type="button" class="btn primary" @click="open = false">Done</button>
      </div>
    </div>

    <!-- Form -->
    <form v-else ref="formEl" class="form" novalidate @submit.prevent="submit">
      <div class="body">
        <div class="field">
          <span :id="id('file-label')" class="file-label">File</span>

          <!-- Selected file, and what its name says so the admin can check it before uploading -->
          <template v-if="file && info">
            <div class="file-card">
              <span class="file-icon"><AppIcon name="file" :size="22" /></span>
              <span class="file-meta">
                <span class="file-name">{{ file.name }}</span>
                <span class="hint">{{ formatSize(file.size) }} · file name OK</span>
              </span>
              <button
                type="button"
                class="file-remove"
                :aria-label="`Remove ${file.name}`"
                :disabled="uploading"
                @click="removeFile"
              >
                <AppIcon name="x" :size="18" />
              </button>
            </div>

            <dl class="parsed" aria-label="Read from the file name">
              <div>
                <dt>Product</dt>
                <dd>{{ info.product }}</dd>
              </div>
              <div>
                <dt>Months</dt>
                <dd>{{ info.near }} – {{ info.far }}</dd>
              </div>
              <div>
                <dt>Structure</dt>
                <dd>{{ info.structure }}</dd>
              </div>
              <div>
                <dt>Interval</dt>
                <dd>{{ info.minutes }} min</dd>
              </div>
            </dl>
          </template>

          <!-- Drop zone: the whole area is the file input's label -->
          <label
            v-else
            class="drop"
            :class="{ dragging, invalid: !!fileError }"
            @dragenter.prevent="dragging = true"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <input
              ref="fileInput"
              class="file-input"
              type="file"
              :accept="ACCEPT"
              autofocus
              :aria-labelledby="id('file-label')"
              :aria-invalid="!!fileError"
              :aria-describedby="fileError ? id('file-err') : id('file-hint')"
              @change="onFileChange"
            />
            <span class="drop-icon"><AppIcon name="upload" :size="24" :stroke-width="2" /></span>
            <span class="drop-text"><strong>Choose a file</strong> or drag it here</span>
            <span :id="id('file-hint')" class="hint">
              Name it like <code class="example">{{ DATA_FILE_EXAMPLE }}.csv</code><br />
              {{ TYPES_LABEL }} · up to {{ MAX_LABEL }}
            </span>
          </label>

          <p v-if="fileError" :id="id('file-err')" class="error">{{ fileError }}</p>
        </div>

        <p v-if="uploadError" class="error banner" role="alert">{{ uploadError }}</p>
      </div>

      <footer class="actions">
        <button type="button" class="btn" :disabled="uploading" @click="open = false">
          Cancel
        </button>
        <button type="submit" class="btn primary" :disabled="uploading">
          {{ uploading ? 'Uploading…' : 'Upload' }}
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

.parsed {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
  margin: 0.15rem 0 0;
}
.parsed div {
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  background: var(--color-background-mute);
}
.parsed dt {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.parsed dd {
  margin: 0;
  font-weight: 600;
  color: var(--color-heading);
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
</style>
