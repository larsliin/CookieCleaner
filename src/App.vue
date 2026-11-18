<script setup lang="ts">
import CleanerPanel from './components/cleaner/CleanerPanel.vue'
import { useTheme } from './composables/useTheme'
import SiteManager from './components/sites/SiteManager.vue'

useTheme()
const showSites = new URLSearchParams(location.search).get('page') === 'sites'
</script>

<template>
  <SiteManager v-if="showSites" />
  <CleanerPanel v-else />
</template>
