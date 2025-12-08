<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router'; 
import api from '@/services/api'; // <--- IMPORTAÇÃO NOVA
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const route = useRoute(); 
const authStore = useAuthStore();
const canvasRef = ref(null);
const containerRef = ref(null);
const ctx = ref(null);
const isDrawing = ref(false);
const enviando = ref(false);

// Configurações do Pincel
const corAtual = ref('#3B82F6'); 
const tamanhoPincel = ref(5);
const ferramentaAtual = ref('pincel');

// --- ATIVIDADE (A BASE) ---
const conteudoBase = ref(route.query.conteudo || ''); 
const tipoAtividade = ref(route.query.tipo || 'LIVRE');

// Paleta de Cores
const cores = [
  '#EF4444', '#F59E0B', '#FCD34D', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#000000', '#8B4513'
];

const tamanhos = [
  { valor: 5, label: 'Fino' },
  { valor: 10, label: 'Médio' },
  { valor: 20, label: 'Grosso' }
];

onMounted(async () => {
  await nextTick();
  setTimeout(() => {
    inicializarCanvas();
    window.addEventListener('resize', redimensionarCanvas);
  }, 100);
});

onUnmounted(() => {
  window.removeEventListener('resize', redimensionarCanvas);
});

function inicializarCanvas() {
  if (!containerRef.value || !canvasRef.value) return;

  const canvas = canvasRef.value;
  const container = containerRef.value;

  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight;
  
  ctx.value = canvas.getContext('2d', { willReadFrequently: true });
  ctx.value.lineCap = 'round';
  ctx.value.lineJoin = 'round';
  
  // Fundo branco inicial
  ctx.value.fillStyle = '#FFFFFF';
  ctx.value.fillRect(0, 0, canvas.width, canvas.height);
  
  desenharGuia();
  configurarEstilo();
}

function desenharGuia() {
    if (!conteudoBase.value || !ctx.value) return;

    const canvas = canvasRef.value;
    const texto = conteudoBase.value.toUpperCase();

    ctx.value.save(); 
    
    const tamanhoFonte = Math.min(canvas.width, canvas.height) * 0.6; 
    ctx.value.font = `900 ${tamanhoFonte}px Nunito, sans-serif`;
    ctx.value.fillStyle = '#E5E7EB'; 
    ctx.value.textAlign = 'center';
    ctx.value.textBaseline = 'middle';
    
    ctx.value.fillText(texto, canvas.width / 2, canvas.height / 2);
    
    ctx.value.strokeStyle = '#D1D5DB';
    ctx.value.lineWidth = 2;
    ctx.value.setLineDash([10, 10]);
    ctx.value.strokeText(texto, canvas.width / 2, canvas.height / 2);

    ctx.value.restore(); 
}

function redimensionarCanvas() {
  if (canvasRef.value && containerRef.value) {
    const canvas = canvasRef.value;
    const container = containerRef.value;
    
    const tempImage = ctx.value.getImageData(0, 0, canvas.width, canvas.height);
    
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    ctx.value.fillStyle = '#FFFFFF';
    ctx.value.fillRect(0, 0, canvas.width, canvas.height);
    
    desenharGuia(); 
    
    ctx.value.putImageData(tempImage, 0, 0);
    configurarEstilo();
  }
}

function configurarEstilo() {
  if (!ctx.value) return;
  if (ferramentaAtual.value === 'borracha') {
    ctx.value.strokeStyle = '#FFFFFF';
  } else {
    ctx.value.strokeStyle = corAtual.value;
  }
  ctx.value.lineWidth = tamanhoPincel.value;
  ctx.value.setLineDash([]); 
}

function getCoordenadas(event) {
  const canvas = canvasRef.value;
  const rect = canvas.getBoundingClientRect();
  let clienteX, clienteY;

  if (event.touches && event.touches.length > 0) {
    clienteX = event.touches[0].clientX;
    clienteY = event.touches[0].clientY;
  } else {
    clienteX = event.clientX;
    clienteY = event.clientY;
  }
  return { x: clienteX - rect.left, y: clienteY - rect.top };
}

function iniciarDesenho(event) {
  if (event.cancelable) event.preventDefault();
  isDrawing.value = true;
  const { x, y } = getCoordenadas(event);
  ctx.value.beginPath();
  ctx.value.moveTo(x, y);
}

function desenhar(event) {
  if (!isDrawing.value) return;
  if (event.cancelable) event.preventDefault();
  const { x, y } = getCoordenadas(event);
  ctx.value.lineTo(x, y);
  ctx.value.stroke();
}

function pararDesenho(event) {
  if (!isDrawing.value) return;
  if (event && event.cancelable) event.preventDefault();
  isDrawing.value = false;
  ctx.value.closePath();
}

function selecionarCor(cor) {
  ferramentaAtual.value = 'pincel';
  corAtual.value = cor;
  configurarEstilo();
}

function selecionarTamanho(tamanho) {
  tamanhoPincel.value = tamanho;
  configurarEstilo();
}

function ativarBorracha() {
  ferramentaAtual.value = 'borracha';
  configurarEstilo();
}

function limparTela(confirmar = true) {
  if (confirmar && !confirm('Começar de novo?')) return;
  const canvas = canvasRef.value;
  
  ctx.value.fillStyle = '#FFFFFF';
  ctx.value.fillRect(0, 0, canvas.width, canvas.height);
  
  desenharGuia();
  configurarEstilo(); 
}

// --- SALVAR NO BACKEND ---
async function salvarDesenho() {
  enviando.value = true;
  const canvas = canvasRef.value;
  const imagemBase64 = canvas.toDataURL('image/png');

  try {
    // --- AUTOMATIZADO: Usa 'api' em vez de 'axios' ---
    await api.post('/api/atividades', {
      tipo: tipoAtividade.value,
      conteudo: conteudoBase.value,
      desenhoBase64: imagemBase64
    }, {
      headers: { 
        // Não precisa passar Authorization, o api.js já manda!
        'x-child-id': authStore.criancaSelecionada?.id
      }
    });

    if (conteudoBase.value) {
        alert(`Parabéns! Você completou a atividade da letra "${conteudoBase.value}"! ⭐`);
    } else {
        alert("Que desenho lindo! Obrigado por compartilhar! 🎨");
    }

    router.push('/home'); 

  } catch (e) {
    console.error(e);
    alert("Erro ao enviar. Verifique a conexão.");
  } finally {
    enviando.value = false;
  }
}

function fecharDesenho() {
  router.push('/home'); 
}
</script>

<template>
  <div class="fixed inset-0 bg-fundo-inicio flex flex-col font-nunito overflow-hidden touch-none">
    
    <header class="bg-white p-3 shadow-sm flex items-center justify-between z-20 shrink-0 h-16">
      <div class="flex items-center gap-2">
        <button @click="fecharDesenho" class="bg-purple-100 text-purple-600 rounded-full w-10 h-10 font-bold hover:bg-purple-200 flex items-center justify-center">
          ✕
        </button>
        <h1 class="text-lg md:text-2xl font-extrabold text-roxo-titulo hidden md:block">
          🎨 {{ conteudoBase ? `Vamos desenhar: ${conteudoBase}` : 'Desenho Livre' }}
        </h1>
      </div>
      
      <button 
        @click="salvarDesenho"
        :disabled="enviando"
        class="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
      >
        <span v-if="enviando">🚀 Enviando...</span>
        <span v-else>✅ Terminei!</span>
      </button>
    </header>

    <div class="flex-1 flex flex-col-reverse md:flex-row h-[calc(100vh-64px)] relative overflow-hidden">
      
      <aside class="bg-white md:w-24 w-full p-2 md:p-4 flex md:flex-col flex-row items-center justify-between md:justify-start gap-3 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] md:shadow-md z-10 shrink-0 overflow-x-auto h-20 md:h-auto">
        
        <div class="flex md:flex-col flex-row gap-2 p-1 overflow-x-auto no-scrollbar">
          <button 
            v-for="cor in cores" 
            :key="cor"
            @click="selecionarCor(cor)"
            class="w-10 h-10 md:w-10 md:h-10 rounded-full border-2 shrink-0 transition-transform active:scale-90 shadow-sm"
            :style="{ backgroundColor: cor, borderColor: (corAtual === cor && ferramentaAtual === 'pincel') ? '#333' : 'transparent' }"
            :class="(corAtual === cor && ferramentaAtual === 'pincel') ? 'scale-110 ring-2 ring-gray-300' : ''"
          ></button>
        </div>

        <div class="w-px h-8 md:w-full md:h-px bg-gray-200 mx-1 md:mx-0"></div>

        <div class="flex md:flex-col flex-row gap-2 items-center">
          <button 
            v-for="t in tamanhos" 
            :key="t.valor"
            @click="selecionarTamanho(t.valor)"
            class="rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center shrink-0 transition-all active:scale-95"
            :class="tamanhoPincel === t.valor ? 'bg-purple-200 ring-2 ring-purple-400' : ''"
            style="width: 40px; height: 40px;"
          >
            <div class="bg-gray-700 rounded-full" :style="{ width: t.valor + 'px', height: t.valor + 'px' }"></div>
          </button>
        </div>

        <div class="w-px h-8 md:w-full md:h-px bg-gray-200 mx-1 md:mx-0"></div>

        <div class="flex md:flex-col flex-row gap-2">
          <button 
            @click="ativarBorracha"
            class="w-10 h-10 rounded-xl flex items-center justify-center text-2xl border-2 transition-all active:scale-95"
            :class="ferramentaAtual === 'borracha' ? 'bg-pink-100 border-pink-400 text-pink-600 scale-110' : 'bg-gray-50 border-transparent text-gray-400'"
          >🧼</button>
          
          <button 
            @click="limparTela(true)"
            class="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center text-xl hover:bg-red-100 active:scale-95 transition-all"
          >🗑️</button>
        </div>

      </aside>

      <main ref="containerRef" class="flex-1 bg-gray-200 relative cursor-crosshair overflow-hidden w-full h-full p-2 md:p-4 flex items-center justify-center">
        <canvas
          ref="canvasRef"
          class="block bg-white shadow-xl rounded-2xl touch-none"
          @mousedown="iniciarDesenho"
          @mousemove="desenhar"
          @mouseup="pararDesenho"
          @mouseleave="pararDesenho"
          @touchstart="iniciarDesenho"
          @touchmove="desenhar"
          @touchend="pararDesenho"
        ></canvas>
      </main>

    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>