import { onMounted, onUnmounted, type ShallowRef } from 'vue'

const maxHeight = 600 // Chrome's popup height limit
const minHeight = 480 // Leaves room for the centered confirmation dialog

export function usePopupHeight(root: Readonly<ShallowRef<HTMLElement | null>>) {
  const observer = new ResizeObserver(() => {
    const height = root.value?.offsetHeight ?? 0
    document.body.style.height = `${Math.min(maxHeight, Math.max(minHeight, height))}px`
  })
  onMounted(() => {
    if (root.value) observer.observe(root.value)
  })
  onUnmounted(() => {
    observer.disconnect()
    document.body.style.removeProperty('height')
  })
}