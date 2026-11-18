<script setup lang="ts">
import { BaseAlert, BaseButton, BaseIconButton, BaseListItem } from 'chrome-extension-component-library'
import type { Site } from '../../cleaner/model'
import { useCookieCounts } from '../../composables/useCookieCounts'

defineProps<{
  sites: Site[]
  currentDomain: string | null
  disabled: boolean
}>()
const emit = defineEmits<{ clean: [domain: string]; open: [site: Site]; seeAll: [] }>()
const { counts, loading, error } = useCookieCounts()

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
const units = [['day', 86_400_000], ['hour', 3_600_000], ['minute', 60_000]] as const

function visited(at: number): string {
  const elapsed = Date.now() - at
  const [unit, size] = units.find(([, size]) => elapsed >= size) ?? units[2]
  return `Visited ${relative.format(-Math.floor(elapsed / size), unit)}`
}

function cookieCount(domain: string): string {
  if (loading.value) return 'Counting cookies...'
  if (counts.value === null) return 'Count unavailable'
  const count = counts.value.get(domain) ?? 0
  return `${count} ${count === 1 ? 'cookie' : 'cookies'}`
}
</script>

<template>
  <section class="recent" aria-labelledby="recent-title">
    <div class="heading">
      <h2 id="recent-title" class="title">Recent sites</h2>
      <span class="hint">Last 10 &middot; stored on this device</span>
    </div>
    <p v-if="sites.length" class="hint">Site cookies, including subdomains. Counts exclude third-party cookies and web storage.</p>
    <BaseAlert :message="error" />
    <ul v-if="sites.length" class="list">
      <BaseListItem v-for="site in sites" :key="site.domain">
        <template #icon><i class="bi bi-globe" /></template>
        <div class="copy">
          <h3 class="domain" :title="site.domain">{{ site.domain }}</h3>
          <p class="meta">
            <span class="visit">{{ site.domain === currentDomain ? 'Current site' : visited(site.visitedAt) }}</span>
            <span aria-hidden="true">&middot;</span>
            <span class="cookie-count">{{ cookieCount(site.domain) }}</span>
          </p>
        </div>
        <div class="actions">
          <BaseIconButton
            variant="secondary"
            :label="`Open ${site.domain}`"
            :disabled="disabled"
            @click="emit('open', site)"
          >
            <i class="bi bi-box-arrow-up-right" aria-hidden="true" />
          </BaseIconButton>
          <BaseIconButton
            variant="secondary"
            :label="`Clean ${site.domain}`"
            :disabled="disabled"
            @click="emit('clean', site.domain)"
          >
            <i class="bi bi-trash3" aria-hidden="true" />
          </BaseIconButton>
        </div>
      </BaseListItem>
    </ul>
    <p v-else class="hint">Recent sites appear here as you browse after installing the extension.</p>
    <div class="more">
      <BaseButton variant="secondary" size="small" @click="emit('seeAll')">See all</BaseButton>
    </div>
  </section>
</template>

<style scoped>
.recent { display: grid; gap: 10px; }
.more { display: flex; justify-content: flex-end; }
.heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.title { margin: 0; font-size: 14px; font-weight: 650; }
.list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.copy { flex: 1 1 140px; min-width: 0; }
.domain, .visit { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.domain { margin: 0; font-size: 14px; font-weight: 600; line-height: 1.35; }
.meta { display: flex; gap: 5px; margin: 3px 0 0; color: var(--color-text-muted); font-size: 11px; }
.cookie-count { flex-shrink: 0; white-space: nowrap; }
.actions { display: flex; flex: 0 0 auto; gap: 7px; margin-left: auto; }
.hint { margin: 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.5; }
</style>
