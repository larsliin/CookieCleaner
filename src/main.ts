import { createApp } from 'vue'
import 'chrome-extension-component-library/style.css'
import './style.css'
import App from './App.vue'

if (new URLSearchParams(location.search).get('page') === 'sites') {
  document.body.classList.add('site-manager-window')
}
createApp(App).mount('#app')
