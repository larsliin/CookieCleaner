<script setup lang="ts">
import { BaseAlert, BaseButton, BaseLoadingBar } from 'chrome-extension-component-library'
import { useSiteManager } from '../../composables/useSiteManager'
import CleanupOptions from '../cleaner/CleanupOptions.vue'
import CleanupResult from '../cleaner/CleanupResult.vue'
import ConfirmDialog from '../cleaner/ConfirmDialog.vue'
import SiteManagerToolbar from './SiteManagerToolbar.vue'
import SiteDomainList from './SiteDomainList.vue'

const {
  entries, warnings, loadingCatalogue, selected, order, page, pageCount, visible,
  disabled, pageSelected, notice, toggle, togglePage, refresh, reviewSelected, reviewAll,
  thirdParty, job, error, review, busy, confirm, dismissResult,
} = useSiteManager()
</script>

<template>
  <main class="manager" :aria-busy="loadingCatalogue || busy">
    <header class="header">
      <div>
        <p class="eyebrow">Cookie Cleaner</p>
        <h1 class="title">All sites</h1>
        <p class="muted">Review website data and choose what to clear.</p>
      </div>
      <BaseButton variant="secondary" :disabled="disabled" @click="reviewAll">Clear all site data</BaseButton>
    </header>
    <BaseAlert :message="error" />
    <BaseAlert v-for="warning in warnings" :key="warning" variant="warning" :message="warning" />
    <BaseAlert v-if="notice" variant="info" :message="notice" />
    <p class="explanation">
      Sites from retained browsing history, current cookies, open tabs and recent visits.
      "No cookies" does not mean no other storage. Chrome cannot list every storage-only domain.
      Cleanup does not delete browsing history.
    </p>
    <section class="selection-settings" aria-label="Selected-site settings">
      <div>
        <h2 class="section-title">Selected-site cleanup</h2>
        <p class="muted">All time: cookies, known-origin local storage and reachable session storage.</p>
      </div>
      <CleanupOptions v-model:third-party="thirdParty" :disabled="disabled" />
    </section>
    <p class="muted">Other saved website data can only be cleared at website addresses the extension knows about. Temporary tab data can only be cleared in loaded pages and embedded content the extension can access. Open websites may save new data again, even just after cleaning.</p>
    <SiteManagerToolbar
      v-model:order="order" :count="selected.size" :disabled="disabled"
      @refresh="refresh" @clean="reviewSelected" @clear="selected = new Set()"
    />
    <BaseLoadingBar v-if="loadingCatalogue" />
    <p class="muted">{{ entries.length }} websites &middot; 25 per page</p>
    <SiteDomainList
      :sites="visible" :selected="selected" :page-selected="pageSelected" :disabled="disabled"
      @select="toggle" @select-page="togglePage"
    />
    <nav class="pagination" aria-label="Site pages">
      <BaseButton variant="secondary" :disabled="disabled || page <= 1" @click="page--">Previous</BaseButton>
      <span aria-live="polite">Page {{ page }} of {{ pageCount }}</span>
      <BaseButton variant="secondary" :disabled="disabled || page >= pageCount" @click="page++">Next</BaseButton>
    </nav>
    <CleanupResult v-if="job" :job="job" @dismiss="dismissResult" />
    <ConfirmDialog :request="review" @confirm="confirm" @cancel="review = null" />
  </main>
</template>

<style scoped>
.manager { display: grid; gap: 20px; max-width: 1080px; margin: 0 auto; padding: 40px 28px; }
.header { display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap; }
.eyebrow { color: var(--color-accent); font-size: 12px; font-weight: 600; margin: 0 0 6px; }
.title { font-size: 30px; letter-spacing: -0.8px; margin: 0 0 8px; }
.muted, .explanation { color: var(--color-text-muted); font-size: 12px; line-height: 1.6; margin: 0; }
.explanation { border-top: 1px solid var(--color-border); padding-top: 18px; }
.selection-settings { display: grid; gap: 12px; }
.section-title { font-size: 15px; margin: 0 0 5px; }
.pagination { display: flex; align-items: center; justify-content: center; gap: 18px; font-size: 12px; }
@media (max-width: 600px) { .manager { padding: 24px 16px; } }
</style>
