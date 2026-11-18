<script setup lang="ts">
import { computed, useTemplateRef, watch } from 'vue'
import { BaseAlert, BaseButton } from 'chrome-extension-component-library'
import { cleanupScope, periodLabel, thirdPartyGuidance, type CleanupRequest } from '../../cleaner/model'

const props = defineProps<{ request: CleanupRequest | null }>()
const emit = defineEmits<{ confirm: []; cancel: [] }>()
const dialog = useTemplateRef<HTMLDialogElement>('dialog')

watch(() => props.request, (request) => {
  if (request && !dialog.value?.open) dialog.value?.showModal()
  if (!request) dialog.value?.close()
}, { flush: 'post' })

const scope = computed(() => {
  const request = props.request
  if (!request) return ''
  const site = request.domain || request.targets
    ? 'Cookies include the whole site and its subdomains. Local storage covers the base site, recorded origins, and matching open frames only.'
    : 'Cookies and local storage across all websites are included, including installed web apps. Other extensions are excluded.'
  const time = request.period === 'all' ? '' : ' Local storage is removed as whole origin stores within the time range.'
  return `${site}${time} Session storage is cleared in matching loaded frames, regardless of time.`
})

function onBackdrop(event: MouseEvent) {
  if (event.target === dialog.value) emit('cancel')
}
</script>

<template>
  <dialog
    ref="dialog"
    class="confirm cleanup-dialog"
    aria-labelledby="confirm-title"
    aria-describedby="confirm-scope"
    @cancel.prevent="emit('cancel')"
    @click="onBackdrop"
  >
    <div v-if="request" class="body">
      <h2 id="confirm-title" class="title">{{ request.targets ? 'Clean selected sites?' : request.domain ? 'Clean this site?' : 'Clean all websites?' }}</h2>
      <div class="target">
        <strong class="target-name">{{ request.targets ? cleanupScope(request) : request.domain ?? 'All websites in this Chrome profile' }}</strong>
        <span class="caption">{{ periodLabel(request.period) }} &middot; Cookies, local storage, session storage</span>
      </div>
      <ul v-if="request.targets" class="domains">
        <li v-for="target in request.targets" :key="target.domain">{{ target.domain }}</li>
      </ul>
      <BaseAlert variant="warning" message="This cannot be undone. You may be signed out and lose site preferences or unsaved work." />
      <p id="confirm-scope" class="caption">{{ scope }}</p>
      <p v-if="request.thirdParty" class="caption third-party">
        <i class="bi bi-shield-exclamation" aria-hidden="true" />
        <span>Third-party cookies: {{ thirdPartyGuidance }}</span>
      </p>
      <div class="actions">
        <BaseButton variant="secondary" autofocus @click="emit('cancel')">Cancel</BaseButton>
        <BaseButton variant="primary" @click="emit('confirm')">Confirm removal</BaseButton>
      </div>
    </div>
  </dialog>
</template>

<style scoped>
.body { display: grid; gap: 12px; padding: 18px; }
.title { margin: 0; font-size: 16px; font-weight: 650; }
.target { display: grid; gap: 3px; }
.domains { margin: 0; padding-left: 20px; max-height: 120px; overflow: auto; overflow-wrap: anywhere; font-size: 12px; }
.target-name { overflow-wrap: anywhere; }
.caption { margin: 0; color: var(--color-text-muted); font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.third-party { display: flex; gap: 8px; }
.third-party .bi { color: var(--color-warning); }
.actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
</style>
