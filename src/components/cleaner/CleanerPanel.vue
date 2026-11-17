<script setup lang="ts">
import { BaseAlert, BaseButton, BaseHeroButton, BaseLoadingBar } from 'chrome-extension-component-library'
import { useCleaner } from '../../composables/useCleaner'
import CleanupScope from './CleanupScope.vue'
import CleanupFeedback from './CleanupFeedback.vue'

const {
  sites, currentDomain, target, period, job, error, loading, available,
  review, busy, load, beginReview, confirm,
} = useCleaner()
</script>

<template>
  <main class="cleaner" aria-label="Cookie Cleaner" :aria-busy="loading || busy">
    <BaseLoadingBar v-if="loading" />
    <BaseAlert :message="error" />
    <BaseButton v-if="error && !busy" variant="secondary" @click="load">Retry connection</BaseButton>
    <BaseHeroButton
      class="clean-all"
      :disabled="loading || !available || busy || !!review"
      @click="beginReview({ domain: null, period: 'all' })"
    >
      <span class="hero-icon" aria-hidden="true">
        <svg viewBox="20 20 88 88" fill="currentColor">
          <defs>
            <mask id="hero-cookie-mask" maskUnits="userSpaceOnUse" x="20" y="20" width="88" height="88">
              <path
                d="M74.67 30.93 A36 36 0 1 0 99.73 56 A14.67 14.67 0 0 1 74.67 30.93 Z"
                fill="#fff" stroke="#fff" stroke-width="8" stroke-linejoin="round"
              />
              <g fill="#000">
                <circle cx="50.67" cy="58.67" r="7.33" />
                <circle cx="73.33" cy="78.67" r="7.33" />
                <circle cx="48" cy="82.67" r="6" />
              </g>
            </mask>
          </defs>
          <rect x="20" y="20" width="88" height="88" mask="url(#hero-cookie-mask)" />
        </svg>
      </span>
      <span class="hero-copy">
        <strong class="hero-title">Clean all websites</strong>
        <span class="hero-caption">Cookies &amp; web storage &middot; All time</span>
      </span>
    </BaseHeroButton>
    <CleanupScope
      v-model:target="target"
      v-model:period="period"
      :sites="sites"
      :current-domain="currentDomain"
      :disabled="loading || busy || !!review || !available"
      @review="beginReview()"
    />
    <CleanupFeedback :review="review" :job="job" :busy="busy" @confirm="confirm" @cancel="review = null" />
    <details class="details">
      <summary>About tracking ads &amp; cleanup limits</summary>
      <p>Product ads often come from third-party ad networks, not just the shop you visited. Clearing a shop cannot reliably identify or remove the advertiser's data. All-websites cleanup is broader, but cannot guarantee the ads stop or erase server-side profiles.</p>
      <p>Site cookies include subdomains. Local storage can only be targeted at known origins: the base site, origins recorded in your recent list, and matching loaded frames. Unobserved subdomains or ports may retain data.</p>
      <p>Session storage has no item timestamps. Only matching loaded HTTP(S) frames can be reached; unloaded pages, closed-tab restore data, and inaccessible frames may retain it. Sites can immediately recreate data while open. No tabs are reloaded automatically.</p>
      <p>Browsing history, passwords, cache, IndexedDB, and service workers are not removed. Recent sites are stored locally from installation onward, never uploaded.</p>
    </details>
    <footer class="footer"><i class="bi bi-shield-check" aria-hidden="true" /> Local only. Nothing leaves your browser.</footer>
  </main>
</template>

<style scoped>
.cleaner { display: grid; gap: 18px; padding: 16px; }
.clean-all { min-height: 88px; }
.hero-icon {
  display: grid;
  flex: 0 0 48px;
  place-items: center;
  width: 48px;
  height: 48px;
  font-size: 24px;
  line-height: 1;
  background-color: var(--color-hero-icon-bg);
  background-image: linear-gradient(180deg, var(--color-hero-icon-sheen) 0%, transparent 100%);
  border: 1px solid var(--color-hero-icon-border);
  border-radius: 14px;
  box-shadow:
    inset 0 1px 0 var(--color-hero-gloss-start),
    inset 0 -1px 0 var(--color-hero-shadow-inset);
}
.hero-icon svg {
  width: 24px;
  height: 24px;
  filter: drop-shadow(0 1px 1px var(--color-hero-text-shadow));
}
.clean-all:active:not(:disabled) .hero-icon {
  background-image: linear-gradient(0deg, var(--color-hero-icon-sheen) 0%, transparent 100%);
  box-shadow:
    inset 0 2px 3px var(--color-hero-shadow-active),
    inset 0 -1px 0 var(--color-hero-icon-border);
}
.clean-all:disabled .hero-icon {
  background-color: var(--color-hero-disabled-icon-bg);
  border-color: var(--color-hero-disabled-icon-border);
}
.clean-all:disabled .hero-icon svg { filter: none; }
.hero-copy { display: grid; gap: 5px; min-width: 0; }
.hero-title { font-size: 16px; font-weight: 650; letter-spacing: -0.2px; }
.hero-caption { color: var(--color-hero-caption); font-size: 11px; line-height: 1.4; }
.clean-all:disabled .hero-caption { color: inherit; }
.details { border-top: 1px solid var(--color-border); padding-top: 16px; font-size: 12px; color: var(--color-text-muted); line-height: 1.6; }
.details summary { cursor: pointer; color: var(--color-text); }
.details p { margin: 10px 0 0; }
.footer { display: flex; align-items: center; justify-content: center; gap: 7px; color: var(--color-text-muted); font-size: 11px; }
</style>
