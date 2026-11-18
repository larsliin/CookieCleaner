<script setup lang="ts">
import { onMounted, onUnmounted, shallowRef } from 'vue'
import { BaseHeroButton, BaseSelect } from 'chrome-extension-component-library'
import { periodLabel, periods, type Period } from '../../cleaner/model'

defineProps<{
  disabled: boolean
}>()
const period = defineModel<Period>('period', { required: true })
const timeOptions = periods.map((item) => ({ ...item }))
const emit = defineEmits<{ cleanAll: [] }>()

const scrolled = shallowRef(false)
function updateScrolled() { scrolled.value = window.scrollY > 0 }
onMounted(() => {
  updateScrolled()
  window.addEventListener('scroll', updateScrolled, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', updateScrolled))
</script>

<template>
  <div class="hero-bar" :class="{ scrolled }">
    <BaseHeroButton class="hero" :disabled="disabled" @click="emit('cleanAll')">
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
        <strong class="hero-title">Clear cookies &amp; site data</strong>
        <span class="hero-caption">All websites &middot; {{ periodLabel(period) }}</span>
      </span>
    </BaseHeroButton>
  </div>
  <section class="quick-actions" aria-label="All websites">
    <div class="field">
      <label class="field-label" for="period">Time range</label>
      <BaseSelect id="period" v-model="period" :options="timeOptions" :disabled="disabled" />
    </div>
    <p class="hint">The time range applies only here. Loaded session storage is always cleared in full.</p>
  </section>
</template>

<style scoped>
.quick-actions { display: grid; gap: 12px; margin-top: -20px; }
.field { display: grid; gap: 6px; }
.field-label { font-size: 12px; font-weight: 600; }
.hint { margin: 0; color: var(--color-text-muted); font-size: 11px; line-height: 1.5; }
.hero-bar {
  position: sticky;
  top: 0;
  z-index: 1;
  margin: -16px -16px 0;
  padding: 16px;
  background: var(--color-bg);
  border-bottom: 1px solid transparent;
}
.hero-bar.scrolled {
  border-bottom-color: var(--color-border);
  box-shadow: 0 3px 8px rgb(0 0 0 / 35%);
}
:global(:root[data-theme='light']) .hero-bar.scrolled { box-shadow: 0 3px 8px rgb(0 0 0 / 18%); }
.hero { min-height: 76px; }
.hero-icon {
  display: grid;
  flex: 0 0 44px;
  place-items: center;
  width: 44px;
  height: 44px;
  font-size: 22px;
  line-height: 1;
  background-color: var(--color-hero-icon-bg);
  background-image: linear-gradient(180deg, var(--color-hero-icon-sheen) 0%, transparent 100%);
  border: 1px solid var(--color-hero-icon-border);
  border-radius: 13px;
  box-shadow:
    inset 0 1px 0 var(--color-hero-gloss-start),
    inset 0 -1px 0 var(--color-hero-shadow-inset);
}
.hero-icon svg {
  width: 22px;
  height: 22px;
  filter: drop-shadow(0 1px 1px var(--color-hero-text-shadow));
}
.hero:active:not(:disabled) .hero-icon {
  background-image: linear-gradient(0deg, var(--color-hero-icon-sheen) 0%, transparent 100%);
  box-shadow:
    inset 0 2px 3px var(--color-hero-shadow-active),
    inset 0 -1px 0 var(--color-hero-icon-border);
}
.hero:disabled .hero-icon {
  background-color: var(--color-hero-disabled-icon-bg);
  border-color: var(--color-hero-disabled-icon-border);
}
.hero:disabled .hero-icon svg { filter: none; }
.hero-copy { display: grid; gap: 4px; min-width: 0; text-align: left; }
.hero-title { font-size: 20px; font-weight: 650; letter-spacing: -0.2px; opacity: 0.85; }
.hero-caption {
  overflow: hidden;
  color: var(--color-hero-caption);
  font-size: 11px;
  line-height: 1.4;
  opacity: 0.85;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.hero:disabled .hero-caption { color: inherit; }
</style>
