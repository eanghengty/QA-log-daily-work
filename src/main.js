import { createApp } from 'vue'
import App from './App.vue'
import router from './router/index.js'
import { initDb } from './db/index.js'
import './assets/main.css'

async function start() {
  await initDb()
  const app = createApp(App)
  app.use(router)
  app.mount('#app')
}

start()
