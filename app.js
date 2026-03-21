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
  signInWithEmailAndPassword,
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
  orderBy
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
// CAMINHO FIRESTORE (baseado no uid do usuário logado)
// ============================================================

function colRef(nome) {
  // Estrutura: /{colecao} (raiz do Firestore)
  return collection(db, nome);
}

function docRef(nome, id) {
  return doc(db, nome, id);
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
  const email = qs('#login-email')?.value.trim();
  const senha  = qs('#login-senha')?.value;
  const btn    = qs('#btn-login');
  const errEl  = qs('#login-error');

  if (!email || !senha) {
    errEl.textContent = 'Preencha e-mail e senha.';
    errEl.classList.add('visible');
    return;
  }

  btn.classList.add('loading');
  btn.disabled = true;
  errEl.classList.remove('visible');

  try {
    await signInWithEmailAndPassword(auth, email, senha);
    // onAuthStateChanged vai cuidar do resto
  } catch (err) {
    const msgs = {
      'auth/invalid-credential':      'E-mail ou senha incorretos.',
      'auth/user-not-found':          'Usuário não encontrado.',
      'auth/wrong-password':          'Senha incorreta.',
      'auth/invalid-email':           'E-mail inválido.',
      'auth/too-many-requests':       'Muitas tentativas. Aguarde e tente novamente.',
      'auth/network-request-failed':  'Erro de conexão. Verifique sua internet.',
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

// Tecla Enter no campo de senha faz login
document.addEventListener('DOMContentLoaded', () => {
  qs('#login-senha')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.fazerLogin();
  });
  qs('#login-email')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') qs('#login-senha')?.focus();
  });
});

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
  window.toast             = toast;
  window.deleteLancamento  = deleteLancamento;
  window.saveLancamento    = saveLancamento;
  window.deleteContaPagar  = deleteContaPagar;
  window.pagarConta        = pagarConta;
  window.saveContaPagar    = saveContaPagar;
  window.deleteContaReceber= deleteContaReceber;
  window.receberConta      = receberConta;
  window.saveContaReceber  = saveContaReceber;
  window.deleteEmpresa     = deleteEmpresa;
  window.saveEmpresa       = saveEmpresa;
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

async function carregarTudo() {
  // Carrega cada coleção individualmente — se uma falhar, usa demo só para ela
  const colecoes = [
    { nome: 'lancamentos',       buildQ: q => query(q, orderBy('data', 'desc')),       demoKey: 'lancamentos' },
    { nome: 'contas a pagar',    buildQ: q => query(q, orderBy('vencimento', 'asc')),  demoKey: 'contas a pagar' },
    { nome: 'contas a receber',  buildQ: q => query(q, orderBy('vencimento', 'asc')),  demoKey: 'contas a receber' },
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
      if (snap.docs.length > 0) {
        DB[nome] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        algumFirestore = true;
      } else {
        // Coleção existe mas está vazia — tenta sem ordenação
        const snapSemOrdem = await getDocs(ref);
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
        const snap = await getDocs(ref);
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
function closeModal(id) { qs(`#${id}`)?.classList.remove('open'); }

// ============================================================
// TOAST
// ============================================================

function toast(msg, type = 'info') {
  const iconMap = { success: Icon.check, error: Icon.x, info: Icon.bell };
  const el = document.createElement('div');
  el.className = `toast s-${type}`;
  el.innerHTML = `<span class="toast-icon">${iconMap[type] || iconMap.info}</span><span class="toast-msg">${msg}</span>`;
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
        <div class="activity-desc">${l.historico}</div>
        <div class="activity-meta">${fmtDate(l.data)} · ${l.tipo} · ${l.documento}</div>
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
          <div class="activity-desc" style="font-size:12.5px;font-weight:600">${c.fornecedor || c.cliente || '—'}</div>
          <div class="activity-meta">${c.descricao || c['descriçao'] || '—'} — vence ${fmtDate(c.vencimento)}</div>
        </div>
        <div style="text-align:right">
          <div class="activity-amount neg">${fmt(c.valor)}</div>
          <span class="badge ${c.status === 'Vencida' ? 'badge-amber' : 'badge-blue'}" style="margin-top:2px">${c.status}</span>
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
  const meses    = ['Out', 'Nov', 'Dez', 'Jan', 'Fev', 'Mar'];
  const receitas = [98000, 112400, 105800, 118200, 131600, 148320];
  const despesas = [72300, 84100, 79400, 88600, 89200, 93740];
  const maxVal   = Math.max(...receitas, ...despesas);

  wrap.innerHTML = meses.map((m, i) => {
    const hR = Math.round((receitas[i] / maxVal) * 100);
    const hD = Math.round((despesas[i] / maxVal) * 100);
    return `
    <div class="bar-col">
      <div class="bar-pair">
        <div class="bar c-blue" style="height:${hR}%" title="Receita ${m}: ${fmt(receitas[i])}"></div>
        <div class="bar c-red"  style="height:${hD}%" title="Despesa ${m}: ${fmt(despesas[i])}"></div>
      </div>
      <span class="bar-lbl">${m}</span>
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
  const list = tipoFilter ? DB.lancamentos.filter(l => l.tipo === tipoFilter) : DB.lancamentos;
  const tbody = qs('#tb-lancamentos');
  if (!tbody) return;

  tbody.innerHTML = list.map(l => `
    <tr>
      <td>${fmtDate(l.data)}</td>
      <td style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l.historico}</td>
      <td style="color:var(--text-secondary);font-size:12px">${l.debito}</td>
      <td style="color:var(--text-secondary);font-size:12px">${l.credito}</td>
      <td class="mono">${fmt(l.valor)}</td>
      <td><span class="badge ${l.tipo === 'Crédito' ? 'badge-green' : 'badge-red'}">${l.tipo}</span></td>
      <td style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:12px">${l.documento}</td>
      <td>
        <button class="btn btn-danger btn-xs btn-icon" onclick="deleteLancamento('${l.id}')" title="Excluir">${Icon.trash}</button>
      </td>
    </tr>`).join('');

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
}

async function deleteLancamento(id) {
  DB.lancamentos = DB.lancamentos.filter(l => l.id !== id);
  // Deleta no Firestore (ignora erro se for dado de demo)
  try { await deleteDoc(docRef('lancamentos', id)); } catch {}
  renderLancamentos();
  renderDashboard();
  toast('Lançamento removido.', 'info');
}

async function saveLancamento() {
  const data      = qs('#lanc-data')?.value;
  const historico = qs('#lanc-historico')?.value.trim();
  const valorRaw  = qs('#lanc-valor')?.value;
  const tipo      = qs('#lanc-tipo')?.value;
  const debito    = qs('#lanc-debito')?.value;
  const credito   = qs('#lanc-credito')?.value;
  const documento = qs('#lanc-documento')?.value.trim();

  if (!data || !historico || !valorRaw || !debito || !credito) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) { toast('Valor inválido.', 'error'); return; }

  const novoLanc = { data, historico, debito, credito, valor, tipo, documento: documento || '—', criadoEm: serverTimestamp(), criadoPor: currentUser.uid };

  try {
    const docSnap = await addDoc(colRef('lancamentos'), novoLanc);
    DB.lancamentos.unshift({ id: docSnap.id, ...novoLanc });
  } catch {
    // Modo offline/demo
    DB.lancamentos.unshift({ id: 'demo_' + Date.now(), ...novoLanc });
  }

  renderLancamentos();
  renderDashboard();
  closeModal('modal-lancamento');
  toast('Lançamento registrado com sucesso.', 'success');
  ['lanc-historico', 'lanc-valor', 'lanc-documento'].forEach(id => {
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
    // Compatibilidade: campo pode ser 'fornecedor' (padrão) ou 'cliente' (criado manualmente)
    const nomeForn = c.fornecedor || c.cliente || '—';
    const desc     = c.descricao  || c['descriçao'] || c['descricao'] || '—';
    const emissao  = c.emissao    || c.criasoEM     || c.criadoEm    || '';
    const venc     = c.vencimento || '—';
    const valor    = Number(c.valor) || 0;
    const forma    = c.forma      || '—';
    const status   = c.status     || 'Em Aberto';
    return `<tr>
    <td style="font-weight:600">${nomeForn}</td>
    <td style="color:var(--text-secondary);font-size:12.5px">${desc}</td>
    <td>${fmtDate(typeof emissao === 'string' ? emissao : '')}</td>
    <td>${fmtDate(venc)}</td>
    <td class="mono">${fmt(valor)}</td>
    <td style="color:var(--text-secondary);font-size:12px">${forma}</td>
    <td><span class="badge ${sBadge[status] || 'badge-neutral'}">${status}</span></td>
    <td style="display:flex;gap:5px">
      ${status === 'Em Aberto' ? `<button class="btn btn-success btn-xs" onclick="pagarConta('${c.id}')">Pagar</button>` : ''}
      <button class="btn btn-danger btn-xs btn-icon" onclick="deleteContaPagar('${c.id}')">${Icon.trash}</button>
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
  DB['contas a pagar'] = DB['contas a pagar'].filter(x => x.id !== id);
  try { await deleteDoc(docRef('contas a pagar', id)); } catch {}
  renderContasPagar();
  renderDashboard();
  toast('Registro removido.', 'info');
}

async function saveContaPagar() {
  const fornecedor = qs('#cp-fornecedor')?.value.trim();
  const descricao  = qs('#cp-descricao')?.value.trim();
  const emissao    = qs('#cp-emissao')?.value;
  const vencimento = qs('#cp-vencimento')?.value;
  const valorRaw   = qs('#cp-valor')?.value;
  const categoria  = qs('#cp-categoria')?.value;
  const forma      = qs('#cp-forma')?.value;

  if (!fornecedor || !descricao || !vencimento || !valorRaw) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) { toast('Valor inválido.', 'error'); return; }

  const nova = { fornecedor, descricao, emissao, vencimento, valor, categoria, forma, status: 'Em Aberto', criadoEm: serverTimestamp() };
  try {
    const snap = await addDoc(colRef('contas a pagar'), nova);
    DB['contas a pagar'].unshift({ id: snap.id, ...nova });
  } catch {
    DB['contas a pagar'].unshift({ id: 'demo_' + Date.now(), ...nova });
  }

  renderContasPagar();
  renderDashboard();
  closeModal('modal-conta-pagar');
  toast('Conta a pagar registrada.', 'success');
  ['cp-fornecedor', 'cp-descricao', 'cp-vencimento', 'cp-valor'].forEach(id => {
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
    const cliente  = c.cliente   || c.fornecedor || '—';
    const desc     = c.descricao || c['descriçao'] || '—';
    const emissao  = c.emissao   || c.criasoEM   || c.criadoEm || '';
    const venc     = c.vencimento || '—';
    const valor    = Number(c.valor) || 0;
    const forma    = c.forma     || '—';
    const status   = c.status    || 'Em Aberto';
    return `<tr>
    <td style="font-weight:600">${cliente}</td>
    <td style="color:var(--text-secondary);font-size:12.5px">${desc}</td>
    <td>${fmtDate(typeof emissao === 'string' ? emissao : '')}</td>
    <td>${fmtDate(venc)}</td>
    <td class="mono">${fmt(valor)}</td>
    <td style="color:var(--text-secondary);font-size:12px">${forma}</td>
    <td><span class="badge ${sBadge[status] || 'badge-neutral'}">${status}</span></td>
    <td style="display:flex;gap:5px">
      ${status !== 'Recebida' ? `<button class="btn btn-success btn-xs" onclick="receberConta('${c.id}')">Receber</button>` : ''}
      <button class="btn btn-danger btn-xs btn-icon" onclick="deleteContaReceber('${c.id}')">${Icon.trash}</button>
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
  DB['contas a receber'] = DB['contas a receber'].filter(x => x.id !== id);
  try { await deleteDoc(docRef('contas a receber', id)); } catch {}
  renderContasReceber();
  toast('Registro removido.', 'info');
}

async function saveContaReceber() {
  const cliente    = qs('#cr-cliente')?.value.trim();
  const descricao  = qs('#cr-descricao')?.value.trim();
  const emissao    = qs('#cr-emissao')?.value;
  const vencimento = qs('#cr-vencimento')?.value;
  const valorRaw   = qs('#cr-valor')?.value;
  const categoria  = qs('#cr-categoria')?.value;
  const forma      = qs('#cr-forma')?.value;

  if (!cliente || !descricao || !vencimento || !valorRaw) {
    toast('Preencha todos os campos obrigatórios.', 'error'); return;
  }
  const valor = parseFloat(valorRaw);
  if (isNaN(valor) || valor <= 0) { toast('Valor inválido.', 'error'); return; }

  const nova = { cliente, descricao, emissao, vencimento, valor, categoria, forma, status: 'Em Aberto', criadoEm: serverTimestamp() };
  try {
    const snap = await addDoc(colRef('contas a receber'), nova);
    DB['contas a receber'].unshift({ id: snap.id, ...nova });
  } catch {
    DB['contas a receber'].unshift({ id: 'demo_' + Date.now(), ...nova });
  }

  renderContasReceber();
  closeModal('modal-conta-receber');
  toast('Conta a receber registrada.', 'success');
  ['cr-cliente', 'cr-descricao', 'cr-vencimento', 'cr-valor'].forEach(id => {
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
      <span class="account-code">${c.cod}</span>
      <span class="account-name">${c.nome}</span>
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
    const isD  = c.nat === 'D';
    const sAntD = isD ? +(c.saldo * 0.82).toFixed(2) : 0;
    const sAntC = !isD ? +(c.saldo * 0.82).toFixed(2) : 0;
    const mD    = isD ? +(c.saldo * 0.18).toFixed(2) : 0;
    const mC    = !isD ? +(c.saldo * 0.18).toFixed(2) : 0;
    return `<tr>
      <td class="mono" style="font-size:11.5px;color:var(--text-tertiary)">${c.cod}</td>
      <td>${c.nome}</td>
      <td class="mono text-right">${sAntD > 0 ? fmt(sAntD) : ''}</td>
      <td class="mono text-right">${sAntC > 0 ? fmt(sAntC) : ''}</td>
      <td class="mono text-right" style="color:var(--text-secondary)">${mD > 0 ? fmt(mD) : ''}</td>
      <td class="mono text-right" style="color:var(--text-secondary)">${mC > 0 ? fmt(mC) : ''}</td>
      <td class="mono text-right" style="color:var(--info)">${isD ? fmt(c.saldo) : ''}</td>
      <td class="mono text-right" style="color:var(--success)">${!isD ? fmt(c.saldo) : ''}</td>
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
  tbody.innerHTML = DB.fluxoCaixa.map(f => `<tr>
    <td>${fmtDate(f.data)}</td>
    <td>${f.descricao}</td>
    <td><span class="badge ${tipoCor[f.tipo] || 'badge-neutral'}">${f.tipo}</span></td>
    <td class="mono text-right" style="color:var(--success)">${f.entrada > 0 ? fmt(f.entrada) : ''}</td>
    <td class="mono text-right" style="color:var(--danger)">${f.saida > 0 ? fmt(f.saida) : ''}</td>
    <td class="mono text-right" style="font-weight:600">${fmt(f.saldo)}</td>
  </tr>`).join('');
}

// ============================================================
// RENDER: DRE
// ============================================================

function renderDRE() {
  const wrap = qs('#dre-wrap');
  if (!wrap) return;

  const rows = [
    { label: 'RECEITA OPERACIONAL BRUTA',             valor: 150720, tipo: 'header' },
    { label: 'Receita bruta de vendas',               valor: 128200, tipo: 'child' },
    { label: 'Receita de serviços',                   valor: 21400,  tipo: 'child' },
    { label: 'Outras receitas',                       valor: 1120,   tipo: 'child' },
    { label: '(-) DEDUÇÕES DA RECEITA BRUTA',         valor: -12580, tipo: 'header' },
    { label: 'Impostos sobre vendas (PIS/COFINS/ISS)',valor: -10840, tipo: 'child' },
    { label: 'Devoluções e abatimentos',              valor: -1740,  tipo: 'child' },
    { label: 'RECEITA OPERACIONAL LÍQUIDA',           valor: 138140, tipo: 'result' },
    { label: '(-) CUSTO DOS PRODUTOS E SERVIÇOS',     valor: -70300, tipo: 'header' },
    { label: 'Custo das mercadorias vendidas',        valor: -62100, tipo: 'child' },
    { label: 'Custo dos serviços prestados',          valor: -8200,  tipo: 'child' },
    { label: 'LUCRO BRUTO',                           valor: 67840,  tipo: 'result' },
    { label: '(-) DESPESAS OPERACIONAIS',             valor: -38140, tipo: 'header' },
    { label: 'Despesas com pessoal',                  valor: -21580, tipo: 'child' },
    { label: 'Despesas administrativas',              valor: -6870,  tipo: 'child' },
    { label: 'Despesas tributárias',                  valor: -8450,  tipo: 'child' },
    { label: 'Despesas financeiras',                  valor: -1240,  tipo: 'child' },
    { label: 'RESULTADO ANTES DO IR/CSLL',            valor: 29700,  tipo: 'result' },
    { label: '(-) Provisão IR/CSLL (25%)',            valor: -7425,  tipo: 'child' },
    { label: 'LUCRO LÍQUIDO DO PERÍODO',              valor: 22275,  tipo: 'result grand' },
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
      <span class="dre-label">${r.label}</span>
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

  const ativo = [
    { label: 'ATIVO CIRCULANTE',            valor: 284200, tipo: 'group' },
    { label: 'Caixa',                       valor: 18400 },
    { label: 'Banco Bradesco — CC',         valor: 64380 },
    { label: 'Clientes a receber',          valor: 31200 },
    { label: 'Estoques de mercadorias',     valor: 142600 },
    { label: 'Impostos a recuperar',        valor: 8420 },
    { label: 'Despesas antecipadas',        valor: 4800 },
    { label: 'Ajuste — outros circulantes', valor: 14400 },
    { label: 'ATIVO NÃO CIRCULANTE',        valor: 200000, tipo: 'group' },
    { label: 'Imobilizado bruto',           valor: 210000 },
    { label: '(-) Depreciação acumulada',   valor: -30000 },
    { label: 'Intangível',                  valor: 20000 },
    { label: 'TOTAL DO ATIVO',              valor: 484200, tipo: 'total' },
  ];

  const passivo = [
    { label: 'PASSIVO CIRCULANTE',              valor: 82300,  tipo: 'group' },
    { label: 'Fornecedores',                    valor: 47320 },
    { label: 'Obrigações sociais a recolher',   valor: 21480 },
    { label: 'Tributos a recolher',             valor: 13500 },
    { label: 'PASSIVO NÃO CIRCULANTE',          valor: 120000, tipo: 'group' },
    { label: 'Empréstimos e financiamentos',    valor: 120000 },
    { label: 'PATRIMÔNIO LÍQUIDO',              valor: 281900, tipo: 'group' },
    { label: 'Capital social integralizado',    valor: 200000 },
    { label: 'Reserva legal',                   valor: 30000 },
    { label: 'Lucros acumulados',               valor: 51900 },
    { label: 'TOTAL PASSIVO + PL',              valor: 484200, tipo: 'total' },
  ];

  const renderGroup = (list) => list.map(r => `
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:${r.tipo === 'group' ? '10px 0 6px' : '7px 0'};
      border-bottom:1px solid var(--border-subtle);
      ${r.tipo === 'total' ? 'border-top:1px solid var(--border-base);margin-top:6px;padding-top:12px;font-weight:700' : ''}
      ${r.tipo === 'group' ? 'font-weight:600;color:var(--text-secondary);border-top:1px solid var(--border-base);margin-top:8px' : ''}">
      <span style="font-size:${r.tipo === 'total' ? '14px' : '13px'};${!r.tipo ? 'padding-left:14px;color:var(--text-secondary)' : ''}">${r.label}</span>
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

  grid.innerHTML = items.map(item => `
    <div class="card" style="transition:border-color 0.15s"
         onmouseenter="this.style.borderColor='var(--border-base)'"
         onmouseleave="this.style.borderColor='var(--border-subtle)'">
      <div class="card-body" style="display:flex;flex-direction:column;gap:14px">
        <div>
          <div style="font-size:14px;font-weight:600;margin-bottom:5px">${item.title}</div>
          <div style="font-size:12px;color:var(--text-tertiary);line-height:1.55">${item.desc}</div>
        </div>
        <div style="display:flex;gap:6px;margin-top:auto">
          ${item.acao
            ? `<button class="btn btn-secondary btn-sm" onclick="navigate('${item.acao}')" style="flex:1">Visualizar</button>`
            : `<button class="btn btn-secondary btn-sm" style="flex:1" disabled>Em breve</button>`}
          <button class="btn btn-secondary btn-sm btn-icon" onclick="toast('Gerando ${item.title}...','info')" title="Exportar PDF">${Icon.download}</button>
        </div>
      </div>
    </div>`).join('');
}

// ============================================================
// RENDER: EMPRESAS
// ============================================================

function renderEmpresas() {
  const grid = qs('#empresas-grid');
  if (!grid) return;
  const corMap = { blue: 'var(--accent)', green: 'var(--success)', amber: 'var(--warning)' };

  grid.innerHTML = DB.empresas.map(e => {
    const cor = corMap[e.cor] || 'var(--accent)';
    return `
    <div class="card" style="overflow:visible">
      <div style="height:2px;background:${cor};border-radius:var(--r-lg) var(--r-lg) 0 0"></div>
      <div class="card-body">
        <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:16px">
          <div style="width:40px;height:40px;border-radius:10px;background:${cor};
            display:flex;align-items:center;justify-content:center;
            font-weight:700;font-size:15px;color:#fff;flex-shrink:0">
            ${e.razao[0]}
          </div>
          <div>
            <div style="font-weight:600;font-size:14px;line-height:1.3">${e.razao}</div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px">${e.regime}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;font-size:12.5px">
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">CNPJ</span><span class="mono" style="font-size:12px">${e.cnpj}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">CNAE</span><span>${e.cnae || '—'}</span></div>
          <div style="display:flex;gap:8px"><span style="color:var(--text-tertiary);min-width:52px">E-mail</span><span style="color:var(--text-secondary)">${e.email || '—'}</span></div>
        </div>
        <div style="display:flex;gap:6px;margin-top:16px">
          <button class="btn btn-secondary btn-sm" style="flex:1" onclick="toast('Abrindo ${e.razao}...','info')">Selecionar</button>
          <button class="btn btn-danger btn-sm btn-icon" onclick="deleteEmpresa('${e.id}')" title="Remover">${Icon.trash}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function deleteEmpresa(id) {
  DB.empresas = DB.empresas.filter(e => e.id !== id);
  try { await deleteDoc(docRef('empresas', id)); } catch {}
  renderEmpresas();
  toast('Empresa removida.', 'info');
}

async function saveEmpresa() {
  const razao  = qs('#emp-razao')?.value.trim();
  const cnpj   = qs('#emp-cnpj')?.value.trim();
  const ie     = qs('#emp-ie')?.value.trim();       // BUG CORRIGIDO: id adicionado no HTML
  const regime = qs('#emp-regime')?.value;
  const cnae   = qs('#emp-cnae')?.value.trim();
  const email  = qs('#emp-email')?.value.trim();

  if (!razao || !cnpj) { toast('Preencha todos os campos obrigatórios.', 'error'); return; }

  const nova = { razao, cnpj, ie: ie || '', regime, cnae, atividade: '', email, cor: 'blue', criadoEm: serverTimestamp() };
  try {
    const snap = await addDoc(colRef('empresas'), nova);
    DB.empresas.push({ id: snap.id, ...nova });
  } catch {
    DB.empresas.push({ id: 'demo_' + Date.now(), ...nova });
  }

  renderEmpresas();
  closeModal('modal-empresa');
  toast('Empresa cadastrada com sucesso.', 'success');
  ['emp-razao', 'emp-cnpj', 'emp-ie', 'emp-cnae', 'emp-email'].forEach(id => {
    const el = qs(`#${id}`); if (el) el.value = '';
  });
}

// Expõe as funções que precisam ser acessadas pelo HTML antes do init
window.fazerLogin  = window.fazerLogin;
window.fazerLogout = window.fazerLogout;
