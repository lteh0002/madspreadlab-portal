<script setup lang="ts">
import { computed } from 'vue'
import { richRuns } from '@/utils/reportFormat'

/** Report text with **bold** runs; everything else is shown as plain text */
const props = defineProps<{ text: string }>()
const runs = computed(() => richRuns(props.text))
</script>

<template>
  <template v-for="(r, i) in runs" :key="i"
    ><strong v-if="r.bold">{{ r.text }}</strong
    ><template v-else>{{ r.text }}</template></template
  >
</template>

<style scoped>
strong {
  font-weight: 600;
  color: var(--color-heading);
}
</style>
