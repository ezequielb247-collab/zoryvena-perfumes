import { supabase } from '../assets/js/supabase.js';

const $ = selector => document.querySelector(selector);
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function hasText(value) {
  return String(value || '').trim().length > 2;
}

function item(label, ok, detail, critical = false) {
  return { label, ok, detail, critical };
}

function render(items) {
  const list = $('#launchReadinessList');
  const score = $('#launchReadinessScore');
  const label = $('#launchReadinessLabel');
  const bar = $('#launchReadinessBar');
  const summary = $('#launchReadinessSummary');
  if (!list || !score || !label || !bar || !summary) return;

  const completed = items.filter(entry => entry.ok).length;
  const percentage = Math.round((completed / Math.max(items.length, 1)) * 100);
  const blockers = items.filter(entry => entry.critical && !entry.ok);
  const warnings = items.filter(entry => !entry.critical && !entry.ok);

  score.textContent = `${percentage}%`;
  bar.style.width = `${percentage}%`;
  label.textContent = blockers.length
    ? `${blockers.length} bloqueador(es)`
    : warnings.length
      ? 'Lançamento controlado possível'
      : 'Pronto para abrir';

  const fragment = document.createDocumentFragment();
  items.forEach(entry => {
    const card = document.createElement('article');
    card.className = `readiness-item ${entry.ok ? 'is-ready' : entry.critical ? 'is-blocker' : 'is-warning'}`;
    const icon = document.createElement('span');
    icon.className = 'readiness-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = entry.ok ? '✓' : entry.critical ? '!' : '•';
    const content = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = entry.label;
    const detail = document.createElement('p');
    detail.textContent = entry.detail;
    content.append(title, detail);
    card.append(icon, content);
    fragment.appendChild(card);
  });
  list.replaceChildren(fragment);

  summary.className = `readiness-summary ${blockers.length ? 'has-blockers' : 'is-ready'}`;
  summary.textContent = blockers.length
    ? `Não abra pagamentos reais ainda. Resolva primeiro: ${blockers.map(entry => entry.label).join(', ')}.`
    : warnings.length
      ? `Os bloqueadores principais foram resolvidos. Ainda há ${warnings.length} melhoria(s) recomendada(s).`
      : 'Checklist concluído. Faça uma compra real de baixo valor antes de divulgar a loja.';
}

async function refreshReadiness() {
  const card = $('#launchReadinessCard');
  if (!card || $('#adminPanel')?.hidden) return;

  try {
    const [productsResult, settingsResult, ordersResult, factorsResult] = await Promise.all([
      supabase.from('products').select('id,name,active,cost,price,pix_price,stock,image,preorder_enabled,preorder_limit,supplier_availability'),
      supabase.from('store_settings').select('*').eq('id', 1).single(),
      supabase.from('orders').select('id,status,total,fulfillment_status,archived_at,contains_preorder,contains_ready_stock'),
      supabase.auth.mfa.listFactors(),
    ]);
    if (productsResult.error) throw productsResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (ordersResult.error) throw ordersResult.error;
    if (factorsResult.error) throw factorsResult.error;

    const products = productsResult.data || [];
    const settings = settingsResult.data;
    const activeOrders = (ordersResult.data || []).filter(order => !order.archived_at);
    const approvedOrders = activeOrders.filter(order => order.status === 'Pagamento aprovado');
    const pendingOperations = activeOrders.filter(order => [
      'Novo pedido', 'Aguardando pedido ao fornecedor', 'Pedido realizado ao fornecedor',
      'Aguardando chegada do fornecedor', 'Em separação',
    ].includes(order.fulfillment_status));
    const allFactors = Array.isArray(factorsResult.data?.all) ? factorsResult.data.all : [];
    const mfaReady = allFactors.some(factor => factor.status === 'verified' && factor.factor_type === 'totp');

    if ($('#metricOrders')) $('#metricOrders').textContent = String(approvedOrders.length);
    if ($('#metricPending')) $('#metricPending').textContent = String(pendingOperations.length);
    if ($('#metricRevenue')) $('#metricRevenue').textContent = money.format(approvedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));

    const active = products.filter(product => product.active);
    const readyStockProducts = active.filter(product => Number(product.stock) > 0);
    const preorderProducts = active.filter(product => product.preorder_enabled && Number(product.preorder_limit) > 0);
    const sellable = active.filter(product => Number(product.price) > 0 && (
      Number(product.stock) > 0 || (product.preorder_enabled && Number(product.preorder_limit) > 0)
    ));
    const activeWithPrice = active.filter(product => Number(product.price) > 0);
    const activeWithImage = active.filter(product => hasText(product.image));
    const activeWithCost = active.filter(product => Number(product.cost) > 0);
    const supplierConfirmed = preorderProducts.filter(product => product.supplier_availability === 'Disponível no fornecedor');
    const supplierAvailabilityReady = preorderProducts.length === 0 || supplierConfirmed.length === preorderProducts.length;
    const supplierAvailabilityLabel = preorderProducts.length === 0
      ? 'Venda sob encomenda está desativada; o soft launch usa somente estoque de pronta entrega.'
      : `${supplierConfirmed.length} de ${preorderProducts.length} produto(s) sob encomenda têm disponibilidade confirmada na lista.`;
    const readyUnits = active.reduce((sum, product) => sum + Math.max(0, Number(product.stock || 0)), 0);
    const legalReady = hasText(settings.legal_name) && hasText(settings.tax_id);
    const contactReady = hasText(settings.business_address) && hasText(settings.email) && hasText(settings.whatsapp);
    const policiesReady = Boolean(settings.policies_updated_at);
    const shippingReady = ['pickup_only', 'manual_quote', 'automatic'].includes(settings.shipping_mode);
    const shippingLabel = settings.shipping_mode === 'automatic'
      ? 'Frete automático integrado.'
      : settings.shipping_mode === 'pickup_only'
        ? 'Operação limitada à retirada combinada em Macaé.'
        : 'Entrega somente após cotação manual, antes do pagamento.';

    if ($('#metricStock')) $('#metricStock').textContent = String(readyUnits);

    render([
      item('Autenticação em duas etapas', mfaReady, mfaReady ? 'Aplicativo autenticador verificado para a conta administrativa.' : 'Ative o aplicativo autenticador em Configurações.', true),
      item('Identificação do vendedor', legalReady, legalReady ? 'Nome legal e CPF/CNPJ preenchidos.' : 'Preencha nome legal e CPF/CNPJ em Configurações.', true),
      item('Endereço legal e canais online', contactReady, contactReady ? 'Endereço de correspondência, e-mail e WhatsApp disponíveis.' : 'Falta endereço legal para correspondência ou canal oficial.', true),
      item('Políticas revisadas', policiesReady, policiesReady ? `Revisadas em ${new Date(`${settings.policies_updated_at}T12:00:00`).toLocaleDateString('pt-BR')}.` : 'Defina a data da última revisão das políticas.', true),
      item('Procedência do fornecedor', Boolean(settings.supplier_docs_verified), settings.supplier_docs_verified ? 'Notas, lotes e procedência marcados como conferidos.' : 'Confirme e arquive documentos do fornecedor.', true),
      item('Produtos disponíveis para venda', sellable.length > 0, `${sellable.length} de ${active.length} produto(s) ativo(s) podem ser vendidos por pronta entrega ou encomenda.`, true),
      item('Disponibilidade do fornecedor', supplierAvailabilityReady, supplierAvailabilityLabel, true),
      item('Fotos do catálogo', active.length > 0 && activeWithImage.length === active.length, `${activeWithImage.length} de ${active.length} produto(s) ativo(s) têm foto oficial.`, true),
      item('Estoque de pronta entrega', true, `${readyStockProducts.length} produto(s), somando ${readyUnits} unidade(s), estão marcados para pronta entrega.`),
      item('Custos cadastrados', sellable.length > 0 && sellable.every(product => Number(product.cost) > 0), `${activeWithCost.length} de ${active.length} produto(s) ativo(s) têm custo registrado.`),
      item('Preços cadastrados', active.length > 0 && activeWithPrice.length === active.length, `${activeWithPrice.length} de ${active.length} produto(s) ativo(s) têm preço.`),
      item('Operação de entrega', shippingReady, shippingLabel, true),
      item('Pagamentos em produção', settings.payment_environment === 'production', settings.payment_environment === 'production' ? 'Painel marcado para credenciais produtivas.' : 'A loja continua no sandbox do Mercado Pago.', true),
      item('E-mails automáticos', Boolean(settings.email_notifications_enabled), settings.email_notifications_enabled ? 'Confirmações automáticas marcadas como testadas.' : 'Resumo e atualizações ainda não são enviados automaticamente.'),
      item('Status público da loja', settings.launch_status === 'live', settings.launch_status === 'live' ? 'Loja marcada como oficialmente aberta.' : 'Mantenha “Em preparação” até concluir os bloqueadores.'),
    ]);
  } catch (error) {
    console.error(error);
    const summary = $('#launchReadinessSummary');
    if (summary) {
      summary.className = 'readiness-summary has-blockers';
      summary.textContent = 'Não foi possível concluir a auditoria automática. Atualize os dados e tente novamente.';
    }
  }
}

function scheduleRefresh(delay = 500) {
  window.setTimeout(refreshReadiness, delay);
}

$('#refreshAdmin')?.addEventListener('click', () => scheduleRefresh(900));
$('#settingsForm')?.addEventListener('submit', () => scheduleRefresh(1600));
document.addEventListener('click', event => {
  if (event.target.closest('[data-save-product]')) scheduleRefresh(1800);
});

supabase.auth.onAuthStateChange(() => scheduleRefresh(800));
scheduleRefresh(900);
window.setTimeout(refreshReadiness, 2500);
