/* ============================================================
   AMSI – Sistema de Contabilidade
   app.js – Firebase Auth + Firestore integrado
   ============================================================ */

'use strict';

// ============================================================
// FIREBASE CONFIG & INIT
// ============================================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  startAfter
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyC3PWYDdh0NIvxk6APh4PbPzwKFxkLeqk0",
  authDomain: "amsi-contabilidade.firebaseapp.com",
  projectId: "amsi-contabilidade",
  storageBucket: "amsi-contabilidade.firebasestorage.app",
  messagingSenderId: "61390318471",
  appId: "1:61390318471:web:246a841206fdea8ccc4122",
  measurementId: "G-PQF84ZGNRH"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);
const provider    = new GoogleAuthProvider();

// ID da empresa ativa (usa a primeira empresa ou pode ser selecionado)
// Por enquanto usamos uma coleção raiz por usuário via uid
let currentUser   = null;
let empresaAtiva  = null; // será o doc ID da empresa selecionada

// ============================================================
// UTILITÁRIOS
// ============================================================

function fmt(val) {
  return 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

function hoje() {
  return new Date().toISOString().split('T')[0];
}

// ============================================================
// SEGURANÇA – Sanitização e validação de entrada
// ============================================================

/**
 * Escapa caracteres HTML para prevenir XSS.
 * SEMPRE use esta função ao inserir dados do usuário/banco via innerHTML.
 */
function esc(str) {
  if (str === null || str === undefined) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Valida e sanitiza um valor numérico.
 * Retorna o número ou null se inválido.
 */
function sanitizeNumber(val, min = 0) {
  const n = parseFloat(String(val).replace(',', '.'));
  if (isNaN(n) || n < min) return null;
  return n;
}

/**
 * Valida formato de data ISO (YYYY-MM-DD).
 */
function isValidDate(val) {
  return /^\d{4}-\d{2}-\d{2}$/.test(val) && !isNaN(Date.parse(val));
}

/**
 * Sanitiza texto de entrada: remove caracteres de controle e limita tamanho.
 */
function sanitizeText(val, maxLen = 500) {
  if (!val) return '';
  return String(val)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // remove control chars
    .trim()
    .substring(0, maxLen);
}

/**
 * Sanitiza IDs vindos do Firestore para uso em atributos HTML.
 * IDs do Firestore são alfanuméricos, então qualquer outro caractere é rejeitado.
 */
function sanitizeId(id) {
  if (!id) return '';
  return String(id).replace(/[^a-zA-Z0-9_\-]/g, '');
}

// ============================================================
// CAMINHO FIRESTORE (baseado no uid do usuário logado)
// ============================================================

function colRef(nome) {
  if (!currentUser) throw new Error('Usuário não autenticado.');
  return collection(db, 'users', currentUser.uid, nome);
}

function docRef(nome, id) {
  if (!currentUser) throw new Error('Usuário não autenticado.');
  return doc(db, 'users', currentUser.uid, nome, id);
}

// ============================================================
// SVG ICONS
// ============================================================

const Icon = {
  trending_up:   `<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  trending_down: `<svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  dollar:        `<svg viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  arrow_up:      `<svg viewBox="0 0 24 24"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
  arrow_down:    `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`,
  clock:         `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  check:         `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
  x:             `<svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  trash:         `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  menu:          `<svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
  search:        `<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  bell:          `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  download:      `<svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
  plus:          `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
  credit:        `<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  debit:         `<svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>`,
  refresh:       `<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
};

// ============================================================
// AUTENTICAÇÃO
// ============================================================

window.fazerLogin = async function() {
  const btn    = qs('#btn-login');
  const errEl  = qs('#login-error');

  btn.classList.add('loading');
  btn.disabled = true;
  errEl.classList.remove('visible');

  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const msgs = {
      'auth/popup-closed-by-user':    'Login cancelado.',
      'auth/cancelled-popup-request': 'Login cancelado.',
      'auth/network-request-failed':  'Erro de conexão. Verifique sua internet.',
      'auth/unauthorized-domain':     'Este domínio não está autorizado no Firebase. Adicione-o em Authentication > Settings > Authorized domains.',
    };
    errEl.textContent = msgs[err.code] || `Erro: ${err.message}`;
    errEl.classList.add('visible');
    btn.classList.remove('loading');
    btn.disabled = false;
  }
};

window.fazerLogout = async function() {
  await signOut(auth);
};

// ============================================================
// OBSERVER DE AUTENTICAÇÃO – ponto central de inicialização
// ============================================================

// Timeout de segurança: se o Firebase demorar >3s pra responder,
// mostra a tela de login direto (evita spinner infinito)
const authTimeout = setTimeout(() => {
  const loadingEl = qs('#loading-screen');
  const loginEl   = qs('#login-screen');
  if (loadingEl && !loadingEl.classList.contains('hidden')) {
    loadingEl.classList.add('hidden');
    loginEl?.classList.remove('hidden');
  }
}, 3000);

onAuthStateChanged(auth, async (user) => {
  clearTimeout(authTimeout); // cancela o timeout se o Firebase respondeu

  const loadingEl = qs('#loading-screen');
  const loginEl   = qs('#login-screen');
  const appEl     = qs('#app');

  if (user) {
    // Usuário logado
    currentUser = user;

    // Atualiza UI do usuário
    const nome     = user.displayName || user.email.split('@')[0];
    const initials = nome.split(' ').map(p => p[0]).join('').substring(0, 2).toUpperCase();
    const elAvatar = qs('#user-avatar');
    const elNome   = qs('#user-nome');
    const elEmail  = qs('#user-email');
    const elCfg    = qs('#cfg-user-info');
    if (elAvatar) elAvatar.textContent = initials;
    if (elNome)   elNome.textContent   = nome;
    if (elEmail)  elEmail.textContent  = user.email;
    if (elCfg)    elCfg.textContent    = `${nome} — ${user.email}`;

    // Esconde loading, mostra app
    loadingEl?.classList.add('hidden');
    loginEl?.classList.add('hidden');
    appEl.style.display = 'flex';

    // Inicializa a aplicação
    await initApp();

  } else {
    // Não autenticado
    currentUser = null;
    loadingEl?.classList.add('hidden');
    loginEl?.classList.remove('hidden');
    appEl.style.display = 'none';
  }
});

// ============================================================
// IMPORTAR DADOS DEMO → FIRESTORE
// Chame importarDadosDemo() no console do navegador após logar
// ============================================================

window.importarDadosDemo = async function() {
  if (!currentUser) {
    alert('Faça login primeiro antes de importar os dados.'); return;
  }

  const confirma = confirm(
    'Isso vai importar todos os dados de demonstração (lançamentos, contas a pagar, contas a receber, plano de contas, fluxo de caixa e empresas) para o seu Firestore.\n\nContinuar?'
  );
  if (!confirma) return;

  toast('Importando dados... aguarde.', 'info');

  // Garante que os dados demo estão no DB local
  carregarDadosDemo();

  const colecoes = {
    lancamentos:        DB.lancamentos,
    'contas a pagar':   DB['contas a pagar'],
    'contas a receber': DB['contas a receber'],
    planoContas:        DB.planoContas,
    fluxoCaixa:         DB.fluxoCaixa,
    empresas:           DB.empresas,
  };

  let total = 0;
  try {
    for (const [nome, registros] of Object.entries(colecoes)) {
      for (const reg of registros) {
        // Remove o id local antes de salvar (Firestore gera o próprio)
        const { id, ...dados } = reg;
        await addDoc(colRef(nome), { ...dados, importadoEm: serverTimestamp() });
        total++;
      }
    }
    toast(`✓ ${total} registros importados com sucesso!`, 'success');
    // Recarrega os dados do Firestore
    await carregarTudo();
  } catch (err) {
    console.error('Erro ao importar:', err);
    toast('Erro ao importar: ' + err.message, 'error');
  }
};

// ============================================================
// INICIALIZAÇÃO DO APP (após login)
// ============================================================

async function initApp() {
  // Sidebar toggle
  qs('#btn-toggle')?.addEventListener('click', () => {
    qs('.sidebar').classList.toggle('collapsed');
  });

  // Navigation
  qsa('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => navigate(item.dataset.page));
  });

  // Period tabs
  qsa('.period-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      tab.closest('.period-tabs').querySelectorAll('.period-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Generic tabs
  qsa('.tabs-bar').forEach(bar => {
    bar.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        bar.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  });

  // Modal backdrops
  qsa('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', e => {
      if (e.target === bd) bd.classList.remove('open');
    });
  });

  // Plano de contas search
  qs('#busca-conta')?.addEventListener('input', e => renderPlanoContas(e.target.value));

  // Lançamentos filter
  qs('#filter-tipo')?.addEventListener('change', renderLancamentos);
  qs('#data-inicio')?.addEventListener('change', renderLancamentos);
  qs('#data-fim')?.addEventListener('change', renderLancamentos);

  // Setar datas de hoje nos formulários
  const dataHoje = hoje();
  ['lanc-data', 'cp-emissao', 'cr-emissao'].forEach(id => {
    const el = qs(`#${id}`);
    if (el) el.value = dataHoje;
  });

  // Expor globais para onclick no HTML
  window.navigate          = navigate;
  window.openModal         = openModal;
  window.closeModal        = closeModal;
  window.executeDelete     = executeDelete;
  window.toast             = toast;
  window.deleteLancamento  = deleteLancamento;
  window.editLancamento    = editLancamento;
  window.saveLancamento    = saveLancamento;
  window.deleteContaPagar  = deleteContaPagar;
  window.editContaPagar    = editContaPagar;
  window.pagarConta        = pagarConta;
  window.saveContaPagar    = saveContaPagar;
  window.deleteContaReceber= deleteContaReceber;
  window.editContaReceber  = editContaReceber;
  window.receberConta      = receberConta;
  window.saveContaReceber  = saveContaReceber;
  window.deleteEmpresa     = deleteEmpresa;
  window.editEmpresa       = editEmpresa;
  window.saveEmpresa       = saveEmpresa;
  window.loadMore          = loadMore;
  window.renderPlanoContas = renderPlanoContas;

  // Carrega dados do Firestore e renderiza
  await carregarTudo();
}

// ============================================================
// CARREGAMENTO INICIAL DOS DADOS
// ============================================================

// Cache local dos dados (para não bater no Firestore a cada render)
const DB = {
  lancamentos:       [],
  'contas a pagar':  [],
  'contas a receber':[],
  planoContas:       [],
  fluxoCaixa:        [],
  empresas:          [],
};

const pageState = {
  lancamentos: { last: null, loading: false, done: false },
  'contas a pagar': { last: null, loading: false, done: false },
  'contas a receber': { last: null, loading: false, done: false },
};

async function carregarTudo() {
  // Carrega cada coleção individualmente — se uma falhar, usa demo só para ela
  const colecoes = [
    { nome: 'lancamentos',       buildQ: q => query(q, orderBy('data', 'desc'), limit(50)),       demoKey: 'lancamentos' },
    { nome: 'contas a pagar',    buildQ: q => query(q, orderBy('vencimento', 'asc'), limit(50)),  demoKey: 'contas a pagar' },
    { nome: 'contas a receber',  buildQ: q => query(q, orderBy('vencimento', 'asc'), limit(50)),  demoKey: 'contas a receber' },
    { nome: 'planoContas',       buildQ: q => q,                                        demoKey: 'planoContas' },
    { nome: 'fluxoCaixa',        buildQ: q => query(q, orderBy('data', 'asc')),         demoKey: 'fluxoCaixa' },
    { nome: 'empresas',          buildQ: q => q,                                        demoKey: 'empresas' },
  ];

  // Carrega dados demo como base de fallback
  const demoBase = {};
  (function gerarDemo() {
    const tmpDB = {};
    const origDB = Object.assign({}, DB);
    // salva temporariamente
    Object.assign(tmpDB, {
      lancamentos: origDB.lancamentos,
      'contas a pagar': origDB['contas a pagar'],
      'contas a receber': origDB['contas a receber'],
      planoContas: origDB.planoContas,
      fluxoCaixa: origDB.fluxoCaixa,
      empresas: origDB.empresas,
    });
    carregarDadosDemo();
    Object.assign(demoBase, {
      lancamentos: DB.lancamentos,
      'contas a pagar': DB['contas a pagar'],
      'contas a receber': DB['contas a receber'],
      planoContas: DB.planoContas,
      fluxoCaixa: DB.fluxoCaixa,
      empresas: DB.empresas,
    });
    // Restaura o que estava
    Object.assign(DB, tmpDB);
  })();

  let algumFirestore = false;

  await Promise.all(colecoes.map(async ({ nome, buildQ }) => {
    try {
      const ref  = colRef(nome);
      const snap = await getDocs(buildQ(ref));
      if (pageState[nome]) {
        pageState[nome].last = snap.docs.at(-1) || null;
        pageState[nome].done = snap.docs.length < 50;
      }
      if (snap.docs.length > 0) {
        DB[nome] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        algumFirestore = true;
      } else {
        // Coleção existe mas está vazia — tenta sem ordenação
        const snapSemOrdem = await getDocs(query(ref, limit(50)));
        if (snapSemOrdem.docs.length > 0) {
          DB[nome] = snapSemOrdem.docs.map(d => ({ id: d.id, ...d.data() }));
          algumFirestore = true;
        } else {
          DB[nome] = demoBase[nome] || [];
        }
      }
    } catch (err) {
      console.warn(`Erro ao carregar coleção "${nome}", tentando sem orderBy:`, err.message);
      // Tenta sem orderBy (pode faltar índice)
      try {
        const ref  = colRef(nome);
        const snap = await getDocs(query(ref, limit(50)));
        if (snap.docs.length > 0) {
          DB[nome] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
          algumFirestore = true;
        } else {
          DB[nome] = demoBase[nome] || [];
        }
      } catch (err2) {
        console.warn(`Falha total na coleção "${nome}", usando demo.`, err2.message);
        DB[nome] = demoBase[nome] || [];
      }
    }
  }));

  if (!algumFirestore) {
    console.info('Nenhuma coleção encontrada no Firestore — usando dados de demonstração.');
  }

  populateContaSelects();
  renderLancamentos();
  renderContasPagar();
  renderContasReceber();
  renderPlanoContas();
  renderBalancete();
  renderFluxoCaixa();
  renderDRE();
  renderBalanco();
  renderRelatorios();
  renderEmpresas();
  renderDashboard();
}

async function loadMore(nome) {
  const state = pageState[nome];
  if (!state || state.loading || state.done || !state.last) return;
  state.loading = true;
  try {
    const orderField = nome === 'lancamentos' ? 'data' : 'vencimento';
    const direction = nome === 'lancamentos' ? 'desc' : 'asc';
    const snap = await getDocs(query(colRef(nome), orderBy(orderField, direction), startAfter(state.last), limit(50)));
    state.last = snap.docs.at(-1) || state.last;
    state.done = snap.docs.length < 50;
    DB[nome].push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    if (nome === 'lancamentos') renderLancamentos();
    if (nome === 'contas a pagar') renderContasPagar();
    if (nome === 'contas a receber') renderContasReceber();
  } catch (err) {
    toast('Não foi possível carregar mais registros.', 'error');
  } finally {
    state.loading = false;
  }
}

async function carregarColecao(nome, buildQuery) {
  const ref  = colRef(nome);
  const snap = await getDocs(buildQuery(ref));
  DB[nome] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Dados de demonstração usados quando o Firestore ainda está vazio
function carregarDadosDemo() {
  DB.lancamentos = [
    { id: 'l1', data: '2025-03-01', historico: 'Venda de mercadorias — NF-e 1001', debito: '1.1.1 — Caixa', credito: '4.1 — Receita Bruta de Vendas', valor: 28500.00, tipo: 'Crédito', documento: 'NF-1001' },
    { id: 'l2', data: '2025-03-03', historico: 'Pagamento de aluguel — março/2025', debito: '6.2 — Despesas Administrativas', credito: '1.1.1 — Caixa', valor: 4200.00, tipo: 'Débito', documento: 'REC-0312' },
    { id: 'l3', data: '2025-03-05', historico: 'Folha de pagamento — fevereiro/2025', debito: '6.1 — Despesas com Pessoal', credito: '1.1.2 — Banco Bradesco CC', valor: 18340.00, tipo: 'Débito', documento: 'FP-02-2025' },
    { id: 'l4', data: '2025-03-07', historico: 'Prestação de serviços — NF-e 2231', debito: '1.1.2 — Banco Bradesco CC', credito: '4.2 — Receita de Serviços', valor: 12000.00, tipo: 'Crédito', documento: 'NF-2231' },
    { id: 'l5', data: '2025-03-10', historico: 'Recolhimento INSS patronal — DARF', debito: '6.3 — Despesas Tributárias', credito: '1.1.2 — Banco Bradesco CC', valor: 3240.00, tipo: 'Débito', documento: 'DARF-0315' },
    { id: 'l6', data: '2025-03-12', historico: 'Venda de mercadorias — NF-e 1002', debito: '1.1.2 — Banco Bradesco CC', credito: '4.1 — Receita Bruta de Vendas', valor: 41200.00, tipo: 'Crédito', documento: 'NF-1002' },
    { id: 'l7', data: '2025-03-14', historico: 'Compra de material de escritório', debito: '6.2 — Despesas Administrativas', credito: '1.1.1 — Caixa', valor: 870.00, tipo: 'Débito', documento: 'CP-214' },
    { id: 'l8', data: '2025-03-15', historico: 'Energia elétrica — CELESC março', debito: '6.2 — Despesas Administrativas', credito: '1.1.2 — Banco Bradesco CC', valor: 1280.00, tipo: 'Débito', documento: 'CELESC-03' },
    { id: 'l9', data: '2025-03-18', historico: 'Prestação de serviços — NF-e 2232', debito: '1.1.2 — Banco Bradesco CC', credito: '4.2 — Receita de Serviços', valor: 9400.00, tipo: 'Crédito', documento: 'NF-2232' },
    { id: 'l10', data: '2025-03-19', historico: 'Venda de mercadorias — NF-e 1003', debito: '1.1.3 — Clientes a Receber', credito: '4.1 — Receita Bruta de Vendas', valor: 57220.00, tipo: 'Crédito', documento: 'NF-1003' },
  ];

  DB['contas a pagar'] = [
    { id: 'cp1', fornecedor: 'Distribuidora ABC Ltda', descricao: 'Compra de mercadorias — NF 4521', emissao: '2025-03-01', vencimento: '2025-03-20', valor: 15800.00, categoria: 'Fornecedores', forma: 'Boleto Bancário', status: 'Em Aberto' },
    { id: 'cp2', fornecedor: 'CELESC', descricao: 'Energia elétrica — março/2025', emissao: '2025-03-05', vencimento: '2025-03-22', valor: 1280.00, categoria: 'Serviços Essenciais', forma: 'Débito Automático', status: 'Em Aberto' },
    { id: 'cp3', fornecedor: 'Imobiliária Cia RS', descricao: 'Aluguel — março/2025', emissao: '2025-03-01', vencimento: '2025-03-10', valor: 4200.00, categoria: 'Aluguel', forma: 'Transferência Bancária', status: 'Paga' },
    { id: 'cp4', fornecedor: 'Receita Federal do Brasil', descricao: 'IRPJ — 1.º trimestre 2025', emissao: '2025-03-08', vencimento: '2025-03-31', valor: 8450.00, categoria: 'Tributos Federais', forma: 'DARF', status: 'Em Aberto' },
    { id: 'cp5', fornecedor: 'Claro Empresas', descricao: 'Telefone e internet — março/2025', emissao: '2025-03-03', vencimento: '2025-03-18', valor: 620.00, categoria: 'Telecomunicações', forma: 'Boleto Bancário', status: 'Vencida' },
    { id: 'cp6', fornecedor: 'Limpeza Express ME', descricao: 'Serviços de limpeza — março/2025', emissao: '2025-03-10', vencimento: '2025-03-25', valor: 980.00, categoria: 'Serviços Terceirizados', forma: 'PIX', status: 'Em Aberto' },
    { id: 'cp7', fornecedor: 'SEFAZ-RS', descricao: 'ICMS — competência fevereiro/2025', emissao: '2025-03-01', vencimento: '2025-03-28', valor: 6240.00, categoria: 'Tributos Estaduais', forma: 'DARE', status: 'Em Aberto' },
  ];

  DB['contas a receber'] = [
    { id: 'cr1', cliente: 'Tech Solutions Ltda', descricao: 'Consultoria em TI — fevereiro/2025', emissao: '2025-02-28', vencimento: '2025-03-15', valor: 12000.00, categoria: 'Serviços', forma: 'Transferência', status: 'Em Aberto' },
    { id: 'cr2', cliente: 'Comércio Central SA', descricao: 'Venda de mercadorias — NF 1001', emissao: '2025-03-01', vencimento: '2025-03-20', valor: 8500.00, categoria: 'Vendas', forma: 'Boleto Bancário', status: 'Em Aberto' },
    { id: 'cr3', cliente: 'Hospital Regional Sul', descricao: 'Fornecimento de equipamentos', emissao: '2025-03-05', vencimento: '2025-03-12', valor: 4100.00, categoria: 'Vendas', forma: 'Transferência', status: 'Vencida' },
    { id: 'cr4', cliente: 'Prefeitura de Porto Alegre', descricao: 'Serviços de consultoria — contrato 48', emissao: '2025-02-15', vencimento: '2025-03-01', valor: 28000.00, categoria: 'Serviços', forma: 'Ordem Bancária', status: 'Recebida' },
    { id: 'cr5', cliente: 'Metalúrgica RS Indústria', descricao: 'Prestação de serviços — NF 2231', emissao: '2025-03-08', vencimento: '2025-03-28', valor: 6600.00, categoria: 'Serviços', forma: 'PIX', status: 'Em Aberto' },
  ];

  DB.planoContas = [
    { cod: '1',     nome: 'ATIVO',                        tipo: 'S', nat: 'D', nivel: 0, saldo: null },
    { cod: '1.1',   nome: 'Ativo Circulante',              tipo: 'S', nat: 'D', nivel: 1, saldo: 284200 },
    { cod: '1.1.1', nome: 'Caixa',                         tipo: 'A', nat: 'D', nivel: 2, saldo: 18400 },
    { cod: '1.1.2', nome: 'Banco Bradesco — CC 12345-6',   tipo: 'A', nat: 'D', nivel: 2, saldo: 64380 },
    { cod: '1.1.3', nome: 'Clientes a Receber',            tipo: 'A', nat: 'D', nivel: 2, saldo: 31200 },
    { cod: '1.1.4', nome: 'Estoques de Mercadorias',       tipo: 'A', nat: 'D', nivel: 2, saldo: 142600 },
    { cod: '1.1.5', nome: 'Impostos a Recuperar',          tipo: 'A', nat: 'D', nivel: 2, saldo: 8420 },
    { cod: '1.1.6', nome: 'Despesas Antecipadas',          tipo: 'A', nat: 'D', nivel: 2, saldo: 4800 },
    { cod: '1.2',   nome: 'Ativo Não Circulante',          tipo: 'S', nat: 'D', nivel: 1, saldo: 200000 },
    { cod: '1.2.1', nome: 'Imobilizado Bruto',             tipo: 'A', nat: 'D', nivel: 2, saldo: 210000 },
    { cod: '1.2.2', nome: '(-) Depreciação Acumulada',     tipo: 'A', nat: 'C', nivel: 2, saldo: 30000 },
    { cod: '1.2.3', nome: 'Intangível',                    tipo: 'A', nat: 'D', nivel: 2, saldo: 20000 },
    { cod: '2',     nome: 'PASSIVO',                       tipo: 'S', nat: 'C', nivel: 0, saldo: null },
    { cod: '2.1',   nome: 'Passivo Circulante',            tipo: 'S', nat: 'C', nivel: 1, saldo: 82300 },
    { cod: '2.1.1', nome: 'Fornecedores',                  tipo: 'A', nat: 'C', nivel: 2, saldo: 47320 },
    { cod: '2.1.2', nome: 'Obrigações Sociais a Recolher', tipo: 'A', nat: 'C', nivel: 2, saldo: 21480 },
    { cod: '2.1.3', nome: 'Tributos a Recolher',           tipo: 'A', nat: 'C', nivel: 2, saldo: 13500 },
    { cod: '2.2',   nome: 'Passivo Não Circulante',        tipo: 'S', nat: 'C', nivel: 1, saldo: 120000 },
    { cod: '2.2.1', nome: 'Empréstimos e Financiamentos',  tipo: 'A', nat: 'C', nivel: 2, saldo: 120000 },
    { cod: '3',     nome: 'PATRIMÔNIO LÍQUIDO',            tipo: 'S', nat: 'C', nivel: 0, saldo: null },
    { cod: '3.1',   nome: 'Capital Social Integralizado',  tipo: 'A', nat: 'C', nivel: 1, saldo: 200000 },
    { cod: '3.2',   nome: 'Reserva Legal',                 tipo: 'A', nat: 'C', nivel: 1, saldo: 30000 },
    { cod: '3.3',   nome: 'Lucros Acumulados',             tipo: 'A', nat: 'C', nivel: 1, saldo: 51900 },
    { cod: '4',     nome: 'RECEITAS',                      tipo: 'S', nat: 'C', nivel: 0, saldo: null },
    { cod: '4.1',   nome: 'Receita Bruta de Vendas',       tipo: 'A', nat: 'C', nivel: 1, saldo: 128200 },
    { cod: '4.2',   nome: 'Receita de Serviços',           tipo: 'A', nat: 'C', nivel: 1, saldo: 21400 },
    { cod: '4.3',   nome: 'Outras Receitas Operacionais',  tipo: 'A', nat: 'C', nivel: 1, saldo: 1120 },
    { cod: '5',     nome: 'CUSTOS',                        tipo: 'S', nat: 'D', nivel: 0, saldo: null },
    { cod: '5.1',   nome: 'Custo das Mercadorias Vendidas',tipo: 'A', nat: 'D', nivel: 1, saldo: 62100 },
    { cod: '5.2',   nome: 'Custo dos Serviços Prestados',  tipo: 'A', nat: 'D', nivel: 1, saldo: 8200 },
    { cod: '6',     nome: 'DESPESAS OPERACIONAIS',         tipo: 'S', nat: 'D', nivel: 0, saldo: null },
    { cod: '6.1',   nome: 'Despesas com Pessoal',          tipo: 'A', nat: 'D', nivel: 1, saldo: 21580 },
    { cod: '6.2',   nome: 'Despesas Administrativas',      tipo: 'A', nat: 'D', nivel: 1, saldo: 6870 },
    { cod: '6.3',   nome: 'Despesas Tributárias',          tipo: 'A', nat: 'D', nivel: 1, saldo: 8450 },
    { cod: '6.4',   nome: 'Despesas Financeiras',          tipo: 'A', nat: 'D', nivel: 1, saldo: 1240 },
  ];

  DB.fluxoCaixa = [
    { data: '2025-03-01', descricao: 'Saldo Inicial de Caixa',               tipo: 'Saldo',   entrada: 0,      saida: 0,      saldo: 82400 },
    { data: '2025-03-01', descricao: 'Recebimento — NF-e 1001',              tipo: 'Receita', entrada: 28500,  saida: 0,      saldo: 110900 },
    { data: '2025-03-03', descricao: 'Pagamento aluguel',                    tipo: 'Despesa', entrada: 0,      saida: 4200,   saldo: 106700 },
    { data: '2025-03-05', descricao: 'Folha de pagamento — fevereiro',       tipo: 'Despesa', entrada: 0,      saida: 18340,  saldo: 88360 },
    { data: '2025-03-07', descricao: 'Recebimento serviços — NF-e 2231',     tipo: 'Receita', entrada: 12000,  saida: 0,      saldo: 100360 },
    { data: '2025-03-10', descricao: 'Recolhimento INSS — DARF',             tipo: 'Tributo', entrada: 0,      saida: 3240,   saldo: 97120 },
    { data: '2025-03-12', descricao: 'Recebimento — NF-e 1002',              tipo: 'Receita', entrada: 41200,  saida: 0,      saldo: 138320 },
    { data: '2025-03-14', descricao: 'Material de escritório',               tipo: 'Despesa', entrada: 0,      saida: 870,    saldo: 137450 },
    { data: '2025-03-15', descricao: 'Energia elétrica CELESC',              tipo: 'Despesa', entrada: 0,      saida: 1280,   saldo: 136170 },
    { data: '2025-03-18', descricao: 'Recebimento serviços — NF-e 2232',     tipo: 'Receita', entrada: 9400,   saida: 0,      saldo: 145570 },
  ];

  DB.empresas = [
    { id: 'e1', razao: 'Tech Solutions Ltda', cnpj: '12.345.678/0001-90', ie: '123/4567890', regime: 'Lucro Presumido', cnae: '6201-5/00', atividade: 'Desenvolvimento de software', email: 'contato@techsolutions.com.br', cor: 'blue' },
    { id: 'e2', razao: 'Comércio Central SA', cnpj: '98.765.432/0001-11', ie: '456/7890123', regime: 'Lucro Real', cnae: '4711-3/01', atividade: 'Comércio varejista de mercadorias', email: 'financeiro@comerciocentral.com.br', cor: 'green' },
    { id: 'e3', razao: 'RS Consultoria ME', cnpj: '45.678.901/0001-23', ie: 'ISENTO', regime: 'Simples Nacional', cnae: '7020-4/00', atividade: 'Consultoria em gestão empresarial', email: 'administrativo@rsconsultoria.com.br', cor: 'amber' },
  ];
}

// ============================================================
// NAVIGATION
// ============================================================

const PAGE_TITLES = {
  'dashboard':       'Dashboard',
  'lancamentos':     'Lançamentos',
  'contas-pagar':    'Contas a Pagar',
  'contas-receber':  'Contas a Receber',
  'plano-contas':    'Plano de Contas',
  'balancete':       'Balancete de Verificação',
  'fluxo-caixa':     'Fluxo de Caixa',
  'dre':             'DRE',
  'balanco':         'Balanço Patrimonial',
  'relatorios':      'Relatórios',
  'empresas':        'Empresas',
  'configuracoes':   'Configurações',
};

function navigate(pageId) {
  qsa('.page').forEach(p => p.classList.remove('active'));
  qsa('.nav-item[data-page]').forEach(n => n.classList.remove('active'));
  const page = qs(`#page-${pageId}`);
  if (page) page.classList.add('active');
  const navItem = qs(`.nav-item[data-page="${pageId}"]`);
  if (navItem) navItem.classList.add('active');
  qs('#page-title').textContent = PAGE_TITLES[pageId] || pageId;
  qs('#page-breadcrumb').textContent = 'AMSI — ' + (PAGE_TITLES[pageId] || pageId);
}

// ============================================================
// MODAL
// ============================================================

function openModal(id)  { qs(`#${id}`)?.classList.add('open'); }
function closeModal(id) {
  const modal = qs(`#${id}`);
  modal?.classList.remove('open');
  const hidden = modal?.querySelector('input[type="hidden"]');
  if (hidden) hidden.value = '';
  const titles = {
    'modal-lancamento': 'Novo Lançamento Contábil',
    'modal-conta-pagar': 'Nova Conta a Pagar',
    'modal-conta-receber': 'Nova Conta a Receber',
    'modal-empresa': 'Cadastrar Empresa',
  };
  if (titles[id]) qs(`#${id} .modal-title`).textContent = titles[id];
}

let pendingDelete = null;
function confirmDelete(label, callback) {
  const text = qs('#confirm-delete-text');
  if (text) text.textContent = `Você está prestes a excluir: ${label}. Esta ação não pode ser desfeita.`;
  pendingDelete = callback;
  openModal('modal-confirm-delete');
}

function executeDelete() {
  const callback = pendingDelete;
  pendingDelete = null;
  closeModal('modal-confirm-delete');
  if (callback) callback();
}

// ============================================================
// TOAST
// ============================================================

function toast(msg, type = 'info') {
  const iconMap = { success: Icon.check, error: Icon.x, info: Icon.bell };
  const safeTypes = ['success', 'error', 'info'];
  const safeType = safeTypes.includes(type) ? type : 'info';
  const el = document.createElement('div');
  el.className = `toast s-${safeType}`;
  // Usa textContent para o texto — nunca innerHTML com dados externos
  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.innerHTML = iconMap[safeType]; // SVG estático, seguro
  const msgSpan = document.createElement('span');
  msgSpan.className = 'toast-msg';
  msgSpan.textContent = msg; // textContent é seguro contra XSS
  el.appendChild(iconSpan);
  el.appendChild(msgSpan);
  qs('#toast-stack').appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ============================================================
// RENDER: DASHBOARD
// ============================================================

function renderDashboard() {
  const feed = qs('#dash-activity');
  if (!feed) return;

  const recent = DB.lancamentos.slice(0, 6);
  feed.innerHTML = recent.map(l => {
    const isCredito = l.tipo === 'Crédito';
    return `
    <div class="activity-item">
      <div class="activity-dot ${isCredito ? 'credit' : 'debit'}">${isCredito ? Icon.credit : Icon.debit}</div>
      <div class="activity-body">
        <div class="activity-desc">${esc(l.historico)}</div>
        <div class="activity-meta">${esc(fmtDate(l.data))} · ${esc(l.tipo)} · ${esc(l.documento)}</div>
      </div>
      <div class="activity-amount ${isCredito ? 'pos' : 'neg'}">${isCredito ? '+' : '−'}${fmt(l.valor)}</div>
    </div>`;
  }).join('');

  const venc = qs('#dash-vencimentos');
  if (venc) {
    const abertos = DB['contas a pagar'].filter(c => c.status !== 'Paga').slice(0, 5);
    venc.innerHTML = abertos.map(c => `
      <div class="activity-item" style="cursor:default">
        <div class="activity-dot info">${Icon.clock}</div>
        <div class="activity-body">
          <div class="activity-desc" style="font-size:12.5px;font-weight:600">${esc(c.fornecedor || c.cliente || '—')}</div>
          <div class="activity-meta">${esc(c.descricao || c['descriçao'] || '—')} — vence ${esc(fmtDate(c.vencimento))}</div>
        </div>
        <div style="text-align:right">
          <div class="activity-amount neg">${fmt(c.valor)}</div>
          <span class="badge ${c.status === 'Vencida' ? 'badge-amber' : 'badge-blue'}" style="margin-top:2px">${esc(c.status)}</span>
        </div>
      </div>`).join('');
  }

  renderBarChart();
  renderDonut();
}

// ============================================================
// BAR CHART
// ============================================================

function renderBarChart() {
  const wrap = qs('#bar-chart');
  if (!wrap) return;
  const meses = [];
  const agora = new Date();
  for (let i = 5; i >= 0; i--) {
    const data = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const chave = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`;
    const label = data.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    meses.push({ chave, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  const totais = meses.map(({ chave }) => DB.lancamentos.reduce((soma, lanc) => {
    if (!lanc.data?.startsWith(chave)) return soma;
    const campo = lanc.tipo === 'Crédito' ? 'receita' : 'despesa';
    soma[campo] += Number(lanc.valor || 0);
    return soma;
  }, { receita: 0, despesa: 0 }));
  const receitas = totais.map(t => t.receita);
  const despesas = totais.map(t => t.despesa);
  const maxVal   = Math.max(...receitas, ...despesas);

  wrap.innerHTML = meses.map((mes, i) => {
    const hR = maxVal ? Math.round((receitas[i] / maxVal) * 100) : 0;
    const hD = maxVal ? Math.round((despesas[i] / maxVal) * 100) : 0;
    return `
    <div class="bar-col">
      <div class="bar-pair">
        <div class="bar c-blue" style="height:${hR}%" title="Receita ${mes.label}: ${fmt(receitas[i])}"></div>
        <div class="bar c-red"  style="height:${hD}%" title="Despesa ${mes.label}: ${fmt(despesas[i])}"></div>
      </div>
      <span class="bar-lbl">${mes.label}</span>
    </div>`;
  }).join('');
}

// ============================================================
// DONUT (Canvas) – corrigido: sem cor hardcoded
// ============================================================

function renderDonut() {
  const canvas = qs('#donut-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const data = [
    { label: 'Pessoal',        val: 21580, color: '#4361ee' },
    { label: 'Fornecedores',   val: 47320, color: '#12b76a' },
    { label: 'Tributos',       val: 8450,  color: '#f79009' },
    { label: 'Financeiro',     val: 1240,  color: '#f04438' },
    { label: 'Administrativo', val: 6870,  color: '#7c3aed' },
    { label: 'Outros',         val: 8280,  color: '#0ba5ec' },
  ];
  const total = data.reduce((a, b) => a + b.val, 0);
  const cx = 65, cy = 65, r = 58, inner = 36;
  ctx.clearRect(0, 0, 130, 130);
  let angle = -Math.PI / 2;
  data.forEach(d => {
    const slice = (d.val / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.closePath();
    ctx.fillStyle = d.color;
    ctx.fill();
    angle += slice;
  });
  // Buraco do donut – usa a cor de fundo via CSS var
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  const style = getComputedStyle(document.documentElement);
  ctx.fillStyle = style.getPropertyValue('--bg-elevated').trim() || '#101422';
  ctx.fill();

  const legend = qs('#donut-legend');
  if (legend) {
    legend.innerHTML = data.map(d => `
      <div class="legend-row">
        <div class="legend-dot" style="background:${d.color}"></div>
        <span class="legend-name">${d.label}</span>
        <span class="legend-pct">${Math.round(d.val / total * 100)}%</span>
      </div>`).join('');
  }
}

// ============================================================
// RENDER: LANÇAMENTOS
// ============================================================

function renderLancamentos() {
  const tipoFilter = qs('#filter-tipo')?.value || '';
  const dataInicio = qs('#data-inicio')?.value || '';
  const dataFim = qs('#data-fim')?.value || '';
  const list = DB.lancamentos.filter(l => {
    return (!tipoFilter || l.tipo === tipoFilter) &&
      (!dataInicio || l.data >= dataInicio) && (!dataFim || l.data <= dataFim);
  });
  const tbody = qs('#tb-lancamentos');
  if (!tbody) return;

  tbody.innerHTML = list.map(l => {
    const safeId = sanitizeId(l.id);
    return `
    <tr>
      <td>${esc(fmtDate(l.data))}</td>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(l.historico)}</td>
      <td style="color:var(--text-secondary);font-size:12px">${esc(l.debito)}</td>
      <td style="color:var(--text-secondary);font-size:12px">${esc(l.credito)}</td>
      <td class="mono">${fmt(l.valor)}</td>
      <td><span class="badge ${l.tipo === 'Crédito' ? 'badge-green' : 'badge-red'}">${esc(l.tipo)}</span></td>
      <td style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:12px">${esc(l.documento)}</td>
      <td>
        <button class="btn btn-secondary btn-xs" data-id="${safeId}" data-action="edit-lanc">Editar</button>
        <button class="btn btn-danger btn-xs btn-icon" data-id="${safeId}" data-action="delete-lanc" title="Excluir">${Icon.trash}</button>
      </td>
    </tr>`;
  }).join('');

  const debitos  = list.filter(l => l.tipo === 'Débito').reduce((a, b) => a + b.valor, 0);
  const creditos = list.filter(l => l.tipo === 'Crédito').reduce((a, b) => a + b.valor, 0);
  const saldo    = creditos - debitos;

  const s = v => { const el = qs(v); return el; };
  const kD = s('#kpi-debitos'),   kC = s('#kpi-creditos'),
        kS = s('#kpi-saldo'),     kN = s('#kpi-count'),
        badge = s('#badge-lanc');

  if (kD) kD.textContent = fmt(debitos);
  if (kC) kC.textContent = fmt(creditos);
  if (kS) { kS.textContent = fmt(Math.abs(saldo)); kS.style.color = saldo >= 0 ? 'var(--success)' : 'var(--danger)'; }
  if (kN) kN.textContent = list.length;
  // FIX: badge de lançamentos dinâmico
  if (badge) badge.textContent = DB.lancamentos.length;

  // Delegação de eventos — evita onclick inline com dados externos
  if (tbody) {
    tbody.onclick = e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (btn.dataset.action === 'edit-lanc' && id) editLancamento(id);
      if (btn.dataset.action === 'delete-lanc' && id) deleteLancamento(id);
    };
  }
}

async function deleteLancamento(id) {
  const lanc = DB.lancamentos.find(l => l.id === id);
  if (!lanc) return;
  confirmDelete(lanc.historico || 'lançamento', async () => {
    DB.lancamentos = DB.lancamentos.filter(l => l.id !== id);
    try { await deleteDoc(docRef('lancamentos', id)); } catch {}
    renderLancamentos(); renderDashboard();
    toast('Lançamento removido.', 'info');
  });
}

function editLancamento(id) {
  const lanc = DB.lancamentos.find(l => l.id === id);
  if (!lanc) return;
  qs('#lanc-id').value = id;
  qs('#lanc-data').value = lanc.data || '';
  qs('#lanc-tipo').value = lanc.tipo || 'Débito';
  qs('#lanc-debito').value = lanc.debito || '';
  qs('#lanc-credito').value = lanc.credito || '';
  qs('#lanc-historico').value = lanc.historico || '';
  qs('#lanc-valor').value = lanc.valor || '';
  qs('#lanc-documento').value = lanc.documento === '—' ? '' : (lanc.documento || '');
  qs('#modal-lancamento .modal-title').textContent = 'Editar Lançamento Contábil';
  openModal('modal-lancamento');
}

async function saveLancamento() {
  const data      = qs('#lanc-data')?.value;
  const historico = sanitizeText(qs('#lanc-historico')?.value, 300);
  const valorRaw  = qs('#lanc-valor')?.value;
  const tipo      = qs('#lanc-tipo')?.value;
  const debito    = qs('#lanc-debito')?.value;
  const credito   = qs('#lanc-credito')?.value;
  const documento = sanitizeText(qs('#lanc-documento')?.value, 50);

  if (!data || !historico || !valorRaw || !debito || !credito) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  if (!isValidDate(data)) { toast('Data inválida.', 'error'); return; }

  const valor = sanitizeNumber(valorRaw, 0.01);
  if (valor === null) { toast('Valor inválido.', 'error'); return; }

  // Valida que débito e crédito são contas do plano (não entrada livre)
  const contasValidas = DB.planoContas.filter(c => c.tipo === 'A').map(c => `${c.cod} — ${c.nome}`);
  if (!contasValidas.includes(debito) || !contasValidas.includes(credito)) {
    toast('Conta contábil inválida.', 'error'); return;
  }

  const tiposValidos = ['Crédito', 'Débito'];
  const tipoSafe = tiposValidos.includes(tipo) ? tipo : 'Débito';

  const editId = sanitizeId(qs('#lanc-id')?.value);
  const novoLanc = { data, historico, debito, credito, valor, tipo: tipoSafe, documento: documento || '—', atualizadoEm: serverTimestamp(), criadoPor: currentUser.uid };

  try {
    if (editId) {
      await updateDoc(docRef('lancamentos', editId), novoLanc);
      const index = DB.lancamentos.findIndex(l => l.id === editId);
      if (index >= 0) DB.lancamentos[index] = { ...DB.lancamentos[index], ...novoLanc };
    } else {
      const docSnap = await addDoc(colRef('lancamentos'), novoLanc);
      DB.lancamentos.unshift({ id: docSnap.id, ...novoLanc });
    }
  } catch {
    if (!editId) DB.lancamentos.unshift({ id: 'demo_' + Date.now(), ...novoLanc });
  }

  renderLancamentos();
  renderDashboard();
  closeModal('modal-lancamento');
  toast(editId ? 'Lançamento atualizado com sucesso.' : 'Lançamento registrado com sucesso.', 'success');
  ['lanc-id', 'lanc-historico', 'lanc-valor', 'lanc-documento'].forEach(id => {
    const el = qs(`#${id}`); if (el) el.value = '';
  });
}

function populateContaSelects() {
  const analiticas = DB.planoContas.filter(c => c.tipo === 'A');
  const opts = '<option value="">Selecione a conta...</option>' +
    analiticas.map(c => `<option>${c.cod} — ${c.nome}</option>`).join('');
  ['#lanc-debito', '#lanc-credito'].forEach(sel => {
    const el = qs(sel); if (el) el.innerHTML = opts;
  });
}

// ============================================================
// RENDER: CONTAS A PAGAR
// ============================================================

function renderContasPagar() {
  const tbody = qs('#tb-contas-pagar');
  if (!tbody) return;

  const sBadge = { 'Em Aberto': 'badge-blue', 'Paga': 'badge-green', 'Vencida': 'badge-amber' };
  tbody.innerHTML = DB['contas a pagar'].map(c => {
    const safeId   = sanitizeId(c.id);
    const nomeForn = c.fornecedor || c.cliente || '—';
    const desc     = c.descricao  || c['descriçao'] || c['descricao'] || '—';
    const emissao  = c.emissao    || c.criasoEM     || c.criadoEm    || '';
    const venc     = c.vencimento || '—';
    const valor    = Number(c.valor) || 0;
    const forma    = c.forma      || '—';
    const status   = c.status     || 'Em Aberto';
    const statusSafe = ['Em Aberto', 'Paga', 'Vencida'].includes(status) ? status : 'Em Aberto';
    return `<tr>
    <td style="font-weight:600">${esc(nomeForn)}</td>
    <td style="color:var(--text-secondary);font-size:12.5px">${esc(desc)}</td>
    <td>${esc(fmtDate(typeof emissao === 'string' ? emissao : ''))}</td>
    <td>${esc(fmtDate(venc))}</td>
    <td class="mono">${fmt(valor)}</td>
    <td style="color:var(--text-secondary);font-size:12px">${esc(forma)}</td>
    <td><span class="badge ${sBadge[statusSafe] || 'badge-neutral'}">${esc(statusSafe)}</span></td>
    <td style="display:flex;gap:5px">
      ${statusSafe === 'Em Aberto' ? `<button class="btn btn-success btn-xs" data-id="${safeId}" data-action="pagar-conta">Pagar</button>` : ''}
      <button class="btn btn-secondary btn-xs" data-id="${safeId}" data-action="edit-cp">Editar</button>
      <button class="btn btn-danger btn-xs btn-icon" data-id="${safeId}" data-action="delete-cp">${Icon.trash}</button>
    </td>
  </tr>`;
  }).join('');

  // KPIs contas a pagar
  const aberto  = DB['contas a pagar'].filter(c => c.status === 'Em Aberto').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const vencida = DB['contas a pagar'].filter(c => c.status === 'Vencida').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const paga    = DB['contas a pagar'].filter(c => c.status === 'Paga').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const total   = DB['contas a pagar'].reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const s = id => qs(id);
  if (s('#kpi-cp-aberto')) s('#kpi-cp-aberto').textContent = fmt(aberto);
  if (s('#kpi-cp-vencida')) s('#kpi-cp-vencida').textContent = fmt(vencida);
  if (s('#kpi-cp-paga'))   s('#kpi-cp-paga').textContent   = fmt(paga);
  if (s('#kpi-cp-total'))  s('#kpi-cp-total').textContent  = fmt(total);

  if (tbody) {
    tbody.onclick = e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.action === 'edit-cp')       editContaPagar(id);
      if (btn.dataset.action === 'pagar-conta')  pagarConta(id);
      if (btn.dataset.action === 'delete-cp')    deleteContaPagar(id);
    };
  }
}

async function pagarConta(id) {
  const c = DB['contas a pagar'].find(x => x.id === id);
  if (!c) return;
  c.status = 'Paga';
  try { await updateDoc(docRef('contas a pagar', id), { status: 'Paga' }); } catch {}
  renderContasPagar();
  renderDashboard();
  toast(`Conta paga: ${fmt(c.valor)}`, 'success');
}

async function deleteContaPagar(id) {
  const conta = DB['contas a pagar'].find(x => x.id === id);
  if (!conta) return;
  confirmDelete(conta.fornecedor || conta.descricao || 'conta a pagar', async () => {
    DB['contas a pagar'] = DB['contas a pagar'].filter(x => x.id !== id);
    try { await deleteDoc(docRef('contas a pagar', id)); } catch {}
    renderContasPagar(); renderDashboard(); toast('Registro removido.', 'info');
  });
}

function editContaPagar(id) {
  const c = DB['contas a pagar'].find(x => x.id === id);
  if (!c) return;
  qs('#cp-id').value = id;
  qs('#cp-fornecedor').value = c.fornecedor || '';
  qs('#cp-descricao').value = c.descricao || c['descriçao'] || '';
  qs('#cp-emissao').value = c.emissao || '';
  qs('#cp-vencimento').value = c.vencimento || '';
  qs('#cp-valor').value = c.valor || '';
  qs('#cp-categoria').value = c.categoria || 'Outros';
  qs('#cp-forma').value = c.forma || 'PIX';
  qs('#modal-conta-pagar .modal-title').textContent = 'Editar Conta a Pagar';
  openModal('modal-conta-pagar');
}

async function saveContaPagar() {
  const fornecedor = sanitizeText(qs('#cp-fornecedor')?.value, 200);
  const descricao  = sanitizeText(qs('#cp-descricao')?.value, 300);
  const emissao    = qs('#cp-emissao')?.value;
  const vencimento = qs('#cp-vencimento')?.value;
  const valorRaw   = qs('#cp-valor')?.value;
  const categoria  = sanitizeText(qs('#cp-categoria')?.value, 100);
  const forma      = sanitizeText(qs('#cp-forma')?.value, 100);

  if (!fornecedor || !descricao || !vencimento || !valorRaw) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  if (!isValidDate(vencimento)) { toast('Data de vencimento inválida.', 'error'); return; }
  if (emissao && !isValidDate(emissao)) { toast('Data de emissão inválida.', 'error'); return; }

  const valor = sanitizeNumber(valorRaw, 0.01);
  if (valor === null) { toast('Valor inválido.', 'error'); return; }

  const editId = sanitizeId(qs('#cp-id')?.value);
  const existente = editId && DB['contas a pagar'].find(c => c.id === editId);
  const nova = { fornecedor, descricao, emissao: emissao || '', vencimento, valor, categoria, forma, status: existente?.status || 'Em Aberto', atualizadoEm: serverTimestamp() };
  try {
    if (editId) {
      await updateDoc(docRef('contas a pagar', editId), nova);
      const index = DB['contas a pagar'].findIndex(c => c.id === editId);
      if (index >= 0) DB['contas a pagar'][index] = { ...DB['contas a pagar'][index], ...nova };
    } else {
      const snap = await addDoc(colRef('contas a pagar'), nova);
      DB['contas a pagar'].unshift({ id: snap.id, ...nova });
    }
  } catch {
    if (!editId) DB['contas a pagar'].unshift({ id: 'demo_' + Date.now(), ...nova });
  }

  renderContasPagar();
  renderDashboard();
  closeModal('modal-conta-pagar');
  toast(editId ? 'Conta a pagar atualizada.' : 'Conta a pagar registrada.', 'success');
  ['cp-id', 'cp-fornecedor', 'cp-descricao', 'cp-vencimento', 'cp-valor'].forEach(id => {
    const el = qs(`#${id}`); if (el) el.value = '';
  });
}

// ============================================================
// RENDER: CONTAS A RECEBER
// ============================================================

function renderContasReceber() {
  const tbody = qs('#tb-contas-receber');
  if (!tbody) return;

  const sBadge = { 'Em Aberto': 'badge-blue', 'Recebida': 'badge-green', 'Vencida': 'badge-amber' };
  tbody.innerHTML = DB['contas a receber'].map(c => {
    const safeId   = sanitizeId(c.id);
    const cliente  = c.cliente   || c.fornecedor || '—';
    const desc     = c.descricao || c['descriçao'] || '—';
    const emissao  = c.emissao   || c.criasoEM   || c.criadoEm || '';
    const venc     = c.vencimento || '—';
    const valor    = Number(c.valor) || 0;
    const forma    = c.forma     || '—';
    const status   = c.status    || 'Em Aberto';
    const statusSafe = ['Em Aberto', 'Recebida', 'Vencida'].includes(status) ? status : 'Em Aberto';
    return `<tr>
    <td style="font-weight:600">${esc(cliente)}</td>
    <td style="color:var(--text-secondary);font-size:12.5px">${esc(desc)}</td>
    <td>${esc(fmtDate(typeof emissao === 'string' ? emissao : ''))}</td>
    <td>${esc(fmtDate(venc))}</td>
    <td class="mono">${fmt(valor)}</td>
    <td style="color:var(--text-secondary);font-size:12px">${esc(forma)}</td>
    <td><span class="badge ${sBadge[statusSafe] || 'badge-neutral'}">${esc(statusSafe)}</span></td>
    <td style="display:flex;gap:5px">
      ${statusSafe !== 'Recebida' ? `<button class="btn btn-success btn-xs" data-id="${safeId}" data-action="receber-conta">Receber</button>` : ''}
      <button class="btn btn-secondary btn-xs" data-id="${safeId}" data-action="edit-cr">Editar</button>
      <button class="btn btn-danger btn-xs btn-icon" data-id="${safeId}" data-action="delete-cr">${Icon.trash}</button>
    </td>
  </tr>`;
  }).join('');

  const aberto   = DB['contas a receber'].filter(c => c.status === 'Em Aberto').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const vencida  = DB['contas a receber'].filter(c => c.status === 'Vencida').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const recebida = DB['contas a receber'].filter(c => c.status === 'Recebida').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const total    = DB['contas a receber'].reduce((a, b) => a + (Number(b.valor) || 0), 0);
  const s = id => qs(id);
  if (s('#kpi-cr-aberto'))   s('#kpi-cr-aberto').textContent   = fmt(aberto);
  if (s('#kpi-cr-vencida'))  s('#kpi-cr-vencida').textContent  = fmt(vencida);
  if (s('#kpi-cr-recebida')) s('#kpi-cr-recebida').textContent = fmt(recebida);
  if (s('#kpi-cr-total'))    s('#kpi-cr-total').textContent    = fmt(total);

  if (tbody) {
    tbody.onclick = e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!id) return;
      if (btn.dataset.action === 'edit-cr')       editContaReceber(id);
      if (btn.dataset.action === 'receber-conta') receberConta(id);
      if (btn.dataset.action === 'delete-cr')     deleteContaReceber(id);
    };
  }
}

async function receberConta(id) {
  const c = DB['contas a receber'].find(x => x.id === id);
  if (!c) return;
  c.status = 'Recebida';
  try { await updateDoc(docRef('contas a receber', id), { status: 'Recebida' }); } catch {}
  renderContasReceber();
  toast(`Recebimento registrado: ${fmt(c.valor)}`, 'success');
}

async function deleteContaReceber(id) {
  const conta = DB['contas a receber'].find(x => x.id === id);
  if (!conta) return;
  confirmDelete(conta.cliente || conta.descricao || 'conta a receber', async () => {
    DB['contas a receber'] = DB['contas a receber'].filter(x => x.id !== id);
    try { await deleteDoc(docRef('contas a receber', id)); } catch {}
    renderContasReceber(); toast('Registro removido.', 'info');
  });
}

function editContaReceber(id) {
  const c = DB['contas a receber'].find(x => x.id === id);
  if (!c) return;
  qs('#cr-id').value = id;
  qs('#cr-cliente').value = c.cliente || '';
  qs('#cr-descricao').value = c.descricao || c['descriçao'] || '';
  qs('#cr-emissao').value = c.emissao || '';
  qs('#cr-vencimento').value = c.vencimento || '';
  qs('#cr-valor').value = c.valor || '';
  qs('#cr-categoria').value = c.categoria || 'Outros';
  qs('#cr-forma').value = c.forma || 'PIX';
  qs('#modal-conta-receber .modal-title').textContent = 'Editar Conta a Receber';
  openModal('modal-conta-receber');
}

async function saveContaReceber() {
  const cliente    = sanitizeText(qs('#cr-cliente')?.value, 200);
  const descricao  = sanitizeText(qs('#cr-descricao')?.value, 300);
  const emissao    = qs('#cr-emissao')?.value;
  const vencimento = qs('#cr-vencimento')?.value;
  const valorRaw   = qs('#cr-valor')?.value;
  const categoria  = sanitizeText(qs('#cr-categoria')?.value, 100);
  const forma      = sanitizeText(qs('#cr-forma')?.value, 100);

  if (!cliente || !descricao || !vencimento || !valorRaw) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  if (!isValidDate(vencimento)) { toast('Data de vencimento inválida.', 'error'); return; }
  if (emissao && !isValidDate(emissao)) { toast('Data de emissão inválida.', 'error'); return; }

  const valor = sanitizeNumber(valorRaw, 0.01);
  if (valor === null) { toast('Valor inválido.', 'error'); return; }

  const editId = sanitizeId(qs('#cr-id')?.value);
  const existente = editId && DB['contas a receber'].find(c => c.id === editId);
  const nova = { cliente, descricao, emissao: emissao || '', vencimento, valor, categoria, forma, status: existente?.status || 'Em Aberto', atualizadoEm: serverTimestamp() };
  try {
    if (editId) {
      await updateDoc(docRef('contas a receber', editId), nova);
      const index = DB['contas a receber'].findIndex(c => c.id === editId);
      if (index >= 0) DB['contas a receber'][index] = { ...DB['contas a receber'][index], ...nova };
    } else {
      const snap = await addDoc(colRef('contas a receber'), nova);
      DB['contas a receber'].unshift({ id: snap.id, ...nova });
    }
  } catch {
    if (!editId) DB['contas a receber'].unshift({ id: 'demo_' + Date.now(), ...nova });
  }

  renderContasReceber();
  closeModal('modal-conta-receber');
  toast(editId ? 'Conta a receber atualizada.' : 'Conta a receber registrada.', 'success');
  ['cr-id', 'cr-cliente', 'cr-descricao', 'cr-vencimento', 'cr-valor'].forEach(id => {
    const el = qs(`#${id}`); if (el) el.value = '';
  });
}

// ============================================================
// RENDER: PLANO DE CONTAS
// ============================================================

function renderPlanoContas(filter) {
  const wrap = qs('#account-tree');
  if (!wrap) return;
  const list = filter
    ? DB.planoContas.filter(c => c.nome.toLowerCase().includes(filter.toLowerCase()) || c.cod.includes(filter))
    : DB.planoContas;

  wrap.innerHTML = list.map(c => {
    const indent   = `padding-left:${16 + c.nivel * 20}px`;
    const natBadge = c.nat === 'D' ? 'badge-blue' : 'badge-green';
    return `<div class="account-node ${c.nivel === 0 ? 'is-group' : ''}" style="${indent}">
      <span class="account-code">${esc(c.cod)}</span>
      <span class="account-name">${esc(c.nome)}</span>
      <span class="badge ${natBadge}" style="font-size:10px">${c.nat === 'D' ? 'Devedora' : 'Credora'}</span>
      <span class="badge badge-neutral" style="font-size:10px">${c.tipo === 'A' ? 'Analítica' : 'Sintética'}</span>
      <span class="account-balance">${c.saldo !== null && c.saldo !== undefined ? fmt(c.saldo) : ''}</span>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER: BALANCETE
// ============================================================

function renderBalancete() {
  const tbody = qs('#tb-balancete');
  if (!tbody) return;
  const analiticas = DB.planoContas.filter(c => c.tipo === 'A' && c.saldo !== null);
  tbody.innerHTML = analiticas.map(c => {
    const isD = c.nat === 'D';
    const code = c.cod;
    const movements = DB.lancamentos.filter(l => l.debito?.startsWith(code + ' ') || l.credito?.startsWith(code + ' '));
    const mD = movements.filter(l => l.debito?.startsWith(code + ' ')).reduce((sum, l) => sum + Number(l.valor || 0), 0);
    const mC = movements.filter(l => l.credito?.startsWith(code + ' ')).reduce((sum, l) => sum + Number(l.valor || 0), 0);
    const saldoAtual = Number(c.saldo || 0);
    const saldoAnterior = Math.max(0, saldoAtual - (isD ? mD - mC : mC - mD));
    const sAntD = isD ? saldoAnterior : 0;
    const sAntC = !isD ? saldoAnterior : 0;
    return `<tr>
      <td class="mono" style="font-size:11.5px;color:var(--text-tertiary)">${esc(c.cod)}</td>
      <td>${esc(c.nome)}</td>
      <td class="mono text-right">${sAntD > 0 ? fmt(sAntD) : ''}</td>
      <td class="mono text-right">${sAntC > 0 ? fmt(sAntC) : ''}</td>
      <td class="mono text-right" style="color:var(--text-secondary)">${mD > 0 ? fmt(mD) : ''}</td>
      <td class="mono text-right" style="color:var(--text-secondary)">${mC > 0 ? fmt(mC) : ''}</td>
      <td class="mono text-right" style="color:var(--info)">${isD ? fmt(saldoAtual) : ''}</td>
      <td class="mono text-right" style="color:var(--success)">${!isD ? fmt(saldoAtual) : ''}</td>
    </tr>`;
  }).join('');
}

// ============================================================
// RENDER: FLUXO DE CAIXA
// ============================================================

function renderFluxoCaixa() {
  const tbody = qs('#tb-fluxo');
  if (!tbody) return;
  const tipoCor = { Receita: 'badge-green', Despesa: 'badge-red', Tributo: 'badge-amber', Saldo: 'badge-blue' };
  const tiposValidos = new Set(['Receita', 'Despesa', 'Tributo', 'Saldo']);
  tbody.innerHTML = DB.fluxoCaixa.map(f => {
    const tipoSafe = tiposValidos.has(f.tipo) ? f.tipo : 'Saldo';
    return `<tr>
    <td>${esc(fmtDate(f.data))}</td>
    <td>${esc(f.descricao)}</td>
    <td><span class="badge ${tipoCor[tipoSafe] || 'badge-neutral'}">${esc(tipoSafe)}</span></td>
    <td class="mono text-right" style="color:var(--success)">${f.entrada > 0 ? fmt(f.entrada) : ''}</td>
    <td class="mono text-right" style="color:var(--danger)">${f.saida > 0 ? fmt(f.saida) : ''}</td>
    <td class="mono text-right" style="font-weight:600">${fmt(f.saldo)}</td>
  </tr>`;
  }).join('');
}

// ============================================================
// RENDER: DRE
// ============================================================

function renderDRE() {
  const wrap = qs('#dre-wrap');
  if (!wrap) return;

  const valorPorConta = (prefixo, lado) => DB.planoContas
    .filter(c => c.tipo === 'A' && c.cod.startsWith(prefixo))
    .map(c => ({ conta: c, valor: DB.lancamentos.filter(l => l[lado]?.startsWith(c.cod + ' ')).reduce((s, l) => s + Number(l.valor || 0), 0) || Number(c.saldo || 0) }))
    .filter(x => x.valor > 0);
  const receitas = valorPorConta('4', 'credito');
  const custos = valorPorConta('5', 'debito');
  const despesas = valorPorConta('6', 'debito');
  const totalReceitas = receitas.reduce((s, x) => s + x.valor, 0);
  const totalCustos = custos.reduce((s, x) => s + x.valor, 0);
  const totalDespesas = despesas.reduce((s, x) => s + x.valor, 0);
  const lucroBruto = totalReceitas - totalCustos;
  const lucroLiquido = lucroBruto - totalDespesas;
  const rows = [
    { label: 'RECEITA OPERACIONAL BRUTA', valor: totalReceitas, tipo: 'header' },
    ...receitas.map(x => ({ label: x.conta.nome, valor: x.valor, tipo: 'child' })),
    { label: 'RECEITA OPERACIONAL LÍQUIDA', valor: totalReceitas, tipo: 'result' },
    { label: '(-) CUSTOS', valor: -totalCustos, tipo: 'header' },
    ...custos.map(x => ({ label: x.conta.nome, valor: -x.valor, tipo: 'child' })),
    { label: 'LUCRO BRUTO', valor: lucroBruto, tipo: 'result' },
    { label: '(-) DESPESAS OPERACIONAIS', valor: -totalDespesas, tipo: 'header' },
    ...despesas.map(x => ({ label: x.conta.nome, valor: -x.valor, tipo: 'child' })),
    { label: 'LUCRO LÍQUIDO DO PERÍODO', valor: lucroLiquido, tipo: 'result grand' },
  ];

  wrap.innerHTML = rows.map(r => {
    const isPos = r.valor >= 0;
    let valClass = '';
    if (r.tipo === 'result' || r.tipo === 'result grand') {
      valClass = isPos ? 'val-pos' : 'val-neg';
    } else if (r.tipo === 'child') {
      valClass = r.valor < 0 ? 'val-neg' : 'val-pos';
    } else {
      valClass = 'val-neu';
    }
    const display = r.valor === 0 ? '—' : fmt(Math.abs(r.valor));
    return `<div class="dre-row ${r.tipo}">
      <span class="dre-label">${esc(r.label)}</span>
      <span class="dre-value ${valClass}">${r.valor < 0 ? '(' : ''}${display}${r.valor < 0 ? ')' : ''}</span>
    </div>`;
  }).join('');
}

// ============================================================
// RENDER: BALANÇO PATRIMONIAL
// ============================================================

function renderBalanco() {
  const ativoWrap   = qs('#balanco-ativo');
  const passivoWrap = qs('#balanco-passivo');
  if (!ativoWrap || !passivoWrap) return;

  const porGrupo = (prefixo) => DB.planoContas.filter(c => c.tipo === 'A' && c.cod.startsWith(prefixo));
  const ativoContas = porGrupo('1');
  const passivoContas = [...porGrupo('2'), ...porGrupo('3')];
  const ativo = [
    { label: 'ATIVO', valor: ativoContas.reduce((s, c) => s + Number(c.saldo || 0), 0), tipo: 'group' },
    ...ativoContas.map(c => ({ label: c.nome, valor: Number(c.saldo || 0) })),
    { label: 'TOTAL DO ATIVO', valor: ativoContas.reduce((s, c) => s + Number(c.saldo || 0), 0), tipo: 'total' },
  ];
  const passivo = [
    { label: 'PASSIVO + PATRIMÔNIO LÍQUIDO', valor: passivoContas.reduce((s, c) => s + Number(c.saldo || 0), 0), tipo: 'group' },
    ...passivoContas.map(c => ({ label: c.nome, valor: Number(c.saldo || 0) })),
    { label: 'TOTAL PASSIVO + PL', valor: passivoContas.reduce((s, c) => s + Number(c.saldo || 0), 0), tipo: 'total' },
  ];

  const renderGroup = (list) => list.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:${r.tipo === 'group' ? '10px 0 6px' : '7px 0'};
      border-bottom:1px solid var(--border-subtle);
      ${r.tipo === 'total' ? 'border-top:1px solid var(--border-base);margin-top:6px;padding-top:12px;font-weight:700' : ''}
      ${r.tipo === 'group' ? 'font-weight:600;color:var(--text-secondary);border-top:1px solid var(--border-base);margin-top:8px' : ''}">
      <span style="font-size:${r.tipo === 'total' ? '14px' : '13px'};${!r.tipo ? 'padding-left:14px;color:var(--text-secondary)' : ''}">${esc(r.label)}</span>
      <span style="font-family:var(--font-mono);font-size:${r.tipo === 'total' ? '15px' : '13px'};
        color:${r.tipo === 'total' ? 'var(--accent)' : r.valor < 0 ? 'var(--danger)' : 'var(--text-secondary)'};
        font-weight:${r.tipo === 'total' ? '600' : '400'}">${r.valor < 0 ? '(' + fmt(Math.abs(r.valor)) + ')' : fmt(r.valor)}</span>
    </div>`).join('');

  ativoWrap.innerHTML = renderGroup(ativo);
  passivoWrap.innerHTML = renderGroup(passivo);
}

// ============================================================
// RENDER: RELATÓRIOS
// ============================================================

function renderRelatorios() {
  const grid = qs('#relatorios-grid');
  if (!grid) return;

  // Dados estáticos — definidos no código, não vindos do banco
  const items = [
    { title: 'DRE Mensal',              desc: 'Demonstração do Resultado do Exercício por período', acao: 'dre' },
    { title: 'Balanço Patrimonial',     desc: 'Posição dos ativos, passivos e patrimônio líquido', acao: 'balanco' },
    { title: 'Fluxo de Caixa Direto',   desc: 'Entradas e saídas de caixa classificadas por natureza', acao: 'fluxo-caixa' },
    { title: 'Balancete de Verificação',desc: 'Saldos devedores e credores de todas as contas', acao: 'balancete' },
    { title: 'Livro Diário',            desc: 'Todos os lançamentos em ordem cronológica', acao: null },
    { title: 'Livro Razão',             desc: 'Movimentação analítica por conta contábil', acao: null },
    { title: 'Contas a Pagar',          desc: 'Posição de títulos a pagar por período e status', acao: 'contas-pagar' },
    { title: 'Contas a Receber',        desc: 'Posição de títulos a receber por período e status', acao: 'contas-receber' },
    { title: 'SPED Contábil (ECD)',     desc: 'Escrituração Contábil Digital para Receita Federal', acao: null },
  ];

  // Páginas válidas — whitelist para navegação segura
  const paginasValidas = new Set(['dre', 'balanco', 'fluxo-caixa', 'balancete', 'contas-pagar', 'contas-receber']);

  grid.innerHTML = items.map((item, idx) => `
    <div class="card" style="transition:border-color 0.15s"
         onmouseenter="this.style.borderColor='var(--border-base)'"
         onmouseleave="this.style.borderColor='var(--border-subtle)'">
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:14px;font-weight:600;margin-bottom:5px">${esc(item.title)}</div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.55">${esc(item.desc)}</div>
        </div>
        <div style="display:flex;gap:6px;margin-top:auto">
          ${item.acao
            ? `<button class="btn btn-secondary btn-sm" data-action="nav-relatorio" data-acao="${esc(item.acao)}" style="flex:1">Visualizar</button>`
            : `<button class="btn btn-secondary btn-sm" style="flex:1" disabled>Em breve</button>`}
          <button class="btn btn-secondary btn-sm btn-icon" data-action="exportar-relatorio" data-title="${esc(item.title)}" title="Exportar PDF">${Icon.download}</button>
        </div>
      </div>
    </div>`).join('');

  // Delegação de eventos — sem onclick inline com dados externos
  grid.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'nav-relatorio') {
      const acao = btn.dataset.acao;
      if (paginasValidas.has(acao)) navigate(acao);
    }
    if (btn.dataset.action === 'exportar-relatorio') {
      const title = btn.dataset.title || 'Relatório';
      toast(`Gerando ${title}...`, 'info');
    }
  };
}

// ============================================================
// RENDER: EMPRESAS
// ============================================================

function renderEmpresas() {
  const grid = qs('#empresas-grid');
  if (!grid) return;
  const corMap = { blue: 'var(--accent)', green: 'var(--success)', amber: 'var(--warning)' };
  // Whitelist de cores — nunca interpola e.cor diretamente no CSS
  const coresValidas = new Set(['blue', 'green', 'amber']);

  grid.innerHTML = DB.empresas.map(e => {
    const safeId  = sanitizeId(e.id);
    const corKey  = coresValidas.has(e.cor) ? e.cor : 'blue';
    const cor     = corMap[corKey];
    const inicial = esc((e.razao || '?')[0]);
    return `
    <div class="card" style="overflow:visible">
      <div style="height:2px;background:${cor};border-radius:var(--r-lg) var(--r-lg) 0 0"></div>
      <div class="card-body">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:${cor};
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:15px;color:#fff;flex-shrink:0">
            ${inicial}
          </div>
          <div>
            <div style="font-weight:600;font-size:14px;line-height:1.3">${esc(e.razao)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${esc(e.regime)}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;font-size:12.5px">
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">CNPJ</span><span class="mono" style="font-size:12px">${esc(e.cnpj)}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">CNAE</span><span>${esc(e.cnae || '—')}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">E-mail</span><span style="color:var(--text-secondary)">${esc(e.email || '—')}</span></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:16px">
          <button class="btn btn-secondary btn-sm" style="flex:1" data-id="${safeId}" data-action="selecionar-empresa" data-razao="${esc(e.razao)}">Selecionar</button>
          <button class="btn btn-secondary btn-sm" data-id="${safeId}" data-action="edit-empresa">Editar</button>
          <button class="btn btn-danger btn-sm btn-icon" data-id="${safeId}" data-action="delete-empresa" title="Remover">${Icon.trash}</button>
        </div>
      </div>
    </div>`;
  }).join('');

  // Delegação de eventos — sem onclick inline com dados do banco
  grid.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id    = btn.dataset.id;
    const razao = btn.dataset.razao || '';
    if (btn.dataset.action === 'selecionar-empresa') toast(`Abrindo ${razao}...`, 'info');
    if (btn.dataset.action === 'edit-empresa' && id) editEmpresa(id);
    if (btn.dataset.action === 'delete-empresa' && id) deleteEmpresa(id);
  };
}

async function deleteEmpresa(id) {
  const empresa = DB.empresas.find(e => e.id === id);
  if (!empresa) return;
  confirmDelete(empresa.razao || 'empresa', async () => {
    DB.empresas = DB.empresas.filter(e => e.id !== id);
    try { await deleteDoc(docRef('empresas', id)); } catch {}
    renderEmpresas(); toast('Empresa removida.', 'info');
  });
}

function editEmpresa(id) {
  const empresa = DB.empresas.find(e => e.id === id);
  if (!empresa) return;
  qs('#emp-id').value = id;
  qs('#emp-razao').value = empresa.razao || '';
  qs('#emp-cnpj').value = empresa.cnpj || '';
  qs('#emp-ie').value = empresa.ie || '';
  qs('#emp-regime').value = empresa.regime || 'Simples Nacional';
  qs('#emp-cnae').value = empresa.cnae || '';
  qs('#emp-email').value = empresa.email || '';
  qs('#modal-empresa .modal-title').textContent = 'Editar Empresa';
  openModal('modal-empresa');
}

async function saveEmpresa() {
  const razao  = sanitizeText(qs('#emp-razao')?.value, 200);
  const cnpj   = sanitizeText(qs('#emp-cnpj')?.value, 20);
  const ie     = sanitizeText(qs('#emp-ie')?.value, 50);
  const regime = qs('#emp-regime')?.value;
  const cnae   = sanitizeText(qs('#emp-cnae')?.value, 20);
  const email  = sanitizeText(qs('#emp-email')?.value, 200);

  if (!razao || !cnpj) { toast('Preencha todos os campos obrigatórios.', 'error'); return; }

  // Valida CNPJ: permite formato XX.XXX.XXX/XXXX-XX ou só dígitos
  const cnpjDigitos = cnpj.replace(/\D/g, '');
  if (cnpjDigitos.length !== 14) { toast('CNPJ inválido. Informe os 14 dígitos.', 'error'); return; }

  // Valida e-mail se fornecido
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    toast('E-mail inválido.', 'error'); return;
  }

  // Whitelist de regimes tributários
  const regimesValidos = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'MEI'];
  const regimeSafe = regimesValidos.includes(regime) ? regime : 'Simples Nacional';

  const editId = sanitizeId(qs('#emp-id')?.value);
  const existente = editId && DB.empresas.find(e => e.id === editId);
  const nova = { razao, cnpj, ie: ie || '', regime: regimeSafe, cnae, atividade: existente?.atividade || '', email, cor: existente?.cor || 'blue', atualizadoEm: serverTimestamp() };
  try {
    if (editId) {
      await updateDoc(docRef('empresas', editId), nova);
      const index = DB.empresas.findIndex(e => e.id === editId);
      if (index >= 0) DB.empresas[index] = { ...DB.empresas[index], ...nova };
    } else {
      const snap = await addDoc(colRef('empresas'), nova);
      DB.empresas.push({ id: snap.id, ...nova });
    }
  } catch {
    if (!editId) DB.empresas.push({ id: 'demo_' + Date.now(), ...nova });
  }

  renderEmpresas();
  closeModal('modal-empresa');
  toast(editId ? 'Empresa atualizada com sucesso.' : 'Empresa cadastrada com sucesso.', 'success');
  ['emp-id', 'emp-razao', 'emp-cnpj', 'emp-ie', 'emp-cnae', 'emp-email'].forEach(id => {
    const el = qs(`#${id}`); if (el) el.value = '';
  });
}

// Expõe as funções que precisam ser acessadas pelo HTML antes do init
window.fazerLogin  = window.fazerLogin;
window.fazerLogout = window.fazerLogout;
