<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { BaseAlert, BaseButton, BaseLoadingBar } from 'chrome-extension-component-library'
import { periods, type CleanupJob, type CleanupRequest } from '../../cleaner/model'

const props = defineProps<{
  review: CleanupRequest | null
  job: CleanupJob | null
  busy: boolean
}>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const reviewHeading = useTemplateRef<HTMLHeadingElement>('reviewHeading')
watch(() => props.review, (review) => {
  if (!review) return
  reviewHeading.value?.focus()
  reviewHeading.value?.scrollIntoView({ block: 'nearest' })
}, { flush: 'post' })
const title = computed(() => {
  if (props.job?.status === 'running') return 'Cleaning in the background...'
  if (props.job?.steps.some((step) => step.status === 'failed')) return 'Cleanup finished with errors'
  return 'Cleanup finished with limitations'
})
const reviewPeriod = computed(() => periods.find((item) => item.value === props.review?.period)?.label)
</script>

<template>
  <section v-if="review && !busy" class="review" aria-labelledby="review-title">
    <h2 id="review-title" ref="reviewHeading" class="section-title" tabindex="-1">Review removal</h2>
    <p class="target">{{ review.domain ?? 'All websites in this Chrome profile' }}</p>
    <p class="caption">{{ reviewPeriod }} &middot; Cookies, local storage, session storage</p>
    <BaseAlert variant="warning" message="This cannot be undone. You may be signed out and lose site preferences or unsaved work." />
    <p class="caption">
      {{ review.domain ? 'Cookies include the whole site and its subdomains. Local storage covers the base site, recorded origins, and matching open frames only.' : 'Cookies and local storage across all websites are included, including installed web apps. Other extensions are excluded.' }}
      Session storage is cleared in matching loaded HTTP(S) frames only, regardless of time.
    </p>
    <div class="actions">
      <BaseButton variant="secondary" @click="emit('cancel')">Cancel</BaseButton>
      <BaseButton variant="primary" @click="emit('confirm')">Confirm removal</BaseButton>
    </div>
  </section>
  <section v-if="job" class="result" aria-labelledby="result-title" aria-live="polite">
    <h2 id="result-title" class="section-title">{{ title }}</h2>
    <p class="caption">{{ job.request.domain ?? 'All websites' }} &middot; {{ periods.find(item => item.value === job?.request.period)?.label }}</p>
    <BaseLoadingBar v-if="job.status === 'running'" />
    <ul class="steps">
      <li v-for="step in job.steps" :key="step.name" class="step">
        <i :class="['bi', step.status === 'failed' ? 'bi-exclamation-circle' : step.status === 'limited' ? 'bi-info-circle' : 'bi-check-circle', step.status]" aria-hidden="true" />
        <div>
          <strong>{{ step.name }}: {{ step.status === 'done' ? 'completed' : step.status === 'failed' ? 'error' : 'limited' }}</strong>
          <p class="caption">{{ step.detail }}</p>
        </div>
      </li>
    </ul>
    <p v-if="job.status === 'running'" class="caption">You can close the popup. Reopen it to see the saved result.</p>
  </section>
</template>

<style scoped>
.review, .result { display: grid; gap: 12px; border-top: 1px solid var(--color-border); padding-top: 18px; }
.section-title { font-size: 15px; margin: 0; }
.target { font-weight: 600; overflow-wrap: anywhere; margin: 0; }
.caption { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; margin: 0; overflow-wrap: anywhere; }
.actions { display: flex; justify-content: flex-end; gap: 10px; }
.steps { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.step { display: flex; gap: 10px; font-size: 13px; }
.step .bi { padding-top: 2px; }
.done { color: var(--color-accent); }
.failed { color: var(--color-error); }
.limited { color: var(--color-warning); }
</style>
