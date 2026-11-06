<script setup lang="ts">
import { ref, useId, watch, nextTick } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

/**
 * Modal pop-up shell: centered panel, title bar with a close button, backdrop, Esc to close.
 * Put a `<form class="form">` with `.body` and `.actions` (or any content) in the default slot;
 * the form styles below are shared by every pop-up. An element with `autofocus` gets focus on open.
 */
const props = withDefaults(
  defineProps<{
    title: string
    subtitle?: string
    /** While true the pop-up can't be closed (e.g. a request in flight) */
    busy?: boolean
  }>(),
  { subtitle: '', busy: false },
)

const open = defineModel<boolean>('open', { required: true })

const titleId = `${useId()}-title`
const dialog = ref<HTMLDialogElement | null>(null)

// Open/close the native dialog from the v-model; showModal gives focus trapping, Esc and a backdrop
watch(
  open,
  async (isOpen) => {
    await nextTick()
    const el = dialog.value
    if (!el) return
    if (isOpen && !el.open) el.showModal()
    else if (!isOpen && el.open) el.close()
  },
  { immediate: true },
)

function close() {
  if (!props.busy) open.value = false
}

/** Esc fires `cancel`; block it while busy */
function onCancel(e: Event) {
  if (props.busy) e.preventDefault()
}

/** Click on the dimmed area outside the panel closes the pop-up */
function onDialogClick(e: MouseEvent) {
  if (e.target === dialog.value) close()
}

defineExpose({ close })
</script>

<template>
  <dialog
    ref="dialog"
    class="app-dialog"
    :aria-labelledby="titleId"
    @close="open = false"
    @cancel="onCancel"
    @click="onDialogClick"
  >
    <div class="panel">
      <header class="head">
        <div>
          <h2 :id="titleId">{{ title }}</h2>
          <p v-if="subtitle" class="sub">{{ subtitle }}</p>
        </div>
        <button type="button" class="icon-btn" aria-label="Close" :disabled="busy" @click="close">
          <AppIcon name="x" :size="20" />
        </button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
.app-dialog {
  /* base.css resets every margin to 0; auto margins are what center a modal dialog */
  margin: auto;
  width: min(600px, calc(100vw - 2rem));
  max-height: calc(100dvh - 2rem);
  padding: 0;
  border: 1px solid var(--color-border-hover);
  border-radius: var(--radius-lg);
  background: var(--color-background-soft);
  color: var(--color-text);
  box-shadow: 0 30px 80px -30px rgba(0, 0, 0, 0.8);
}
.app-dialog::backdrop {
  background: color-mix(in srgb, var(--color-background) 70%, transparent);
  -webkit-backdrop-filter: blur(4px);
  backdrop-filter: blur(4px);
}
.app-dialog[open] {
  animation: pop 0.18s ease-out;
}
@keyframes pop {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
}
@media (prefers-reduced-motion: reduce) {
  .app-dialog[open] {
    animation: none;
  }
}

.panel {
  display: flex;
  flex-direction: column;
  max-height: calc(100dvh - 2rem);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.4rem 1.5rem 1rem;
  border-bottom: 1px solid var(--color-border);
}
h2 {
  font-size: 1.35rem;
  font-weight: 600;
  color: var(--color-heading);
}

.icon-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--color-heading);
  cursor: pointer;
}
.icon-btn:hover:not(:disabled) {
  background: var(--color-background-mute);
}
.icon-btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
</style>

<!-- Shared content styles for every pop-up's slot. Unscoped, so each rule is namespaced under .app-dialog. -->
<style>
.app-dialog .sub {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.app-dialog .form {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.app-dialog .body {
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
}
.app-dialog .row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.app-dialog .field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
}
.app-dialog .field > label {
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--color-heading);
}

.app-dialog input[type='text'],
.app-dialog select {
  width: 100%;
  min-height: 42px;
  padding: 0.5rem 0.75rem;
  font: inherit;
  font-size: 0.95rem;
  color: var(--color-heading);
  background: var(--color-background);
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
  color-scheme: light dark;
}
.app-dialog input[type='text']::placeholder {
  color: var(--color-text-muted);
}
.app-dialog input[type='text']:focus-visible,
.app-dialog select:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 0;
  border-color: transparent;
}
.app-dialog input[aria-invalid='true'],
.app-dialog select[aria-invalid='true'] {
  border-color: #e5484d;
}

/* Native select arrows ignore padding; hide them and draw our own chevron */
.app-dialog .select-wrap {
  position: relative;
  display: block;
}
.app-dialog select {
  -webkit-appearance: none;
  appearance: none;
  padding-right: 2.5rem;
  cursor: pointer;
}
.app-dialog .select-chev {
  position: absolute;
  top: 50%;
  right: 0.75rem;
  transform: translateY(-50%);
  color: var(--color-text-muted);
  pointer-events: none;
}
.app-dialog .select-wrap:hover .select-chev,
.app-dialog select:focus-visible + .select-chev {
  color: var(--color-heading);
}
/* "Select …" reads as a placeholder until a value is picked */
.app-dialog select.empty {
  color: var(--color-text-muted);
}
.app-dialog select option {
  color: var(--color-heading);
}

.app-dialog .hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}
.app-dialog .error {
  font-size: 0.8rem;
  color: #ff8a8a;
}
:root[data-theme='light'] .app-dialog .error {
  color: #c62828;
}
.app-dialog .error.banner {
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  background: color-mix(in srgb, #e5484d 12%, transparent);
}

.app-dialog .actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding: 1rem 1.5rem 1.25rem;
  border-top: 1px solid var(--color-border);
}
.app-dialog .btn {
  min-height: 42px;
  padding: 0.5rem 1.1rem;
  font: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  border: 1px solid var(--color-border-hover);
  border-radius: 8px;
  background: transparent;
  color: var(--color-heading);
  cursor: pointer;
}
.app-dialog .btn:hover:not(:disabled) {
  background: var(--color-background-mute);
}
.app-dialog .btn.primary {
  border-color: transparent;
  background: var(--color-accent-solid);
  color: var(--color-on-accent);
}
.app-dialog .btn.primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-accent-solid) 85%, #000);
}
.app-dialog .btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.app-dialog .btn:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

/* Success screen */
.app-dialog .done {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 2rem 1.5rem 0;
  text-align: center;
}
.app-dialog .done-icon {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  margin-bottom: 0.4rem;
  border-radius: 50%;
  background: var(--color-accent-soft);
  color: var(--color-accent);
}
.app-dialog .done-title {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--color-heading);
  overflow-wrap: anywhere;
}
.app-dialog .done .actions {
  align-self: stretch;
  margin-top: 1.5rem;
  border-top: 0;
  padding-inline: 0;
}
</style>
