<script setup lang="ts">
import { computed, useTemplateRef, watchPostEffect } from 'vue'
import { BaseIconButton, BaseLoadingBar } from 'chrome-extension-component-library'
import { cleanupScope, periodLabel, type CleanupJob, type CleanupStep } from '../../cleaner/model'

const props = defineProps<{ job: CleanupJob }>()
const emit = defineEmits<{ dismiss: [] }>()
const result = useTemplateRef<HTMLElement>('result')

watchPostEffect(() => {
  if (result.value instanceof HTMLDialogElement && !result.value.open) result.value.showModal()
})

function onBackdrop(event: MouseEvent) {
  if (result.value instanceof HTMLDialogElement && event.target === result.value) emit('dismiss')
}

const title = computed(() => {
  if (props.job.status === 'running') return 'Cleaning in the background...'
  if (props.job.steps.some((step) => step.status === 'failed')) return 'Cleanup finished with errors'
  const cookies = props.job.steps.filter((step) => step.name === 'Cookies' || step.name.endsWith(': Cookies'))
  if (cookies.length > 0 && cookies.every((step) => step.status === 'done')) {
    return props.job.request.domain === null && !props.job.request.targets
      ? 'Cookies removed, including third-party cookies'
      : 'Cookies removed'
  }
  return 'Cleanup finished with limitations'
})
const visibleSteps = computed(() => props.job.status === 'running'
  ? props.job.steps
  : props.job.steps.filter((step) => step.status !== 'done'))
const icons: Record<CleanupStep['status'], string> = {
  done: 'bi-check-circle', limited: 'bi-info-circle', failed: 'bi-exclamation-circle',
}
const labels: Record<CleanupStep['status'], string> = { done: 'completed', limited: 'limited', failed: 'error' }
</script>

<template>
  <component
    :is="job.status === 'complete' ? 'dialog' : 'section'"
    ref="result"
    class="result"
    :class="{ 'cleanup-dialog': job.status === 'complete' }"
    aria-labelledby="result-title"
    aria-live="polite"
    @cancel.prevent="emit('dismiss')"
    @click="onBackdrop"
  >
    <div class="heading">
      <div>
        <h2 id="result-title" class="title">{{ title }}</h2>
        <p class="caption">{{ cleanupScope(job.request) }} &middot; {{ periodLabel(job.request.period) }}</p>
        <p v-if="job.request.targets" class="caption">{{ job.completedSites ?? 0 }} / {{ job.request.targets.length }} sites processed</p>
      </div>
      <BaseIconButton
        v-if="job.status === 'complete'"
        variant="tool"
        label="Dismiss result"
        autofocus
        @click="emit('dismiss')"
      >
        <i class="bi bi-x-lg" aria-hidden="true" />
      </BaseIconButton>
    </div>
    <BaseLoadingBar v-if="job.status === 'running'" />
    <ul v-if="visibleSteps.length" class="steps">
      <li v-for="step in visibleSteps" :key="step.name" class="step">
        <i :class="['bi', icons[step.status], step.status]" aria-hidden="true" />
        <div>
          <strong>{{ step.name }}: {{ labels[step.status] }}</strong>
          <p class="caption">{{ step.detail }}</p>
        </div>
      </li>
    </ul>
    <p v-if="job.status === 'running'" class="caption">Cleanup continues if you close the popup. Completed results are not shown when you reopen it.</p>
  </component>
</template>

<style scoped>
.result {
  gap: 12px;
}
.result:not(dialog), .result[open] { display: grid; }
.result:not(dialog) {
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-editor-bg);
}
.result.cleanup-dialog { padding: 18px; }
.cleanup-dialog .title { margin: 0 0 3px; font-size: 16px; }
.heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.title { margin: 0 0 3px; font-size: 14px; font-weight: 650; }
.caption { margin: 0; color: var(--color-text-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.steps { display: grid; gap: 12px; margin: 0; padding: 0; list-style: none; }
.step { display: flex; gap: 10px; font-size: 13px; }
.step .bi { padding-top: 2px; }
.done { color: var(--color-accent); }
.failed { color: var(--color-error); }
.limited { color: var(--color-warning); }
</style>
