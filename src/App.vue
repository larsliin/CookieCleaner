<script setup lang="ts">
import CleanerPanel from './components/cleaner/CleanerPanel.vue'
import { useTheme } from './composables/useTheme'

useTheme()
</script>

<template>
  <CleanerPanel />
</template>
