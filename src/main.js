import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import axios from 'axios'
import './assets/main.css'

import { useAuthStore } from '@/stores/auth'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// --- CONFIGURAÇÃO DE SEGURANÇA (O PORTEIRO) ---
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    // 1. SE O ERRO FOR NO LOGIN, NÃO FAZ NADA (Deixa o componente mostrar o aviso)
    if (error.config && error.config.url.includes('/auth/login')) {
      return Promise.reject(error);
    }

    // 2. SE FOR EM OUTRAS ROTAS (Sessão Expirada)
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      console.warn('Sessão expirada. Redirecionando...');
      
      const authStore = useAuthStore();
      // Verifica se a função existe antes de chamar para não travar
      if (authStore.clearLoginData) {
        authStore.clearLoginData();
      }
      
      router.push('/login');
    }
    return Promise.reject(error);
  }
);

app.mount('#app')