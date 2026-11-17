<script setup lang="ts">
import { computed } from 'vue'
import { BaseAlert, BaseButton, BaseSelect, type SelectOption } from 'chrome-extension-component-library'
import { periods, type Period, type Site } from '../../cleaner/model'

const props = defineProps<{
  sites: Site[]
  currentDomain: string | null
  disabled: boolean
}>()
const target = defineModel<string>('target', { required: true })
const period = defineModel<Period>('period', { required: true })
const emit = defineEmits<{ review: [] }>()
const timeOptions = periods.map((item) => ({ ...item }))
const options = computed<SelectOption<string>[]>(() => {
  const domains = [...new Set([
    ...(props.currentDomain ? [props.currentDomain] : []),
    ...props.sites.map((site) => site.domain),
  ])]
  return [
    { value: '', label: 'Choose a website', disabled: true },
    ...domains.map((domain) => ({
      value: domain,
      label: `${domain}${domain === props.currentDomain ? ' (current site)' : ''}`,
    })),
    { value: '__all__', label: 'All websites' },
  ]
})
</script>

<template>
  <section class="scope" aria-labelledby="custom-title">
    <div class="section-heading">
      <h2 id="custom-title" class="section-title">Custom cleanup</h2>
      <p class="hint">A specific website, a specific moment.</p>
    </div>
    <div class="fields">
      <div class="field">
        <label class="field-label" for="website">Website</label>
        <BaseSelect id="website" v-model="target" :options="options" :disabled="disabled" />
      </div>
      <div class="field">
        <label class="field-label" for="period">Time range</label>
        <BaseSelect id="period" v-model="period" :options="timeOptions" :disabled="disabled" />
      </div>
    </div>
    <p class="hint">Last 10 sites &middot; Stored only on this device</p>
    <p v-if="!currentDomain" class="hint">
      This tab is not a supported website. Choose a recent site or all websites.
    </p>
    <p v-if="!sites.length" class="hint">
      Recent sites appear as you browse after installing the extension.
    </p>
    <BaseAlert
      v-if="period !== 'all'"
      variant="info"
      message="Cookies are time-filtered. Local storage uses whole origin stores; loaded session stores are cleared in full, regardless of age."
    />
    <div class="scope-actions">
      <BaseButton variant="secondary" :disabled="disabled || !target" @click="emit('review')">
        Review cleanup
      </BaseButton>
    </div>
  </section>
</template>

<style scoped>
.scope, .field { display: grid; gap: 8px; }
.scope { gap: 14px; padding: 16px; border: 1px solid var(--color-border); border-radius: 10px; background: var(--color-editor-bg); }
.section-heading { display: grid; gap: 4px; }
.section-title { margin: 0; font-size: 14px; font-weight: 650; }
.fields { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 12px; }
.field { min-width: 0; }
.field-label { font-size: 12px; font-weight: 600; }
.scope-actions { display: flex; justify-content: flex-end; }
.hint { color: var(--color-text-muted); font-size: 12px; line-height: 1.5; margin: 0; }
</style>
