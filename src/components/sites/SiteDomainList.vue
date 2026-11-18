<script setup lang="ts">
import { BaseCheckbox } from 'chrome-extension-component-library'
import { computed } from 'vue'
import type { DomainEntry } from '../../cleaner/catalogue'

const props = defineProps<{
  sites: DomainEntry[]
  selected: Set<string>
  pageSelected: boolean
  disabled: boolean
}>()
const emit = defineEmits<{ select: [domain: string, checked: boolean]; selectPage: [checked: boolean] }>()
const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const selectedOnPage = computed(() => props.sites.filter((site) => props.selected.has(site.domain)).length)
</script>

<template>
  <div class="domain-list">
    <div class="list-heading">
      <div class="page-selection">
        <BaseCheckbox
          :model-value="pageSelected" :disabled="disabled || !sites.length"
          label="Select page" @update:model-value="emit('selectPage', $event)"
        />
        <span class="muted">{{ selectedOnPage }} / {{ sites.length }} selected</span>
      </div>
      <span>Website / Last visit</span>
      <span>Cookies</span>
    </div>
    <ul class="rows">
      <li v-for="site in sites" :key="site.domain" class="row">
        <BaseCheckbox
          :model-value="selected.has(site.domain)" :disabled="disabled"
          :label="`Select ${site.domain}`" @update:model-value="emit('select', site.domain, $event)"
        />
        <div class="domain">
          <strong>{{ site.domain }}</strong>
          <span class="muted">{{ site.visitedAt === null ? 'Visit date unknown' : date.format(site.visitedAt) }}</span>
        </div>
        <span class="cookie-count">{{ site.cookieCount === null ? 'Count unavailable' : site.cookieCount === 0 ? 'No cookies' : `${site.cookieCount} ${site.cookieCount === 1 ? 'cookie' : 'cookies'}` }}</span>
      </li>
    </ul>
    <p v-if="!sites.length" class="empty">No discoverable websites found.</p>
  </div>
</template>

<style scoped>
.domain-list { border: 1px solid var(--color-border); border-radius: 10px; overflow: hidden; }
.list-heading, .row { display: grid; grid-template-columns: 115px minmax(0, 1fr) 120px; align-items: center; gap: 12px; padding: 14px 18px; }
.list-heading { background: var(--color-editor-bg); font-size: 12px; }
.rows { list-style: none; padding: 0; margin: 0; }
.page-selection { display: grid; gap: 5px; }
.row { border-top: 1px solid var(--color-border); font-size: 13px; }
.row :deep(label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.domain { display: grid; gap: 5px; overflow-wrap: anywhere; }
.muted, .cookie-count, .empty { color: var(--color-text-muted); font-size: 12px; }
.empty { padding: 20px; }
@media (max-width: 600px) {
  .list-heading, .row { grid-template-columns: 30px minmax(0, 1fr) 85px; gap: 8px; padding: 12px; }
  .list-heading { display: flex; justify-content: space-between; flex-wrap: wrap; }
}
</style>
