<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { BaseAlert, BaseButton, BaseLoadingBar } from 'chrome-extension-component-library'
import { errorMessage, thirdPartyGuidance, website, type Site } from '../../cleaner/model'
import { useCleaner } from '../../composables/useCleaner'
import { usePopupHeight } from '../../composables/usePopupHeight'
import QuickActions from './QuickActions.vue'
import CleanupOptions from './CleanupOptions.vue'
import CleanupResult from './CleanupResult.vue'
import RecentSites from './RecentSites.vue'
import ConfirmDialog from './ConfirmDialog.vue'

const {
  sites, currentDomain, period, thirdParty, job, error, loading, available,
  review, busy, load, beginReview, confirm, dismissResult,
} = useCleaner()
const disabled = computed(() => loading.value || !available.value || busy.value || !!review.value)
const root = useTemplateRef<HTMLElement>('root')
usePopupHeight(root)

async function openAllSites() {
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html?page=sites') })
  } catch (cause) {
    error.value = `Could not open all sites: ${errorMessage(cause)}`
  }

}

async function openWebsite(site: Site) {
  try {
    const origin = site.origins.find((origin) => {
      const target = website(origin)
      return target?.domain === site.domain && target.origin === origin
    })
    if (!origin) throw new Error('No supported website address is available.')
    await chrome.tabs.create({ url: origin })
  } catch (cause) {
    error.value = `Could not open ${site.domain}: ${errorMessage(cause)}`
  }
}
</script>

<template>
  <main ref="root" class="cleaner" aria-label="Cookie Cleaner" :aria-busy="loading || busy">
    <header v-if="currentDomain" class="header">
      <span class="site" :title="currentDomain">
        <i class="bi bi-globe2" aria-hidden="true" /> {{ currentDomain }}
      </span>
    </header>
    <BaseLoadingBar v-if="loading" />
    <BaseAlert :message="error" dismissible @dismiss="error = ''" />
    <BaseButton v-if="error && !available && !loading" variant="secondary" size="small" @click="load">
      Retry connection
    </BaseButton>
    <QuickActions
      v-model:period="period"
      :disabled="disabled"
      @clean-all="beginReview(null)"
    />
    <CleanupResult v-if="job" :job="job" @dismiss="dismissResult" />
    <section class="individual-sites" aria-labelledby="individual-sites-title">
      <div class="section-heading">
        <h2 id="individual-sites-title" class="section-title">Individual websites</h2>
        <p class="hint">All time &middot; Cookies, local storage &amp; loaded session storage.</p>
      </div>
      <CleanupOptions v-model:third-party="thirdParty" :disabled="disabled" compact />
      <div class="current-site">
        <div class="current-copy">
          <h3 class="current-title">This site</h3>
          <p class="hint current-domain">{{ currentDomain ?? 'This tab is not a supported website' }}</p>
        </div>
        <BaseButton
          variant="secondary"
          size="small"
          :disabled="disabled || !currentDomain"
          @click="currentDomain && beginReview(currentDomain)"
        >Clean this site</BaseButton>
      </div>
      <RecentSites :sites="sites" :current-domain="currentDomain" :disabled="disabled" @clean="beginReview" @open="openWebsite" @see-all="openAllSites" />
    </section>
    <details class="details">
      <summary>Tracking ads &amp; cleanup limits</summary>
      <p>{{ thirdPartyGuidance }}</p>
      <p>Advertisers' server-side data cannot be deleted, so ads may continue. Open sites can recreate cookies and storage immediately.</p>
      <p>Site cookies include subdomains. Local storage covers known origins only: the base site, recent-history origins and matching loaded frames. Unobserved subdomains or ports may retain data.</p>
      <p>Session storage has no item timestamps; only matching loaded HTTP(S) frames are reachable. Unloaded pages, closed-tab restore data and inaccessible frames may retain it. No tabs are reloaded automatically.</p>
      <p>History, passwords, cache, IndexedDB and service workers are not removed. Recent sites come from Chrome history and are never uploaded.</p>
    </details>
    <footer class="footer"><i class="bi bi-shield-check" aria-hidden="true" /> Local only. Nothing leaves your browser.</footer>
    <ConfirmDialog :request="review" @confirm="confirm" @cancel="review = null" />
  </main>
</template>

<style scoped>
.cleaner { display: grid; gap: 16px; padding: 16px; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
.site {
  overflow: hidden;
  max-width: 60%;
  padding: 3px 9px;
  color: var(--color-text-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 1px solid var(--color-border);
  border-radius: 999px;
}
.individual-sites { display: grid; gap: 14px; padding-top: 16px; border-top: 1px solid var(--color-border); }
.section-heading { display: grid; gap: 6px; }
.section-title { margin: 0; font-size: 15px; font-weight: 650; }
.hint { margin: 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.5; }
.current-site { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.current-copy { min-width: 0; }
.current-title { margin: 0 0 4px; font-size: 13px; font-weight: 600; }
.current-domain { overflow-wrap: anywhere; }
.details { border-top: 1px solid var(--color-border); padding-top: 14px; font-size: 12px; color: var(--color-text-muted); line-height: 1.6; }
.details summary { cursor: pointer; color: var(--color-text); }
.details p { margin: 10px 0 0; }
.footer { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--color-text-muted); font-size: 11px; }
</style>
