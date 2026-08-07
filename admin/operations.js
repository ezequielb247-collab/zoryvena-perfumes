import { supabase } from '../assets/js/supabase.js';
import { operationalSummary, productOperationalRisks, auditEntryLabel, launchGuardState } from './operations-core.mjs';
import './mp-production-readiness.js';

const panel = document.querySelector('#adminPanel');
const dashboard = document.querySelector('#dashboardView');
const refreshAdmin = document.querySelector('#refreshAdmin');
const productsBody = document.querySelector('#adminProductsBody');
let lastProducts = [];
let lastSummary = null;
let refreshing = false;

const fieldLabels = {
  stock: 'estoque',
  minimum_stock: 'estoque mínimo',
  cost: 'custo',
  price: 'preço',
  pix_price: 'preço Pix',
  image: 'imagem',
  active: 'situação',
  preorder_enabled: 'encomenda',
  preorder_limit: 'limite de encomenda',
  status: 'status',
  fulfillment_status: 'andamento',
  admin_notes: 'observação interna',
  archived_at: 'arquivamento',
  payment_environment: 'ambiente de pagamento',
  launch_status: 'status da loja',
  supplier_docs_verified: 'procedência do fornecedor',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function ensureUi() {
  if (!dashboard) return;
  if (!document.querySelector('#operationsCenter')) {
    const center = el('article', 'admin-card operations-card');
    center.id = 'operationsCenter';
    center.innerHTML = `
      <div class="operations-header">
        <div><span class="eyebrow">Operação diária</span><h2>Central de ações</h2><p>Pedidos, estoque e travas de lançamento em uma única visão.</p></div>
        <div class="operations-sync"><span id="operationsStatus">Carregando…</span><small id="operationsLastSync"></small></div>
      </div>
      <div class="operations-grid">
        <button class="operation-tile" type="button" data-ops-action="new-orders"><span>Novos pedidos</span><strong id="opsNewOrders">0</strong><small>Pagos e aguardando preparação</small></button>
        <button class="operation-tile" type="button" data-ops-action="separating"><span>Em separação</span><strong id="opsSeparating">0</strong><small>Pedidos sendo preparados</small></button>
        <button class="operation-tile" type="button" data-ops-action="pending-payment"><span>Aguardando pagamento</span><strong id="opsPendingPayment">0</strong><small>Pedidos ainda não confirmados</small></button>
        <button class="operation-tile" type="button" data-ops-action="products"><span>Estoque baixo</span><strong id="opsLowStock">0</strong><small id="opsLowStockDetail">Produtos no mínimo definido</small></button>
        <button class="operation-tile" type="button" data-ops-action="products"><span>Risco de preço</span><strong id="opsPricingRisk">0</strong><small>Custo/preço ausente ou sem margem</small></button>
        <button class="operation-tile" type="button" data-ops-action="pickup-ready"><span>Prontos para retirada</span><strong id="opsPickupReady">0</strong><small>Clientes que já podem ser avisados</small></button>
      </div>
      <div class="operations-safety" id="operationsSafety"></div>
    `;
    const metrics = dashboard.querySelector('.metric-grid');
    metrics?.after(center);
  }

  if (!document.querySelector('#auditHistoryCard')) {
    const card = el('article', 'admin-card audit-history-card');
    card.id = 'auditHistoryCard';
    card.innerHTML = '<div class="operations-header"><div><span class="eyebrow">Rastreabilidade</span><h2>Alterações recentes</h2><p>Histórico sanitizado das mudanças administrativas protegidas por MFA.</p></div></div><ul class="audit-history-list" id="auditHistoryList"><li>Carregando histórico…</li></ul>';
    const adminGrid = dashboard.querySelector('.admin-grid');
    adminGrid?.after(card);
  }

  if (!document.querySelector('#settingsLaunchGuard')) {
    const settingsForm = document.querySelector('#settingsForm');
    if (settingsForm) {
      const guard = el('div', 'settings-launch-guard');
      guard.id = 'settingsLaunchGuard';
      settingsForm.before(guard);
      bindSettingsGuard();
    }
  }
}

function formatTime(date = new Date()) {
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setText(selector, value) {
  const node = document.querySelector(selector);
  if (node) node.textContent = String(value);
}

function safetyMessages(summary) {
  const messages = [];
  if (!summary.supplierDocsVerified && summary.supplierDocsExceptionAcknowledged) {
    messages.push({ type: 'info', text: 'Documentação do fornecedor indisponível: exceção operacional registrada. Não anuncie procedência documental comprovada.' });
  } else if (!summary.supplierDocsVerified) {
    messages.push({ type: 'blocker', text: 'Procedência do fornecedor ainda não comprovada e nenhuma exceção operacional foi registrada.' });
  }
  if (summary.paymentEnvironment !== 'production') messages.push({ type: 'safe', text: 'Mercado Pago em ambiente de teste: nenhuma cobrança real deve ser liberada.' });
  if (summary.launchStatus === 'preparation') messages.push({ type: 'safe', text: 'Loja em preparação: catálogo pode ser testado sem abertura oficial.' });
  if (!summary.emailNotificationsEnabled) messages.push({ type: 'info', text: 'E-mails automáticos ainda não estão ativos; atendimento e acompanhamento continuam pelo painel/WhatsApp.' });
  return messages;
}

function renderSummary(summary) {
  lastSummary = summary;
  setText('#opsNewOrders', summary.newOrders.length);
  setText('#opsSeparating', summary.separatingOrders.length);
  setText('#opsPendingPayment', summary.pendingPaymentOrders.length);
  setText('#opsLowStock', summary.lowStockProducts.length);
  setText('#opsPricingRisk', summary.pricingRiskProducts.length);
  setText('#opsPickupReady', summary.pickupReadyOrders.length);
  setText('#opsLowStockDetail', `${summary.soldOutProducts.length} sem estoque · ${summary.readyUnits} unidades prontas`);
  setText('#operationsStatus', 'Sincronizado');
  setText('#operationsLastSync', `Atualizado às ${formatTime()}`);

  const safety = document.querySelector('#operationsSafety');
  if (safety) {
    safety.replaceChildren(...safetyMessages(summary).map(item => {
      const note = el('p', `operations-note ${item.type}`, item.text);
      return note;
    }));
  }
  applySettingsGuard();
  highlightProductRows();
}

function shortEntityId(value) {
  const text = String(value || '');
  return text.length > 26 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text;
}

function renderAudit(entries = [], error = null) {
  const list = document.querySelector('#auditHistoryList');
  if (!list) return;
  list.replaceChildren();
  if (error) {
    list.append(el('li', 'audit-history-empty', 'Histórico disponível após confirmar o MFA administrativo.'));
    return;
  }
  if (!entries.length) {
    list.append(el('li', 'audit-history-empty', 'Nenhuma alteração administrativa registrada.'));
    return;
  }

  entries.slice(0, 10).forEach(entry => {
    const item = el('li', 'audit-history-item');
    const copy = el('div', 'audit-history-copy');
    const title = el('strong', '', auditEntryLabel(entry));
    const fields = Array.isArray(entry.changed_fields) ? entry.changed_fields : [];
    const detailText = fields.length
      ? fields.map(field => fieldLabels[field] || field).join(', ')
      : 'sem alteração de campos públicos';
    const detail = el('span', '', `${shortEntityId(entry.entity_id)} · ${detailText}`);
    const time = el('time', '', new Date(entry.occurred_at).toLocaleString('pt-BR'));
    copy.append(title, detail);
    item.append(copy, time);
    list.append(item);
  });
}

async function fetchOperations() {
  const [productsResult, ordersResult, settingsResult, auditResult] = await Promise.all([
    supabase.from('products').select('id,brand,name,active,stock,minimum_stock,cost,price,pix_price,image'),
    supabase.from('orders').select('id,status,fulfillment_status,archived_at'),
    supabase.from('store_settings').select('payment_environment,supplier_docs_verified,supplier_docs_unavailable_acknowledged_at,launch_status,email_notifications_enabled,shipping_mode').eq('id', 1).single(),
    supabase.rpc('admin_get_audit_log', { p_limit: 30 }),
  ]);

  for (const result of [productsResult, ordersResult, settingsResult]) {
    if (result.error) throw result.error;
  }

  lastProducts = productsResult.data || [];
  return {
    summary: operationalSummary(lastProducts, ordersResult.data || [], settingsResult.data || {}),
    auditEntries: auditResult.error ? [] : (auditResult.data || []),
    auditError: auditResult.error || null,
  };
}

async function refreshOperations() {
  ensureUi();
  if (!panel || panel.hidden || refreshing) return;
  refreshing = true;
  setText('#operationsStatus', 'Atualizando…');
  try {
    const data = await fetchOperations();
    renderSummary(data.summary);
    renderAudit(data.auditEntries, data.auditError);
  } catch (error) {
    console.error('operations refresh failed', error);
    setText('#operationsStatus', 'Falha ao sincronizar');
    setText('#operationsLastSync', 'Use “Atualizar dados” para tentar novamente.');
  } finally {
    refreshing = false;
  }
}

function setOrderFilters(payment = 'all', fulfillment = 'all') {
  document.querySelector('[data-admin-tab="ordersView"]')?.click();
  const paymentFilter = document.querySelector('#orderPaymentFilter');
  const fulfillmentFilter = document.querySelector('#orderFulfillmentFilter');
  const archiveFilter = document.querySelector('#orderArchiveFilter');
  if (paymentFilter) paymentFilter.value = payment;
  if (fulfillmentFilter) fulfillmentFilter.value = fulfillment;
  if (archiveFilter) archiveFilter.value = 'active';
  paymentFilter?.dispatchEvent(new Event('change', { bubbles: true }));
}

function handleAction(action) {
  if (action === 'new-orders') return setOrderFilters('approved', 'Novo pedido');
  if (action === 'separating') return setOrderFilters('approved', 'Em separação');
  if (action === 'pending-payment') return setOrderFilters('pending', 'all');
  if (action === 'pickup-ready') return setOrderFilters('approved', 'Pronto para retirada');
  if (action === 'products') {
    document.querySelector('[data-admin-tab="productsView"]')?.click();
    window.setTimeout(highlightProductRows, 30);
  }
}

function riskTitle(risks) {
  const labels = {
    low_stock: 'Estoque no mínimo ou abaixo', sold_out: 'Sem estoque', missing_cost: 'Sem custo',
    missing_price: 'Sem preço', missing_pix_price: 'Sem preço Pix', card_no_margin: 'Preço do cartão sem margem',
    pix_no_margin: 'Preço Pix sem margem', missing_image: 'Sem imagem',
  };
  return risks.map(risk => labels[risk] || risk).join(' · ');
}

function highlightProductRows() {
  if (!productsBody || !lastProducts.length) return;
  productsBody.querySelectorAll('tr').forEach(row => {
    row.classList.remove('operation-risk-low', 'operation-risk-critical');
    row.removeAttribute('data-operation-risk');
  });
  lastProducts.forEach(product => {
    const button = productsBody.querySelector(`[data-save-product="${CSS.escape(String(product.id))}"]`);
    const row = button?.closest('tr');
    if (!row) return;
    const risks = productOperationalRisks(product);
    if (!risks.length) return;
    row.dataset.operationRisk = riskTitle(risks);
    row.title = row.dataset.operationRisk;
    if (risks.some(risk => ['sold_out', 'card_no_margin', 'pix_no_margin', 'missing_price', 'missing_cost'].includes(risk))) {
      row.classList.add('operation-risk-critical');
    } else {
      row.classList.add('operation-risk-low');
    }
  });
}

function bindSettingsGuard() {
  const form = document.querySelector('#settingsForm');
  if (!form || form.dataset.operationsGuardBound === 'true') return;
  form.dataset.operationsGuardBound = 'true';
  form.elements.supplier_docs_verified?.addEventListener('change', applySettingsGuard);
  form.elements.payment_environment?.addEventListener('change', applySettingsGuard);
  form.elements.launch_status?.addEventListener('change', applySettingsGuard);
}

function applySettingsGuard() {
  const form = document.querySelector('#settingsForm');
  const guard = document.querySelector('#settingsLaunchGuard');
  if (!form || !guard) return;
  if (!lastSummary) {
    guard.textContent = 'Carregando travas de lançamento confirmadas pelo servidor…';
    return;
  }

  const supplierSelect = form.elements.supplier_docs_verified;
  const paymentSelect = form.elements.payment_environment;
  const launchSelect = form.elements.launch_status;
  const storedSupplierVerified = lastSummary.supplierDocsVerified === true;
  const supplierDocsExceptionAcknowledged = lastSummary.supplierDocsExceptionAcknowledged === true;

  const supplierVerifiedOption = supplierSelect?.querySelector('option[value="true"]');
  if (supplierVerifiedOption) supplierVerifiedOption.disabled = !storedSupplierVerified;
  if (!storedSupplierVerified && supplierSelect?.value === 'true') supplierSelect.value = 'false';

  let state = launchGuardState({
    storedSupplierDocsVerified: storedSupplierVerified,
    supplierDocsExceptionAcknowledged,
    selectedSupplierDocsVerified: supplierSelect?.value === 'true',
    selectedPaymentEnvironment: paymentSelect?.value || 'test',
    storedLaunchStatus: lastSummary.launchStatus,
  });

  const productionOption = paymentSelect?.querySelector('option[value="production"]');
  if (productionOption) productionOption.disabled = !state.canSelectProduction;
  if (!state.canSelectProduction && paymentSelect?.value === 'production') paymentSelect.value = 'test';

  state = launchGuardState({
    storedSupplierDocsVerified: storedSupplierVerified,
    supplierDocsExceptionAcknowledged,
    selectedSupplierDocsVerified: supplierSelect?.value === 'true',
    selectedPaymentEnvironment: paymentSelect?.value || 'test',
    storedLaunchStatus: lastSummary.launchStatus,
  });

  const softLaunchOption = launchSelect?.querySelector('option[value="soft_launch"]');
  const liveOption = launchSelect?.querySelector('option[value="live"]');
  if (softLaunchOption) softLaunchOption.disabled = !state.canSelectSoftLaunch;
  if (liveOption) liveOption.disabled = !state.canSelectLive;
  if (launchSelect?.value === 'soft_launch' && !state.canSelectSoftLaunch) launchSelect.value = 'preparation';
  if (launchSelect?.value === 'live' && !state.canSelectLive) launchSelect.value = lastSummary.launchStatus === 'soft_launch' ? 'soft_launch' : 'preparation';

  const notes = [];
  if (!storedSupplierVerified && supplierDocsExceptionAcknowledged) {
    notes.push('A documentação do fornecedor continua não comprovada e a opção “Conferidas e arquivadas” permanece bloqueada. A exceção operacional por documentos indisponíveis foi registrada e não deve ser apresentada como prova de procedência.');
  } else if (!storedSupplierVerified) {
    notes.push('Procedência ainda não comprovada e sem exceção operacional. Produção permanece bloqueada.');
  } else if (supplierSelect?.value !== 'true') {
    notes.push('A procedência foi desmarcada nesta edição; produção e lançamento ficam bloqueados enquanto ela permanecer revogada.');
  }

  if (state.supplierRequirementMet && paymentSelect?.value !== 'production') {
    notes.push('O requisito operacional do fornecedor está registrado. O próximo bloqueio técnico é validar o Mercado Pago em produção.');
  } else if (state.supplierRequirementMet && paymentSelect?.value === 'production' && lastSummary.launchStatus === 'preparation') {
    notes.push('Com pagamentos produtivos validados, o próximo passo permitido será o lançamento controlado; “Loja oficialmente aberta” continua bloqueado até passar pelo soft launch.');
  } else if (state.supplierRequirementMet && paymentSelect?.value === 'production') {
    notes.push('Travas principais registradas. Antes de ampliar a operação, execute e revise o teste real controlado de ponta a ponta.');
  }

  notes.push('O servidor valida essas dependências novamente; alterar o HTML ou usar DevTools não contorna as travas.');
  guard.replaceChildren(...notes.map(text => el('p', '', text)));
}

document.addEventListener('click', event => {
  const action = event.target.closest('[data-ops-action]');
  if (action) handleAction(action.dataset.opsAction);
});

refreshAdmin?.addEventListener('click', () => window.setTimeout(refreshOperations, 350));

if (productsBody) {
  new MutationObserver(() => highlightProductRows()).observe(productsBody, { childList: true });
}

if (panel) {
  new MutationObserver(() => {
    if (!panel.hidden) window.setTimeout(refreshOperations, 50);
  }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
}

ensureUi();
window.setTimeout(refreshOperations, 80);