<script setup>
import { ref, onMounted, computed, watch } from 'vue';
import api from '@/services/api'; // <--- IMPORTAÇÃO CENTRALIZADA
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Line, Bar } from 'vue-chartjs';
import { Chart as ChartJS, Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale, BarElement, Filler } from 'chart.js';

ChartJS.register(Title, Tooltip, Legend, LineElement, PointElement, CategoryScale, LinearScale, BarElement, Filler);

const router = useRouter();
const authStore = useAuthStore();

// (API_URL removida pois o api.js gerencia isso)

// --- MAPA DE EMOÇÕES E VALORES PARA O GRÁFICO ---
const emotionValueMap = {
  'BRAVO': 1,
  'MEDO': 2,
  'TRISTE': 2, 
  'ANSIOSO': 3,
  'CALMO': 4,
  'CRIATIVO': 5,
  'FELIZ': 6
};

// Mapa reverso para o Eixo Y do gráfico
const valueEmotionLabel = {
  1: '😠 Bravo',
  2: '😢 Triste',
  3: '😬 Ansioso',
  4: '😌 Calmo',
  5: '🎨 Criativo',
  6: '😊 Feliz'
};

const emojiMap = {
  'FELIZ': '😊', 'TRISTE': '😢', 'BRAVO': '😠', 'CALMO': '😌', 
  'MEDO': '😨', 'ANSIOSO': '😬', 'CRIATIVO': '🎨'
};

const emocoesOpcoes = [
  { valor: 'FELIZ', emoji: '😊', label: 'Feliz' },
  { valor: 'CALMO', emoji: '😌', label: 'Calmo' },
  { valor: 'TRISTE', emoji: '😢', label: 'Triste' },
  { valor: 'BRAVO', emoji: '😠', label: 'Bravo' },
  { valor: 'ANSIOSO', emoji: '😬', label: 'Ansioso' },
  { valor: 'MEDO', emoji: '😨', label: 'Com Medo' }
];

// --- PLUGIN PARA DESENHAR EMOJIS NO GRÁFICO ---
const emojiPlugin = {
  id: 'emojiPlugin',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const meta = chart.getDatasetMeta(0);
    if (!meta.data || meta.data.length === 0) return;
    const emojis = chart.data.datasets[0].pointEmojis; 
    if(!emojis) return;

    ctx.save();
    meta.data.forEach((element, index) => {
      if (!emojis[index]) return;
      const x = element.x;
      const y = element.y;
      ctx.font = '20px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emojis[index], x, y - 15);
    });
    ctx.restore();
  }
};

// --- ESTADOS ---
const viewAtual = ref('semanario'); 
const abaAlunoAtual = ref('rendimento'); 
const alunoSelecionado = ref(null);
const dependentes = ref([]);
const dadosTurma = ref([]); 

// --- CONTROLE MOBILE ---
const abaMobile = ref('painel'); 

// --- SEMANÁRIO ---
const formSemanario = ref({
    segunda: '',
    terca: '',
    quarta: '',
    quinta: '',
    sexta: '',
    objetivos: [] // Lista de objetivos
});
const salvandoSemanario = ref(false);

// Variáveis temporárias para os Selects de Objetivos
const objetivoTempDia = ref(''); 
const objetivoTempCategoria = ref('');
const objetivoTempDescricao = ref('');

// --- DIÁRIO (PROFESSOR) ---
const novoDiario = ref({
    emocao: null,
    intensidade: 3,
    relato: ''
});
const salvandoDiario = ref(false);

// --- DASHBOARD E GRÁFICOS ---
const filtroTempo = ref('semana');
const dadosDashboard = ref(null);
const listaAtividades = ref([]);
const carregandoDados = ref(false);
const carregandoGeral = ref(false);

// --- AVALIAÇÃO ---
const templatesAvaliacao = ref({});
const subTabAvaliacao = ref('EF'); 
const unidadeSelecionada = ref("PADRAO"); 
const formAvaliacao = ref({});
const salvandoAvaliacao = ref(false);
const carregandoFicha = ref(false);
const showRelatorioModal = ref(false);

// --- ATIVIDADE (ENVIO) ---
const novaAtividade = ref({ tipo: 'VOGAL', conteudo: 'A' });
const enviandoAtividade = ref(false);
const alunosSelecionadosParaEnvio = ref([]); 
const selecionarTodos = ref(false); 
const totalAtividadesEnviadasPeloProfessor = ref(0);

// --- GERENCIAMENTO DE TURMA ---
const modoEdicao = ref(false);
const alunoEmEdicao = ref(null);
const cadastrandoAluno = ref(false);
const novoAluno = ref({ nome: '', dataNascimento: '', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Novo' });

onMounted(async () => {
  await carregarAlunos();
  await carregarTemplatesAvaliacao(); 
  await buscarTotalAtividadesEnviadas();
  await carregarDadosGeraisTurma(); 
  await carregarSemanario();
});

// WATCHER PARA SELECIONAR TODOS
watch(selecionarTodos, (val) => {
    if (val) {
        alunosSelecionadosParaEnvio.value = dependentes.value.map(a => a.id);
    } else {
        alunosSelecionadosParaEnvio.value = [];
    }
});

// --- COMPUTED PARA OBJETIVOS DO SEMANÁRIO ---
const questoesDisponiveis = computed(() => {
    if (!objetivoTempCategoria.value || !templatesAvaliacao.value[objetivoTempCategoria.value]) return [];
    return templatesAvaliacao.value[objetivoTempCategoria.value].questoes;
});

// --- COMPUTED PARA FILTRAR AS QUESTÕES NA AVALIAÇÃO ---
const questoesFiltradas = computed(() => {
    const categoriaAtual = subTabAvaliacao.value;
    const template = templatesAvaliacao.value[categoriaAtual];
    if (!template) return {};

    const objetivosSemana = formSemanario.value.objetivos || [];
    // Filtra objetivos da categoria atual
    const objetivosDestaCategoria = objetivosSemana.filter(obj => obj.categoria === categoriaAtual);

    if (objetivosDestaCategoria.length === 0) return {};

    const resultado = {};
    for (const [key, texto] of Object.entries(template.questoes)) {
        const estaNoSemanario = objetivosDestaCategoria.some(obj => 
            (obj.id && obj.id === key) || obj.descricao === texto
        );

        if (estaNoSemanario) {
            resultado[key] = texto;
        }
    }
    return resultado;
});

// --- FUNÇÕES DE CARREGAMENTO ---
async function carregarAlunos() {
  try {
    const response = await api.get('/api/responsavel/dependentes');
    dependentes.value = response.data;
  } catch (e) { console.error(e); }
}

async function carregarTemplatesAvaliacao() {
    try {
        const res = await api.get('/api/avaliacoes/templates');
        templatesAvaliacao.value = res.data;
    } catch (e) { console.error(e); }
}

async function buscarTotalAtividadesEnviadas() {
    try {
        const res = await api.get('/api/atividades/total-enviadas');
        totalAtividadesEnviadasPeloProfessor.value = res.data.total || 0;
    } catch (e) {
        totalAtividadesEnviadasPeloProfessor.value = 0;
    }
}

// --- LÓGICA DO SEMANÁRIO (ATUALIZADA) ---

// Função para iniciar nova semana (Limpar filtros)
function iniciarNovaSemana() {
    if(!confirm("Tem certeza que deseja LIMPAR TUDO para iniciar uma nova semana? Todos os objetivos e planejamentos atuais serão apagados.")) return;
    
    formSemanario.value = {
        segunda: '', terca: '', quarta: '', quinta: '', sexta: '',
        objetivos: []
    };
    // Salvar o estado vazio
    salvarSemanario();
}

function adicionarObjetivo() {
    if (!objetivoTempDia.value) return alert("Selecione o Dia da Semana.");
    if (!objetivoTempCategoria.value || !objetivoTempDescricao.value) return alert("Selecione a categoria e a habilidade.");
    
    const textoQuestao = templatesAvaliacao.value[objetivoTempCategoria.value].questoes[objetivoTempDescricao.value];
    const tituloCategoria = templatesAvaliacao.value[objetivoTempCategoria.value].titulo.split('(')[0].trim(); 

    // Verifica se este objetivo (ID ou Descrição) já existe em QUALQUER dia da semana
    const jaExisteNaSemana = formSemanario.value.objetivos.some(o => 
        o.categoria === objetivoTempCategoria.value && 
        (o.id === objetivoTempDescricao.value || o.descricao === textoQuestao)
    );

    if (jaExisteNaSemana) {
        return alert("Este objetivo já foi adicionado nesta semana (verifique outros dias). Não é permitido repetir o mesmo objetivo na semana.");
    }

    formSemanario.value.objetivos.push({
        id: objetivoTempDescricao.value, 
        categoria: objetivoTempCategoria.value,
        tituloCategoria: tituloCategoria,
        descricao: textoQuestao,
        dia: objetivoTempDia.value // Adiciona o dia selecionado
    });

    // Limpa apenas a habilidade para facilitar adicionar outra da mesma categoria
    objetivoTempDescricao.value = ''; 
}

function removerObjetivo(objParaRemover) {
    const index = formSemanario.value.objetivos.indexOf(objParaRemover);
    if (index > -1) {
        formSemanario.value.objetivos.splice(index, 1);
    }
}

// Função auxiliar para filtrar objetivos no template por dia
function getObjetivosPorDia(dia) {
    return formSemanario.value.objetivos.filter(o => o.dia === dia);
}

async function carregarSemanario() {
    try {
        const res = await api.get('/api/semanario/atual');
        if(res.data) {
            formSemanario.value = {
                segunda: res.data.segunda || '',
                terca: res.data.terca || '',
                quarta: res.data.quarta || '',
                quinta: res.data.quinta || '',
                sexta: res.data.sexta || '',
                objetivos: res.data.objetivos ? JSON.parse(res.data.objetivos) : []
            };
        }
    } catch (e) { console.error("Erro ao carregar semanário", e); }
}

async function salvarSemanario() {
    salvandoSemanario.value = true;
    try {
        const payload = {
            ...formSemanario.value,
            objetivos: JSON.stringify(formSemanario.value.objetivos)
        };

        await api.post('/api/semanario', payload);
        alert('Planejamento salvo com sucesso!');
    } catch (e) {
        alert('Erro ao salvar semanário.');
    } finally {
        salvandoSemanario.value = false;
    }
}

// --- LÓGICA DO DIÁRIO (PROFESSOR) ---
async function salvarDiarioProfessor() {
    if (!novoDiario.value.emocao) return alert("Por favor, selecione uma emoção.");
    
    salvandoDiario.value = true;
    try {
        // Envia o x-child-id manualmente no header, pois este diário é do aluno selecionado
        await api.post('/api/diario', {
            emocao: novoDiario.value.emocao,
            intensidade: novoDiario.value.intensidade,
            relato: novoDiario.value.relato
        }, {
            headers: { 'x-child-id': alunoSelecionado.value.id }
        });
        
        alert('Registro emocional salvo com sucesso!');
        novoDiario.value = { emocao: null, intensidade: 3, relato: '' };
        await carregarDadosAluno(alunoSelecionado.value.id);
        
    } catch (e) {
        console.error("Erro ao salvar diário", e);
        alert('Erro ao salvar registro.');
    } finally {
        salvandoDiario.value = false;
    }
}

async function carregarDadosGeraisTurma() {
    carregandoGeral.value = true;
    dadosTurma.value = [];
    try {
        const promises = dependentes.value.map(async (aluno) => {
            try {
                // Busca atividades específicas do aluno
                // Nota: token vai automático, não precisa passar
                const ativRes = await api.get(`/api/atividades/aluno/${aluno.id}`);
                
                const atividadesGuiadas = ativRes.data.filter(a => a.tipo !== 'LIVRE');
                const entregues = atividadesGuiadas.length;
                const pendentes = Math.max(0, totalAtividadesEnviadasPeloProfessor.value - entregues);

                return {
                    id: aluno.id,
                    nome: aluno.nome,
                    avatarUrl: aluno.avatarUrl,
                    atividadesFeitas: entregues,
                    atividadesPendentes: pendentes,
                    ultimaAtividade: atividadesGuiadas.length > 0 ? atividadesGuiadas[0].dataRealizacao : null
                };
            } catch {
                return { id: aluno.id, nome: aluno.nome, avatarUrl: aluno.avatarUrl, atividadesFeitas: 0, atividadesPendentes: totalAtividadesEnviadasPeloProfessor.value, ultimaAtividade: null };
            }
        });
        const resultados = await Promise.all(promises);
        dadosTurma.value = resultados.sort((a, b) => b.atividadesFeitas - a.atividadesFeitas);
    } catch (e) { console.error(e); }
    finally { carregandoGeral.value = false; }
}

async function carregarDadosAluno(id) {
    carregandoDados.value = true;
    try {
        const dashRes = await api.get(`/api/responsavel/dependentes/${id}/dashboard`);
        dadosDashboard.value = dashRes.data;
        
        const ativRes = await api.get(`/api/atividades/aluno/${id}`);
        listaAtividades.value = ativRes.data;
        
        // Não forçamos o carregamento da avaliação aqui para não sobrescrever dados não salvos se a aba não estiver ativa
        if(abaAlunoAtual.value === 'avaliacao') {
             await buscarAvaliacaoSalva(false); // false = não sobrescrever se tiver sujeira
        }
    } catch (e) { console.error(e); } finally { carregandoDados.value = false; }
}

// --- GERENCIAMENTO DE ALUNOS ---

function gerarNovoAvatar() {
    novoAluno.value.avatarUrl = 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + Date.now();
}

async function salvarAluno() {
    if (!novoAluno.value.nome) return alert("Preencha o nome!");
    if (!novoAluno.value.dataNascimento) return alert("Preencha a data de nascimento!");

    cadastrandoAluno.value = true;
    try {
        const payload = {
            nome: novoAluno.value.nome,
            dataNascimento: novoAluno.value.dataNascimento,
            avatarUrl: novoAluno.value.avatarUrl, 
            genero: 'M'
        };

        if (modoEdicao.value && alunoEmEdicao.value) {
            await api.put(`/api/responsavel/dependentes/${alunoEmEdicao.value.id}`, payload);
            alert("Aluno atualizado!");
        } else {
            await api.post('/api/responsavel/dependentes', payload);
            alert("Aluno cadastrado!");
        }
        
        novoAluno.value = { nome: '', dataNascimento: '', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + Date.now() };
        modoEdicao.value = false;
        alunoEmEdicao.value = null;
        await carregarAlunos();
    } catch (e) {
        alert("Erro ao salvar.");
    } finally {
        cadastrandoAluno.value = false;
    }
}

async function excluirAluno(id) {
    if(!confirm("Tem certeza? O histórico será apagado.")) return;
    try {
        await api.delete(`/api/responsavel/dependentes/${id}`);
        await carregarAlunos();
        if(alunoSelecionado.value && alunoSelecionado.value.id === id) {
            verVisaoGeral();
        }
    } catch (e) { alert("Erro ao excluir."); }
}

function prepararEdicao(aluno) {
    modoEdicao.value = true;
    alunoEmEdicao.value = aluno;
    novoAluno.value = { 
        nome: aluno.nome, 
        dataNascimento: aluno.dataNascimento, 
        avatarUrl: aluno.avatarUrl 
    };
}

function cancelarEdicao() {
    modoEdicao.value = false;
    alunoEmEdicao.value = null;
    novoAluno.value = { nome: '', dataNascimento: '', avatarUrl: 'https://api.dicebear.com/7.x/adventurer/svg?seed=' + Date.now() };
}

// --- COMPUTEDS E GRÁFICOS ---
const dicaRendimentoGeral = computed(() => {
    if (dadosTurma.value.length === 0) return { texto: "Aguardando dados...", cor: "bg-gray-100 text-gray-500" };
    const totalAtividades = dadosTurma.value.reduce((acc, curr) => acc + curr.atividadesFeitas, 0);
    const media = totalAtividades / dadosTurma.value.length;
    const proporcao = totalAtividadesEnviadasPeloProfessor.value > 0 ? (media / totalAtividadesEnviadasPeloProfessor.value) : 0;
    if (proporcao > 0.6) return { texto: "Excelente! A turma está engajada.", cor: "bg-green-100 text-green-700", icon: "🌟" };
    if (proporcao > 0.3) return { texto: "Bom progresso. Incentive mais.", cor: "bg-blue-100 text-blue-700", icon: "📈" };
    return { texto: "Atenção necessária. Engajamento baixo.", cor: "bg-orange-100 text-orange-700", icon: "⚠️" };
});

const chartDataTurma = computed(() => {
    return {
        labels: dadosTurma.value.map(d => d.nome),
        datasets: [
            { label: 'Entregues', data: dadosTurma.value.map(d => d.atividadesFeitas), backgroundColor: '#10B981', borderRadius: 4 },
            { label: 'Pendentes', data: dadosTurma.value.map(d => d.atividadesPendentes), backgroundColor: '#F59E0B', borderRadius: 4 }
        ]
    };
});

const chartOptionsTurma = { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { x: { stacked: true, grid: { display: false } }, y: { beginAtZero: true, stacked: true } } };

const atividadesGuiadas = computed(() => listaAtividades.value.filter(a => a.tipo !== 'LIVRE'));
const desenhosLivres = computed(() => listaAtividades.value.filter(a => a.tipo === 'LIVRE'));
const registrosDiario = computed(() => {
    if (!dadosDashboard.value?.historicoGrafico) return [];
    return dadosDashboard.value.historicoGrafico
        .filter(r => r.emocao !== 'CRIATIVO') 
        .sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro));
});

const sugestaoPedagogica = computed(() => {
    const registros = registrosDiario.value;
    if (!registros || registros.length === 0) return null;
    const ultimaEmocao = registros[0].emocao;
    
    const mapaSugestoes = {
        'FELIZ': { titulo: 'Aluno Motivado!', texto: 'Que tal aproveitar essa energia para apresentar um novo desafio?', cor: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
        'TRISTE': { titulo: 'Acolhimento Necessário', texto: 'Tente uma abordagem mais gentil e atividades lúdicas em grupo.', cor: 'bg-blue-50 text-blue-800 border-blue-200' },
        'BRAVO': { titulo: 'Gestão de Frustração', texto: 'Ofereça um momento de calma ou desenho livre para expressão.', cor: 'bg-red-50 text-red-800 border-red-200' },
        'CALMO': { titulo: 'Momento de Foco', texto: 'Ótimo momento para atividades de leitura e concentração.', cor: 'bg-green-50 text-green-800 border-green-200' },
        'MEDO': { titulo: 'Segurança Emocional', texto: 'Reforce a confiança do aluno com tarefas que ele domina.', cor: 'bg-purple-50 text-purple-800 border-purple-200' },
        'ANSIOSO': { titulo: 'Redução de Ansiedade', texto: 'Divida as tarefas em passos menores e respire junto com ele.', cor: 'bg-orange-50 text-orange-800 border-orange-200' },
        'CRIATIVO': { titulo: 'Potencial Criativo', texto: 'Explore atividades artísticas e resolução de problemas.', cor: 'bg-teal-50 text-teal-800 border-teal-200' }
    };
    return mapaSugestoes[ultimaEmocao] || { titulo: 'Observar', texto: 'Acompanhe o comportamento.', cor: 'bg-gray-50 text-gray-600 border-gray-200' };
});

const chartDataAtividades = computed(() => {
    const atividadesPorData = {};
    const dias = [];
    const hoje = new Date();
    const diasCount = filtroTempo.value === 'mes' ? 30 : 7;
    for (let i = diasCount - 1; i >= 0; i--) {
        const d = new Date(); d.setDate(hoje.getDate() - i);
        const key = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        atividadesPorData[key] = 0; dias.push(key);
    }
    if (listaAtividades.value) {
        listaAtividades.value.filter(a => a.tipo !== 'LIVRE').forEach(ativ => {
            const d = new Date(ativ.dataRealizacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            if (atividadesPorData[d] !== undefined) atividadesPorData[d]++;
        });
    }
    return {
        labels: dias,
        datasets: [{ label: 'Atividades Entregues', data: dias.map(d => atividadesPorData[d]), backgroundColor: '#10B981', borderRadius: 6, barThickness: 20 }]
    };
});

// --- GRÁFICO DE EMOÇÕES ---
const chartDataEmocoes = computed(() => {
    if (!dadosDashboard.value?.historicoGrafico) return { labels: [], datasets: [] };
    const registros = dadosDashboard.value.historicoGrafico
        .filter(r => r.emocao !== 'CRIATIVO')
        .slice(-10); 
    const emotionValues = registros.map(r => emotionValueMap[r.emocao] || 4); 
    const pointEmojis = registros.map(r => emojiMap[r.emocao] || '😐');
    
    return {
        labels: registros.map(r => new Date(r.dataRegistro).toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})),
        datasets: [{ 
            label: 'Estado Emocional', 
            data: emotionValues, 
            borderColor: '#8B5CF6', 
            backgroundColor: 'rgba(139, 92, 246, 0.1)', 
            fill: true, 
            tension: 0.4, 
            pointRadius: 6, 
            pointHoverRadius: 8, 
            pointBackgroundColor: '#FFF', 
            pointBorderColor: '#8B5CF6', 
            pointBorderWidth: 2, 
            pointEmojis: pointEmojis 
        }]
    };
});

const chartOptionsEmocoes = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
        y: {
            min: 0, max: 7, 
            grid: { display: true, borderDash: [5, 5] },
            ticks: { callback: function(value) { return valueEmotionLabel[value] || ''; } }
        },
        x: { grid: { display: false } }
    }
};

const chartOptionsCommon = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } }, x: { grid: { display: false } } } };

// --- FUNÇÕES DE AVALIAÇÃO ---
async function buscarAvaliacaoSalva(force = true) {
    // Se não for forçado e já tiver dados preenchidos (sujos), não busca para não zerar a tela
    if (!force && Object.keys(formAvaliacao.value).length > 0) return;

    carregandoFicha.value = true;
    try {
        const res = await api.get('/api/avaliacoes/buscar', {
            params: { tipo: subTabAvaliacao.value, unidade: unidadeSelecionada.value },
            headers: { 'x-child-id': alunoSelecionado.value.id }
        });
        if (res.data && res.data.respostas) {
            formAvaliacao.value = res.data.respostas;
        } else if (force) {
            formAvaliacao.value = {}; 
        }
    } catch (e) { console.error("Erro ao buscar ficha", e); } finally { carregandoFicha.value = false; }
}

async function salvarAvaliacao() {
    salvandoAvaliacao.value = true;
    try {
        await api.post('/api/avaliacoes', {
            tipo: subTabAvaliacao.value, unidade: unidadeSelecionada.value, respostas: formAvaliacao.value
        }, { headers: { 'x-child-id': alunoSelecionado.value.id } });
        alert('Avaliação salva!');
    } catch(e) { alert('Erro ao salvar'); } finally { salvandoAvaliacao.value = false; }
}

function marcarTodos(valor) {
    if(!questoesFiltradas.value) return;
    for (const key in questoesFiltradas.value) {
        formAvaliacao.value[key] = valor;
    }
}

// --- NAVEGAÇÃO ---
function verVisaoGeral() {
    alunoSelecionado.value = null;
    viewAtual.value = 'geral';
    abaMobile.value = 'painel'; 
    buscarTotalAtividadesEnviadas().then(() => carregarDadosGeraisTurma());
}

function verSemanario() {
    alunoSelecionado.value = null;
    viewAtual.value = 'semanario';
    abaMobile.value = 'painel';
    carregarSemanario();
}

function irParaGerenciar() {
    viewAtual.value = 'gerenciar';
    abaMobile.value = 'painel'; 
}

async function selecionarAluno(aluno) {
    // Se trocou de aluno, limpa o formulário de avaliação para garantir dados frescos
    if (alunoSelecionado.value && alunoSelecionado.value.id !== aluno.id) {
        formAvaliacao.value = {};
    }
    alunoSelecionado.value = aluno;
    viewAtual.value = 'aluno';
    abaAlunoAtual.value = 'rendimento';
    abaMobile.value = 'painel'; 
    await carregarDadosAluno(aluno.id);
}

// --- ENVIAR ATIVIDADE ---
async function enviarAtividade() {
    if (!novaAtividade.value.conteudo && novaAtividade.value.tipo !== 'LIVRE') return alert("Digite o conteúdo.");
    if (alunosSelecionadosParaEnvio.value.length === 0) return alert("Selecione pelo menos um aluno.");
    
    enviandoAtividade.value = true;
    try {
        await api.post('/api/atividades/definir-tarefa', { tipo: novaAtividade.value.tipo, conteudo: novaAtividade.value.conteudo || '' });
        
        alert(`Atividade enviada para ${alunosSelecionadosParaEnvio.value.length} alunos!`);
        totalAtividadesEnviadasPeloProfessor.value++; 
        novaAtividade.value = { tipo: 'VOGAL', conteudo: '' };
        alunosSelecionadosParaEnvio.value = [];
        selecionarTodos.value = false;
    } catch (e) { alert("Erro ao enviar."); } finally { enviandoAtividade.value = false; }
}

function imprimirRelatorio() { window.print(); }
function formatarData(data) { return new Date(data).toLocaleString('pt-BR'); }

// Watchers
watch([subTabAvaliacao, abaAlunoAtual], async () => {
    if (alunoSelecionado.value && abaAlunoAtual.value === 'avaliacao') {
        const deveForcar = Object.keys(formAvaliacao.value).length === 0;
        await buscarAvaliacaoSalva(deveForcar);
    }
});
</script>

<template>
  <div class="min-h-screen bg-gray-50 font-nunito flex flex-col">
    
    <header class="bg-white border-b border-gray-200 px-4 md:px-6 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm print:hidden">
        <div class="flex items-center gap-3 md:gap-4">
            <div class="bg-indigo-600 text-white p-2 rounded-lg text-xl md:text-2xl shadow-md">👨‍🏫</div>
            <div>
                <h1 class="text-lg md:text-xl font-black text-gray-800 leading-none">Portal do Professor</h1>
            </div>
        </div>
        <div class="flex gap-2">
            <button @click="viewAtual = 'criar-atividade'" class="px-3 py-2 rounded-xl font-bold text-xs bg-white border text-gray-600">📤 Adicionar Atividade</button>
            <button @click="router.push('/login')" class="px-3 py-2 rounded-xl font-bold text-xs bg-red-50 text-red-500">Sair</button>
        </div>
    </header>

    <div class="md:hidden flex border-b border-gray-200 bg-white sticky top-[73px] z-20">
        <button @click="abaMobile = 'turma'" :class="['flex-1 py-3 text-center font-bold text-sm border-b-2', abaMobile === 'turma' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500']">
            Minha Turma
        </button>
        <button @click="abaMobile = 'painel'" :class="['flex-1 py-3 text-center font-bold text-sm border-b-2', abaMobile === 'painel' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500']">
            Painel Principal
        </button>
    </div>

    <div class="flex flex-1 overflow-hidden flex-col md:flex-row relative">
        
        <aside :class="['w-full md:w-72 bg-white border-r border-gray-200 flex-col overflow-y-auto z-10 print:hidden shrink-0 h-full absolute md:relative', abaMobile === 'turma' ? 'flex' : 'hidden md:flex']">
            <div class="p-4 border-b border-gray-100 space-y-2">
                <button @click="verSemanario" :class="['w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all', viewAtual === 'semanario' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100']">
                    <span>📅</span> Semanário
                </button>
                <button @click="verVisaoGeral" :class="['w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all', viewAtual === 'geral' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100']">
                    <span>📊</span> Rendimento Geral
                </button>
                <button @click="irParaGerenciar" :class="['w-full py-3 rounded-xl font-black text-sm flex items-center justify-center gap-2 transition-all', viewAtual === 'gerenciar' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100']">
                    <span>⚙️</span> Gerenciar Turma
                </button>
            </div>
            
            <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 md:bg-white sticky top-0">
                <h2 class="text-xs font-black text-gray-400 uppercase">Ranking da Turma</h2>
                <span class="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded font-bold">🏆</span>
            </div>
            
            <div class="p-2 space-y-1 overflow-y-auto pb-20">
                <button v-for="(aluno, index) in dadosTurma" :key="aluno.id" @click="selecionarAluno(aluno)" 
                    :class="['w-full flex items-center gap-3 p-3 rounded-xl text-left border transition-all', alunoSelecionado?.id === aluno.id ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-gray-50']">
                    <div :class="['w-6 h-6 flex items-center justify-center rounded-full text-xs font-black shrink-0', index === 0 ? 'bg-yellow-400 text-white' : 'bg-gray-100 text-gray-400']">{{ index + 1 }}</div>
                    <img :src="aluno.avatarUrl" class="w-8 h-8 rounded-full border border-gray-200 object-cover bg-gray-100">
                    <div class="flex-1 min-w-0">
                        <span class="font-bold text-sm text-gray-700 truncate block">{{ aluno.nome }}</span>
                        <div class="flex justify-between items-center text-[10px]">
                            <span class="text-green-600 font-bold">{{ aluno.atividadesFeitas }} OK</span>
                            <span v-if="aluno.atividadesPendentes > 0" class="text-orange-500 font-bold">{{ aluno.atividadesPendentes }} Pend.</span>
                        </div>
                    </div>
                </button>
            </div>
        </aside>

        <main 
            :class="['flex-1 bg-[#F3F4F6] overflow-y-auto p-4 md:p-8 print:p-0 print:bg-white relative h-full', abaMobile === 'painel' ? 'block' : 'hidden md:block']"
        >
            <div class="mobile-zoomed h-full">

                <div v-if="viewAtual === 'semanario'" class="max-w-4xl mx-auto animate-fade-in print:hidden">

                    <div class="bg-white p-6 md:p-8 rounded-3xl border border-gray-200 shadow-sm">
                        <div class="mb-6 border-b border-gray-100 pb-4 flex justify-between items-center">
                            <div>
                                <h2 class="text-2xl font-black text-indigo-600">Planejamento Semanal</h2>
                                <p class="text-gray-500 text-sm">Defina objetivos e descreva as atividades.</p>
                            </div>
                            <button @click="iniciarNovaSemana" class="px-4 py-2 bg-red-50 text-red-500 font-bold rounded-xl text-xs hover:bg-red-100">
                                🗑️ Limpar Tudo (Nova Semana)
                            </button>
                        </div>
                        
                        <div class="mb-8 p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                            <h3 class="text-sm font-black text-indigo-800 mb-4 uppercase">1. Definir Objetivos de Avaliação</h3>
                            
                            <div class="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div>
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Dia</label>
                                    <select v-model="objetivoTempDia" class="w-full p-3 rounded-xl bg-white border border-gray-200 font-bold text-sm focus:border-indigo-500">
                                        <option value="">Selecione...</option>
                                        <option value="segunda">Segunda</option>
                                        <option value="terca">Terça</option>
                                        <option value="quarta">Quarta</option>
                                        <option value="quinta">Quinta</option>
                                        <option value="sexta">Sexta</option>
                                    </select>
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Categoria</label>
                                    <select v-model="objetivoTempCategoria" class="w-full p-3 rounded-xl bg-white border border-gray-200 font-bold text-sm focus:border-indigo-500">
                                        <option value="">Selecione...</option>
                                        <option v-for="(template, key) in templatesAvaliacao" :key="key" :value="key">
                                            {{ key }}
                                        </option>
                                    </select>
                                </div>
                                <div class="md:col-span-1">
                                    <label class="block text-xs font-bold text-gray-400 uppercase mb-1">Objetivo / Habilidade</label>
                                    <select v-model="objetivoTempDescricao" :disabled="!objetivoTempCategoria" class="w-full p-3 rounded-xl bg-white border border-gray-200 font-bold text-sm focus:border-indigo-500">
                                        <option value="">Selecione...</option>
                                        <option v-for="(texto, id) in questoesDisponiveis" :key="id" :value="id">
                                            {{ id }} - {{ texto.substring(0, 30) }}...
                                        </option>
                                    </select>
                                </div>
                                <div>
                                    <button @click="adicionarObjetivo" class="w-full bg-indigo-600 text-white px-4 py-3 rounded-xl font-bold shadow hover:bg-indigo-700 transition-colors">
                                        + Adicionar
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div class="grid gap-8">
                            <div v-for="dia in ['segunda', 'terca', 'quarta', 'quinta', 'sexta']" :key="dia" class="relative">
                                <label class="block text-xs font-black text-gray-400 uppercase mb-2 ml-1">
                                    {{ dia.charAt(0).toUpperCase() + dia.slice(1) }}-Feira
                                </label>
                                <textarea 
                                    v-model="formSemanario[dia]" 
                                    rows="3" 
                                    class="w-full p-4 rounded-xl bg-gray-50 border-2 border-gray-100 focus:border-indigo-500 focus:bg-white transition-all font-bold text-gray-700 resize-none"
                                    placeholder="Digite o planejamento para este dia..."
                                ></textarea>
                                
                                <div v-if="getObjetivosPorDia(dia).length > 0" class="mt-2 space-y-2 pl-4 border-l-4 border-indigo-200">
                                    <div v-for="(obj, index) in getObjetivosPorDia(dia)" :key="index" class="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100 shadow-sm text-sm">
                                        <div>
                                            <span class="text-[10px] font-black uppercase text-indigo-500 block">
                                                {{ obj.categoria }}
                                            </span>
                                            <span class="font-bold text-gray-700">{{ obj.descricao }}</span>
                                        </div>
                                        <button @click="removerObjetivo(obj)" class="text-red-400 hover:text-red-600 font-bold text-xs ml-2 px-2 py-1 bg-red-50 rounded">
                                            Remover
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                            <button 
                                @click="salvarSemanario" 
                                :disabled="salvandoSemanario"
                                class="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 px-8 rounded-xl shadow-lg transition-all flex items-center gap-2"
                            >
                                <span v-if="salvandoSemanario">Salvando...</span>
                                <span v-else>💾 Salvar Planejamento</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else-if="viewAtual === 'geral'" class="max-w-6xl mx-auto animate-fade-in print:hidden">
                    <div class="mb-8 flex justify-between items-end">
                        <div>
                            <h2 class="text-xl md:text-2xl font-black text-gray-800">Rendimento Geral</h2>
                            <p class="text-gray-500 font-bold text-xs">Total de envios: <span class="text-indigo-600">{{ totalAtividadesEnviadasPeloProfessor }}</span></p>
                        </div>
                    </div>
                    <div :class="['p-4 md:p-6 rounded-3xl mb-8 flex items-center gap-4 shadow-sm border', dicaRendimentoGeral.cor]">
                        <div class="text-3xl">{{ dicaRendimentoGeral.icon }}</div>
                        <div>
                            <h4 class="font-black text-sm uppercase opacity-80">Análise</h4>
                            <p class="font-bold text-sm md:text-lg leading-tight">{{ dicaRendimentoGeral.texto }}</p>
                        </div>
                    </div>
                    <div class="bg-white p-4 md:p-6 rounded-3xl border border-gray-200 shadow-sm h-64 md:h-96 mb-8">
                        <div class="flex justify-between items-center mb-4">
                            <h4 class="text-xs font-black text-gray-400 uppercase">Progresso da Turma</h4>
                        </div>
                        <Bar :data="chartDataTurma" :options="chartOptionsTurma" />
                    </div>
                </div>

                <div v-else-if="viewAtual === 'gerenciar'" class="max-w-4xl mx-auto animate-fade-in">
                      <h2 class="text-2xl font-black text-gray-800 mb-6">Gerenciar Alunos</h2>
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div class="md:col-span-1 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm h-fit">
                            <h3 class="font-bold text-lg mb-4 text-indigo-600">{{ modoEdicao ? 'Editar' : 'Novo' }}</h3>
                            <div class="space-y-4">
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Nome</label><input v-model="novoAluno.nome" type="text" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-bold"></div>
                                <div><label class="block text-xs font-bold text-gray-400 uppercase mb-1">Nascimento</label><input v-model="novoAluno.dataNascimento" type="date" class="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 font-bold"></div>
                                
                                <div class="flex flex-col items-center my-2">
                                    <div class="relative">
                                        <img :src="novoAluno.avatarUrl" class="w-20 h-20 rounded-full bg-gray-100 border-2 border-indigo-100">
                                        <button @click="gerarNovoAvatar" class="absolute bottom-0 right-0 bg-indigo-600 text-white p-1 rounded-full w-8 h-8 flex items-center justify-center shadow hover:bg-indigo-700" title="Trocar Avatar">
                                            🎲
                                        </button>
                                    </div>
                                    <span class="text-[10px] text-gray-400 mt-1">Clique no dado para trocar</span>
                                </div>

                                <button @click="salvarAluno" :disabled="cadastrandoAluno" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md transition-all">{{ cadastrandoAluno ? 'Salvando...' : (modoEdicao ? 'Atualizar' : 'Cadastrar') }}</button>
                                <button v-if="modoEdicao" @click="cancelarEdicao" class="w-full py-2 text-gray-400 font-bold text-xs">Cancelar</button>
                            </div>
                        </div>
                        <div class="md:col-span-2 bg-white p-6 rounded-3xl border border-gray-200 shadow-sm">
                            <h3 class="font-bold text-lg mb-4 text-gray-700">Turma ({{ dependentes.length }})</h3>
                            <div class="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                <div v-for="aluno in dependentes" :key="aluno.id" class="flex items-center justify-between p-3 rounded-xl border border-gray-100 hover:bg-gray-50">
                                    <div class="flex items-center gap-3"><img :src="aluno.avatarUrl" class="w-10 h-10 rounded-full border"><div><p class="font-bold text-gray-800 text-sm">{{ aluno.nome }}</p></div></div>
                                    <div class="flex gap-2"><button @click="prepararEdicao(aluno)" class="p-2 bg-blue-50 text-blue-600 rounded-lg">✏️</button><button @click="excluirAluno(aluno.id)" class="p-2 bg-red-50 text-red-600 rounded-lg">🗑️</button></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else-if="viewAtual === 'criar-atividade'" class="max-w-4xl mx-auto animate-fade-in print:hidden">
                    <div class="flex flex-col md:flex-row gap-6">
                        <div class="flex-1 bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-200">
                            <h2 class="text-xl font-black text-gray-800 mb-6">Nova Atividade</h2>
                            
                            <div class="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                                <div v-for="tipo in ['VOGAL', 'CONSOANTE', 'NUMERO', 'LUGARES', 'NOMES']" 
                                     :key="tipo" 
                                     @click="novaAtividade.tipo = tipo" 
                                     :class="['p-3 rounded-xl border-2 text-center font-bold text-xs cursor-pointer transition-all flex items-center justify-center h-16', novaAtividade.tipo === tipo ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-100 hover:border-gray-200 text-gray-500']">
                                     {{ tipo }}
                                </div>
                            </div>
                            
                            <div v-if="novaAtividade.tipo !== 'LIVRE'" class="mb-6"><label class="block text-xs font-bold text-gray-400 uppercase mb-2">Conteúdo</label><input v-model="novaAtividade.conteudo" type="text" class="w-full p-4 rounded-xl bg-gray-50 border-2 font-black text-center text-2xl uppercase"></div>
                            <button @click="enviarAtividade" :disabled="enviandoAtividade" class="w-full bg-indigo-600 text-white font-bold py-4 rounded-xl shadow-lg">Enviar para {{ alunosSelecionadosParaEnvio.length }} Aluno(s)</button>
                        </div>
                        <div class="w-full md:w-80 bg-white p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col h-auto md:h-[500px]">
                            <div class="flex justify-between items-center mb-4 border-b border-gray-100 pb-2"><h3 class="font-bold text-gray-700">Destinatários</h3><label class="flex items-center gap-2 cursor-pointer text-xs font-bold text-indigo-600 hover:text-indigo-800"><input type="checkbox" v-model="selecionarTodos" class="rounded text-indigo-600 focus:ring-indigo-500"> Todos</label></div>
                            <div class="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar max-h-60 md:max-h-full">
                                <label v-for="aluno in dependentes" :key="aluno.id" :class="['flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all', alunosSelecionadosParaEnvio.includes(aluno.id) ? 'border-indigo-500 bg-indigo-50' : 'border-transparent hover:bg-gray-50']">
                                    <input type="checkbox" :value="aluno.id" v-model="alunosSelecionadosParaEnvio" class="w-5 h-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300">
                                    <img :src="aluno.avatarUrl" class="w-8 h-8 rounded-full bg-gray-200">
                                    <span class="text-sm font-bold text-gray-700">{{ aluno.nome }}</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-else-if="viewAtual === 'aluno' && alunoSelecionado" class="max-w-6xl mx-auto">
                    <div class="bg-white rounded-3xl p-4 shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4 print:hidden">
                        <div class="flex items-center gap-4 w-full md:w-auto"><img :src="alunoSelecionado.avatarUrl" class="w-16 h-16 rounded-full border-4 border-indigo-50"><div><h2 class="text-2xl font-black text-gray-800">{{ alunoSelecionado.nome }}</h2></div></div>
                        <div class="flex bg-gray-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto">
                            <button @click="abaAlunoAtual = 'rendimento'" :class="['flex-1 px-4 py-2 rounded-lg font-bold text-xs', abaAlunoAtual==='rendimento'?'bg-white shadow text-gray-800':'text-gray-500']">Rendimento</button>
                            <button @click="abaAlunoAtual = 'avaliacao'" :class="['flex-1 px-4 py-2 rounded-lg font-bold text-xs', abaAlunoAtual==='avaliacao'?'bg-white shadow text-gray-800':'text-gray-500']">Avaliação</button>
                            <button @click="abaAlunoAtual = 'diario'" :class="['flex-1 px-4 py-2 rounded-lg font-bold text-xs', abaAlunoAtual==='diario'?'bg-white shadow text-gray-800':'text-gray-500']">Diário</button>
                        </div>
                    </div>
                    
                    <div v-if="abaAlunoAtual === 'rendimento'" class="space-y-8 animate-fade-in print:hidden">
                        <div v-if="sugestaoPedagogica" :class="['p-4 rounded-2xl border mb-6 flex items-center gap-4 shadow-sm', sugestaoPedagogica.cor]">
                            <div class="text-2xl">💡</div><div><h4 class="font-bold text-sm uppercase opacity-80">Sugestão Pedagógica</h4><p class="font-bold">{{ sugestaoPedagogica.texto }}</p></div>
                        </div>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div class="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm h-64 md:h-80"><h4 class="text-xs font-black text-gray-400 uppercase mb-4">Entregas</h4><Bar :data="chartDataAtividades" :options="chartOptionsCommon" /></div>
                            <div class="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm h-64 md:h-80"><h4 class="text-xs font-black text-gray-400 uppercase mb-4">Oscilação Emocional (Valência)</h4><Line :data="chartDataEmocoes" :options="chartOptionsEmocoes" :plugins="[emojiPlugin]" /></div>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-4"><span class="text-2xl">📝</span><h3 class="text-lg font-black text-gray-700">Atividades Realizadas</h3></div>
                            <div v-if="atividadesGuiadas.length > 0" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <div v-for="ativ in atividadesGuiadas" :key="ativ.id" class="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                    <div class="aspect-square bg-gray-50 rounded-xl mb-3 overflow-hidden border border-gray-100"><img :src="ativ.desenhoBase64" class="w-full h-full object-contain"></div>
                                    <div class="flex justify-between items-center px-1"><span class="text-[10px] font-black bg-indigo-50 text-indigo-700 px-2 py-1 rounded">{{ ativ.tipo }}: {{ ativ.conteudo }}</span><span class="text-[10px] text-gray-400 font-bold">{{ formatarData(ativ.dataRealizacao).split(' ')[0] }}</span></div>
                                </div>
                            </div>
                            <div v-else class="text-center py-10 bg-white rounded-3xl border border-dashed border-gray-300"><p class="text-gray-400 font-bold">Nenhuma atividade guiada entregue ainda.</p></div>
                        </div>
                        <div>
                            <div class="flex items-center gap-2 mb-4"><span class="text-2xl">🎨</span><h3 class="text-lg font-black text-gray-700">Galeria de Arte</h3></div>
                            <div v-if="desenhosLivres.length > 0" class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                                <div v-for="desenho in desenhosLivres" :key="desenho.id" class="bg-white p-3 rounded-2xl border border-gray-200 shadow-sm hover:shadow-md transition-all">
                                    <div class="aspect-square bg-purple-50 rounded-xl mb-3 overflow-hidden border border-gray-100"><img :src="desenho.desenhoBase64" class="w-full h-full object-contain"></div>
                                    <div class="flex justify-between items-center px-1"><span class="text-[10px] font-black bg-purple-100 text-purple-700 px-2 py-1 rounded">LIVRE</span><span class="text-[10px] text-gray-400 font-bold">{{ formatarData(desenho.dataRealizacao).split(' ')[0] }}</span></div>
                                </div>
                            </div>
                            <div v-else class="text-center py-10 bg-white rounded-3xl border border-dashed border-gray-300"><p class="text-gray-400 font-bold">Galeria vazia.</p></div>
                        </div>
                    </div>

                    <div v-else-if="abaAlunoAtual === 'avaliacao'" class="bg-white p-8 rounded-3xl border border-gray-200 shadow-sm animate-fade-in print:border-0 print:shadow-none print:p-0">
                        <div class="hidden print:block mb-8 text-center border-b pb-4">
                            <h1 class="text-2xl font-bold text-gray-800">Relatório de Avaliação Individual</h1>
                            <p class="text-sm text-gray-600">Aluno: {{ alunoSelecionado.nome }} | Avaliação: {{ templatesAvaliacao[subTabAvaliacao]?.titulo }}</p>
                        </div>
                        <div class="print:hidden">
                            <div class="flex gap-2 overflow-x-auto pb-4 mb-4">
                                <button v-for="(template, key) in templatesAvaliacao" :key="key" @click="subTabAvaliacao = key" :class="['px-6 py-3 rounded-xl font-bold text-xs transition-all border-2', subTabAvaliacao === key ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-500 border-gray-100 hover:border-gray-200']">
                                    <span class="block text-lg">{{ key }}</span>
                                    <span class="text-[10px] opacity-80 whitespace-nowrap">{{ template.titulo.split('(')[0] }}</span>
                                </button>
                            </div>
                        </div>
                        <div v-if="carregandoFicha" class="text-center py-10 opacity-50 font-bold">Carregando ficha...</div>
                        
                        <div v-else-if="Object.keys(questoesFiltradas).length > 0" class="space-y-0 bg-gray-50 rounded-2xl overflow-hidden border border-gray-200 print:bg-white print:border-gray-800">
                             <div class="p-4 bg-gray-100 border-b border-gray-300 print:bg-white flex justify-between items-center">
                                 <h3 class="font-black text-gray-800">{{ templatesAvaliacao[subTabAvaliacao].titulo }}</h3>
                                 <div class="flex gap-2 print:hidden">
                                    <button @click="marcarTodos('S')" class="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-bold hover:bg-green-200">Todos SIM</button>
                                    <button @click="marcarTodos('N')" class="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-bold hover:bg-red-200">Todos NÃO</button>
                                    <button @click="marcarTodos('NA')" class="text-[10px] bg-gray-200 text-gray-700 px-2 py-1 rounded font-bold hover:bg-gray-300">Todos N/A</button>
                                 </div>
                             </div>
                             
                             <div v-for="(texto, num) in questoesFiltradas" :key="num" class="flex items-center justify-between p-4 border-b border-gray-200 bg-white hover:bg-indigo-50/30 transition-colors">
                                <div class="flex gap-4 pr-4"><span class="font-black text-gray-300 w-6">{{ num }}</span><p class="text-sm font-bold text-gray-600 leading-snug">{{ texto }}</p></div>
                                <div class="flex gap-2 shrink-0">
                                    <label class="cursor-pointer flex flex-col items-center group"><input type="radio" :name="'q'+num" value="S" v-model="formAvaliacao[num]" class="peer sr-only"><div class="w-8 h-8 rounded border-2 border-gray-200 bg-white peer-checked:bg-green-500 peer-checked:border-green-500 flex items-center justify-center transition-all shadow-sm"><span class="text-white text-sm font-bold hidden peer-checked:block">✓</span></div><span class="text-[9px] font-bold text-gray-300 mt-1 peer-checked:text-green-500 print:hidden">SIM</span></label>
                                    <label class="cursor-pointer flex flex-col items-center group"><input type="radio" :name="'q'+num" value="N" v-model="formAvaliacao[num]" class="peer sr-only"><div class="w-8 h-8 rounded border-2 border-gray-200 bg-white peer-checked:bg-red-500 peer-checked:border-red-500 flex items-center justify-center transition-all shadow-sm"><span class="text-white text-sm font-bold hidden peer-checked:block">✕</span></div><span class="text-[9px] font-bold text-gray-300 mt-1 peer-checked:text-red-500 print:hidden">NÃO</span></label>
                                    <label class="cursor-pointer flex flex-col items-center group"><input type="radio" :name="'q'+num" value="NA" v-model="formAvaliacao[num]" class="peer sr-only"><div class="w-8 h-8 rounded border-2 border-gray-200 bg-white peer-checked:bg-gray-400 peer-checked:border-gray-400 flex items-center justify-center transition-all shadow-sm"><span class="text-white text-sm font-bold hidden peer-checked:block">-</span></div><span class="text-[9px] font-bold text-gray-300 mt-1 peer-checked:text-gray-500 print:hidden">N/A</span></label>
                                </div>
                             </div>
                        </div>
                        
                        <div v-else class="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                             <p class="text-gray-400 font-bold mb-2">Nenhum objetivo definido para esta categoria no Semanário.</p>
                             <button @click="verSemanario" class="text-indigo-600 text-xs font-bold hover:underline">Ir para Semanário e adicionar objetivos</button>
                        </div>

                        <div class="mt-6 flex gap-4 print:hidden">
                            <button @click="salvarAvaliacao" :disabled="salvandoAvaliacao" class="flex-1 bg-gray-900 hover:bg-black text-white font-bold py-4 rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2">
                                <span v-if="salvandoAvaliacao">Salvando...</span><span v-else>💾 Salvar Avaliação</span>
                            </button>
                            <button @click="showRelatorioModal = true" class="px-6 py-4 bg-white border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50">📄 Imprimir</button>
                        </div>
                    </div>

                    <div v-else-if="abaAlunoAtual === 'diario'" class="bg-white p-6 rounded-3xl border border-gray-200 shadow-sm animate-fade-in print:hidden">
                          <div class="flex items-center justify-between mb-6"><div class="flex items-center gap-2"><span class="text-2xl">📝</span><h3 class="text-lg font-black text-gray-700">Registrar Diário Emocional</h3></div></div>
                          <div class="bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 mb-8">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase mb-3">Como o aluno está se sentindo?</label>
                                    <div class="flex flex-wrap gap-2">
                                        <button v-for="emo in emocoesOpcoes" :key="emo.valor" @click="novoDiario.emocao = emo.valor" :class="['flex-1 min-w-[80px] py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all', novoDiario.emocao === emo.valor ? 'bg-white border-indigo-500 shadow-md transform scale-105' : 'bg-white border-gray-200 hover:border-indigo-200 opacity-80']">
                                            <span class="text-2xl">{{ emo.emoji }}</span><span :class="['text-[10px] font-bold uppercase', novoDiario.emocao === emo.valor ? 'text-indigo-600' : 'text-gray-400']">{{ emo.label }}</span>
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-500 uppercase mb-3">Intensidade (1 a 5)</label>
                                    <div class="flex gap-2"><button v-for="n in 5" :key="n" @click="novoDiario.intensidade = n" :class="['w-10 h-10 rounded-full font-bold border-2 transition-all', novoDiario.intensidade === n ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-400 border-gray-200']">{{ n }}</button></div>
                                    <div class="mt-4"><label class="block text-xs font-bold text-gray-500 uppercase mb-2">Observações / Relato</label><textarea v-model="novoDiario.relato" rows="3" class="w-full p-3 rounded-xl bg-white border border-gray-200 focus:border-indigo-500 transition-all font-bold text-gray-600 text-sm resize-none" placeholder="Descreva o motivo ou observações importantes..."></textarea></div>
                                </div>
                            </div>
                            <div class="flex justify-end"><button @click="salvarDiarioProfessor" :disabled="salvandoDiario" class="bg-indigo-600 text-white font-bold py-3 px-8 rounded-xl shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"><span v-if="salvandoDiario">Salvando...</span><span v-else>✅ Registrar no Diário</span></button></div>
                         </div>
                         <h4 class="text-xs font-black text-gray-400 uppercase mb-4 pl-1">Histórico de Registros</h4>
                         <div v-if="registrosDiario.length > 0" class="space-y-4">
                            <div v-for="reg in registrosDiario" :key="reg.id" class="flex items-start gap-4 p-4 rounded-2xl bg-white border border-gray-100 hover:shadow-sm transition-all">
                                <div class="text-3xl bg-gray-50 w-12 h-12 flex items-center justify-center rounded-xl border border-gray-100">{{ emojiMap[reg.emocao] || '😐' }}</div>
                                <div class="flex-1">
                                    <div class="flex justify-between items-start"><h4 class="font-bold text-gray-800 text-sm uppercase">{{ reg.emocao }} <span class="text-gray-400 text-xs font-normal ml-2">Nível {{ reg.intensidade }}/5</span></h4><span class="text-[10px] font-bold text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">{{ formatarData(reg.dataRegistro) }}</span></div>
                                    <p v-if="reg.relato" class="text-sm text-gray-600 mt-2 italic">"{{ reg.relato }}"</p><p v-else class="text-xs text-gray-300 mt-2 italic">(Sem observações)</p>
                                </div>
                            </div>
                         </div>
                         <div v-else class="text-center py-10 bg-gray-50 rounded-2xl border border-dashed border-gray-200"><p class="text-gray-400 font-bold">Nenhum registro emocional realizado.</p></div>
                    </div>

                </div>
            </div>
        </main>
    </div>
    
    <div v-if="showRelatorioModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm print:hidden">
        <div class="bg-white w-full max-w-3xl h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div class="p-6 border-b flex justify-between items-center bg-gray-50 relative"><h3 class="font-bold text-lg text-gray-800">Visualizar Relatório</h3><button @click="showRelatorioModal = false" class="text-gray-400 hover:text-red-500 text-2xl absolute right-6">✕</button></div>
            <div class="flex-1 overflow-y-auto p-8 bg-white" id="area-impressao">
                <div class="border-2 border-gray-800 p-8 mb-4">
                    <div class="flex justify-between items-center border-b-2 border-gray-800 pb-4 mb-6">
                        <div><h1 class="text-2xl font-black text-gray-900 uppercase">Ficha de Avaliação</h1><p class="text-sm font-bold text-gray-600">Educação Infantil</p></div>
                        <div class="text-right text-sm"><p><strong>Aluno:</strong> {{ alunoSelecionado?.nome }}</p><p><strong>Tipo:</strong> {{ templatesAvaliacao[subTabAvaliacao]?.titulo }}</p></div>
                    </div>
                    
                    <table class="w-full text-sm">
                        <thead><tr class="bg-gray-100"><th class="p-2 text-left border">Critério</th><th class="p-2 w-16 text-center border">SIM</th><th class="p-2 w-16 text-center border">NÃO</th><th class="p-2 w-16 text-center border">N/A</th></tr></thead>
                        <tbody>
                            <tr v-for="(texto, num) in questoesFiltradas" :key="num">
                                <td class="p-2 border">{{ num }}. {{ texto }}</td>
                                <td class="p-2 border text-center font-bold text-green-600">{{ formAvaliacao[num] === 'S' ? 'X' : '' }}</td>
                                <td class="p-2 border text-center font-bold text-red-600">{{ formAvaliacao[num] === 'N' ? 'X' : '' }}</td>
                                <td class="p-2 border text-center font-bold text-gray-400">{{ formAvaliacao[num] === 'NA' ? 'X' : '' }}</td>
                            </tr>
                            <tr v-if="Object.keys(questoesFiltradas).length === 0">
                                <td colspan="4" class="p-4 text-center text-gray-400 italic">Nenhum objetivo definido para esta categoria nesta semana.</td>
                            </tr>
                        </tbody>
                    </table>

                    <div class="mt-8 pt-4 border-t-2 border-gray-800 flex justify-between"><div class="text-xs">Data: {{ new Date().toLocaleDateString() }}</div><div class="text-xs">Assinatura do Professor: __________________________</div></div>
                </div>
            </div>
            <div class="p-4 border-t bg-gray-50 flex justify-end gap-3"><button @click="imprimirRelatorio" class="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700">🖨️ Imprimir</button><button @click="showRelatorioModal = false" class="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300">Fechar</button></div>
        </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;900&display=swap');
.font-nunito { font-family: 'Nunito', sans-serif; }
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media print {
    body * { visibility: hidden; }
    #area-impressao, #area-impressao * { visibility: visible; }
    #area-impressao { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; }
    .print\:hidden { display: none !important; }
}
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-track { background: #f1f1f1; }
.custom-scrollbar::-webkit-scrollbar-thumb { background: #c7c7c7; border-radius: 3px; }
.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }

@media (max-width: 768px) {
  .mobile-zoomed {
    zoom: 0.8;
  }
}
</style>