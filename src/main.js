import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { initDb } from './db/index.js'
import { initAuth } from './composables/useAuth.js'
import { initRealtime } from './composables/useRealtime.js'
import './assets/main.css'

async function start() {
  await Promise.all([initDb(), initAuth()])
  initRealtime()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

start()
