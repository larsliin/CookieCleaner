import { onMounted, onUnmounted } from 'vue'

export function useTheme() {
  const preference = window.matchMedia('(prefers-color-scheme: dark)')
  function applyTheme() {
    if (preference.matches) document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', 'light')
  }
  onMounted(() => {
    applyTheme()
    preference.addEventListener('change', applyTheme)
  })
  onUnmounted(() => preference.removeEventListener('change', applyTheme))
}
