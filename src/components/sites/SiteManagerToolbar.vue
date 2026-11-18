<script setup lang="ts">
import { BaseButton, BaseSelect } from 'chrome-extension-component-library'
import type { SortOrder } from '../../cleaner/catalogue'

defineProps<{ count: number; disabled: boolean }>()
const order = defineModel<SortOrder>('order', { required: true })
const emit = defineEmits<{ refresh: []; clean: []; clear: [] }>()
const sortOptions = [
  { value: 'date' as const, label: 'Date (newest first)' },
  { value: 'name' as const, label: 'Name (A-Z)' },
]
</script>

<template>
  <div class="toolbar">
    <div class="sort">
      <label for="sort">Sort by</label>
      <BaseSelect id="sort" v-model="order" :options="sortOptions" :disabled="disabled" />
    </div>
    <div class="actions">
      <span role="status">{{ count }} selected</span>
      <BaseButton variant="secondary" :disabled="disabled || !count" @click="emit('clear')">Clear selection</BaseButton>
      <BaseButton variant="secondary" :disabled="disabled" @click="emit('refresh')">Refresh</BaseButton>
      <BaseButton variant="primary" :disabled="disabled || !count" @click="emit('clean')">Clean selected sites</BaseButton>
    </div>
  </div>
</template>

<style scoped>
.toolbar, .actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.toolbar { justify-content: space-between; }
.sort { display: flex; align-items: center; gap: 10px; font-size: 13px; }
.actions { font-size: 12px; }
</style>
