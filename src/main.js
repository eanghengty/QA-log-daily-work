import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { startAppStartup } from './composables/useAppStartup.js'
import './assets/main.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

void startAppStartup().catch(() => {
  // The app shell stays mounted and renders the startup error state.
})
