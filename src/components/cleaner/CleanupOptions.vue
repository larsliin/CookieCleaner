<script setup lang="ts">
import { shallowRef } from 'vue'
import { BaseAlert, BaseSwitch } from 'chrome-extension-component-library'
import { thirdPartyGuidance } from '../../cleaner/model'

defineProps<{ disabled: boolean; compact?: boolean }>()
const thirdParty = defineModel<boolean>('thirdParty', { required: true })
const showReminder = shallowRef(false)

function updateThirdParty(value: boolean) {
  thirdParty.value = value
  showReminder.value = value
}
</script>

<template>
  <div class="options">
      <BaseSwitch id="third-party" :model-value="thirdParty" :disabled="disabled" label="Also remove third-party cookies" @update:model-value="updateThirdParty" />
      <p class="hint">Keep the site open to find third-party cookies. Some may remain. Saved for current, recent and selected sites.</p>
      <BaseAlert
        v-if="showReminder" variant="warning"
        :message="compact ? 'Removing these cookies may affect other sites and sign you out.' : thirdPartyGuidance"
        dismissible @dismiss="showReminder = false"
      />
  </div>
</template>

<style scoped>
.options {
  display: grid;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: 10px;
  background: var(--color-editor-bg);
}
.hint { margin: 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.5; }
</style>
