import { supabase } from '../assets/js/supabase.js';
import { money, showToast } from '../assets/js/store.js';

const $ = selector => document.querySelector(selector);
const login = $('#adminLogin');
const panel = $('#adminPanel');
const loginForm = $('#loginForm');
const loginMessage = $('#loginMessage');
const resetPasswordButton = $('#resetPasswordButton');
const passwordForm = $('#passwordForm');
const orderModal = $('#orderModal');
const ADMIN_EMAIL = 'zoryvenaperfumes@gmail.com';
const RESET_COOLDOWN_KEY = 'zoryvena.admin-reset-cooldown';

const fulfillmentOptions = [
  'Aguardando pagamento',
  'Novo pedido',
  'Em separação',
  'Pronto para retirada',
  'Enviado',
  'Entregue',
  'Cancelado',
];

let state = {
  products: [],
  orders: [],
  orderItems: [],
  customers: [],
  coupons: [],
  settings: null,
  selectedOrderId: null,
};

function message(text, error = false) {
  loginMessage.hidden = false;
  loginMessage.textContent = text;
  loginMessage.style.color = error ? 'var(--admin-red)' : 'var(--admin-green)';
}

function valueOrNull(value) {
  return value === '' || value == null ? null : Number(value);
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '—';
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${date.toLocaleDateString('pt-BR')}<small>${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>`;
}

function formatPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const local = digits.startsWith('55') ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || '—';
}

function whatsappUrl(value, orderCode = '') {
  const digits = String(value || '').replace(/\D/g, '');
  const number = digits.startsWith('55') ? digits : `55${digits}`;
  const text = orderCode ? `Olá! Estou entrando em contato sobre o pedido ${orderCode} da Zoryvena Perfumes.` : 'Olá! Aqui é da Zoryvena Perfumes.';
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function activateTab(viewId) {
  document.querySelectorAll('[data-admin-tab]').forEach(item => {
    item.classList.toggle('active', item.dataset.adminTab === viewId);
  });
  document.querySelectorAll('.admin-view').forEach(view => {
    view.hidden = view.id !== viewId;
  });
  const hashMap = {
    dashboardView: 'dashboard', productsView: 'produtos', ordersView: 'pedidos',
    customersView: 'clientes', couponsView: 'cupons', settingsView: 'configuracoes',
  };
  history.replaceState(null, '', `#${hashMap[viewId] || 'dashboard'}`);
}

function viewFromHash() {
  const map = {
    dashboard: 'dashboardView', produtos: 'productsView', pedidos: 'ordersView',
    clientes: 'customersView', cupons: 'couponsView', configuracoes: 'settingsView',
  };
  return map[location.hash.replace('#', '')] || 'dashboardView';
}

function paymentClass(status = '') {
  if (status === 'Pagamento aprovado') return 'status-paid';
  if (status === 'Pagamento em análise') return 'status-analysis';
  if (['Pagamento recusado', 'Cancelado', 'Reembolsado', 'Erro ao gerar pagamento'].includes(status)) return 'status-rejected';
  return 'status-pending';
}

function fulfillmentClass(status = '') {
  if (status === 'Entregue') return 'status-paid';
  if (['Enviado', 'Pronto para retirada'].includes(status)) return 'status-analysis';
  if (status === 'Cancelado') return 'status-cancelled';
  if (['Novo pedido', 'Em separação'].includes(status)) return 'status-pending';
  return 'status-neutral';
}

function statusBadge(text, cssClass) {
  return `<span class="status-badge ${cssClass}">${escapeHtml(text || 'Não informado')}</span>`;
}

function paymentMethodLabel(order) {
  return order.payment_method === 'pix' ? 'Pix' : 'Cartão de crédito';
}

function isApproved(order) {
  return order.status === 'Pagamento aprovado';
}

function deliveryType(order) {
  if (order.address?.delivery === 'pickup') return 'pickup';
  return order.address?.street ? 'shipping' : 'pickup';
}

function formatAddress(order) {
  if (deliveryType(order) === 'pickup') return 'Retirada em Macaé — local e horário combinados com o cliente.';
  const address = order.address || {};
  const street = [address.street, address.number].filter(Boolean).join(', ');
  const neighborhood = address.neighborhood || '';
  const city = [address.city, address.state].filter(Boolean).join(' / ');
  const cep = address.cep ? `CEP ${address.cep}` : '';
  const complement = address.complement ? `Complemento: ${address.complement}` : '';
  return [street, neighborhood, city, cep, complement].filter(Boolean).join(' · ') || 'Endereço não informado.';
}

async function isAuthorizedAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { data, error } = await supabase.from('admin_users')
    .select('user_id,email,active')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data?.active) return false;
  $('#adminIdentity').textContent = `Conectado como ${data.email}`;
  return true;
}

async function initialize() {
  try {
    if (await isAuthorizedAdmin()) {
      login.hidden = true;
      panel.hidden = false;
      activateTab(viewFromHash());
      await loadAll();
    } else {
      login.hidden = false;
      panel.hidden = true;
    }
  } catch (error) {
    console.error(error);
    message('Não foi possível validar o acesso administrativo.', true);
  }
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(loginForm));
  const email = String(formData.email || '').trim().toLowerCase();
  const password = String(formData.password || '');
  if (email !== ADMIN_EMAIL) return message('Use o e-mail oficial da Zoryvena.', true);
  if (password.length < 8) return message('A senha precisa ter pelo menos 8 caracteres.', true);
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await initialize();
  } catch (error) {
    message(error.message || 'Não foi possível entrar.', true);
  } finally {
    button.disabled = false;
  }
});

resetPasswordButton.addEventListener('click', async () => {
  const cooldownUntil = Number(localStorage.getItem(RESET_COOLDOWN_KEY) || 0);
  if (Date.now() < cooldownUntil) {
    const minutes = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 60000));
    return message(`Aguarde cerca de ${minutes} minuto(s) antes de solicitar outro e-mail.`, true);
  }

  resetPasswordButton.disabled = true;
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(ADMIN_EMAIL, {
      redirectTo: `${location.origin}/admin/`,
    });
    if (error) throw error;
    localStorage.setItem(RESET_COOLDOWN_KEY, String(Date.now() + 60000));
    message('E-mail de redefinição enviado. Ao abrir o link, vá em Configurações → Senha administrativa.');
  } catch (error) {
    const detail = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
    if (detail.includes('rate') || detail.includes('429') || detail.includes('over_email_send_rate_limit')) {
      localStorage.setItem(RESET_COOLDOWN_KEY, String(Date.now() + 60 * 60 * 1000));
      message('Limite temporário de e-mails atingido. Aguarde cerca de 1 hora e tente novamente apenas uma vez.', true);
    } else {
      message(error.message || 'Não foi possível enviar a redefinição.', true);
    }
  } finally {
    resetPasswordButton.disabled = false;
  }
});

$('#logoutAdmin').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

$('#refreshAdmin').addEventListener('click', loadAll);
document.querySelectorAll('[data-admin-tab]').forEach(button => {
  button.addEventListener('click', () => activateTab(button.dataset.adminTab));
});

async function loadAll() {
  const refresh = $('#refreshAdmin');
  if (refresh) refresh.disabled = true;
  try {
    const [productsResult, ordersResult, orderItemsResult, customersResult, couponsResult, settingsResult] = await Promise.all([
      supabase.from('products').select('*').order('rank'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('order_items').select('*').order('created_at'),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
      supabase.from('store_settings').select('*').eq('id', 1).single(),
    ]);
    for (const result of [productsResult, ordersResult, orderItemsResult, customersResult, couponsResult, settingsResult]) {
      if (result.error) throw result.error;
    }
    state = {
      ...state,
      products: productsResult.data || [],
      orders: ordersResult.data || [],
      orderItems: orderItemsResult.data || [],
      customers: customersResult.data || [],
      coupons: couponsResult.data || [],
      settings: settingsResult.data,
    };
    renderAll();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Erro ao carregar o painel.');
  } finally {
    if (refresh) refresh.disabled = false;
  }
}

function renderAll() {
  renderDashboard();
  renderProducts();
  renderOrders();
  renderCustomers();
  renderCoupons();
  renderSettings();
}

function renderDashboard() {
  const activeProducts = state.products.filter(product => product.active);
  const approvedOrders = state.orders.filter(isApproved);
  const newOrders = state.orders.filter(order => !order.archived_at && ['Novo pedido', 'Em separação'].includes(order.fulfillment_status));
  $('#metricProducts').textContent = activeProducts.length;
  $('#metricStock').textContent = activeProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  $('#metricOrders').textContent = approvedOrders.length;
  $('#metricPending').textContent = newOrders.length;
  $('#metricRevenue').textContent = money.format(approvedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0));

  $('#lowStock').innerHTML = activeProducts
    .filter(product => Number(product.stock) <= Number(product.minimum_stock))
    .slice(0, 10)
    .map(product => `<li><span>${escapeHtml(product.brand)} ${escapeHtml(product.name)}</span><strong>${product.stock} un.</strong></li>`)
    .join('') || '<li><span>Nenhum alerta de estoque.</span></li>';

  $('#recentOrders').innerHTML = state.orders
    .filter(order => !order.archived_at)
    .slice(0, 6)
    .map(order => `<li><button class="order-code-button" data-order-detail="${order.id}">${escapeHtml(order.order_code)}</button><span>${statusBadge(order.status, paymentClass(order.status))}</span></li>`)
    .join('') || '<li><span>Nenhum pedido registrado.</span></li>';
}

function renderProducts() {
  $('#adminProductsBody').innerHTML = state.products.map(product => `<tr>
    <td>${escapeHtml(product.sku)}</td>
    <td><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.brand)}</small></td>
    <td><input type="number" step="0.01" min="0" data-field="cost" data-product="${product.id}" value="${product.cost ?? ''}" placeholder="0,00"></td>
    <td><input type="number" step="0.01" min="0" data-field="price" data-product="${product.id}" value="${product.price ?? ''}" placeholder="0,00"></td>
    <td><input type="number" step="0.01" min="0" data-field="pix_price" data-product="${product.id}" value="${product.pix_price ?? ''}" placeholder="0,00"></td>
    <td><input type="number" min="0" data-field="stock" data-product="${product.id}" value="${product.stock ?? 0}"></td>
    <td><input type="number" min="0" data-field="minimum_stock" data-product="${product.id}" value="${product.minimum_stock ?? 0}"></td>
    <td><input data-field="image" data-product="${product.id}" value="${escapeHtml(product.image ?? '')}" placeholder="URL da imagem"><input type="file" accept="image/png,image/jpeg,image/webp" data-file-product="${product.id}"></td>
    <td><input type="checkbox" data-field="active" data-product="${product.id}" ${product.active ? 'checked' : ''}></td>
    <td><button class="small-button" data-save-product="${product.id}">Salvar</button></td>
  </tr>`).join('');
}

function filteredOrders() {
  const search = String($('#orderSearch')?.value || '').trim().toLowerCase();
  const paymentFilter = $('#orderPaymentFilter')?.value || 'all';
  const fulfillmentFilter = $('#orderFulfillmentFilter')?.value || 'all';
  const archiveFilter = $('#orderArchiveFilter')?.value || 'active';

  return state.orders.filter(order => {
    const searchContent = [order.order_code, order.customer_name, order.customer_email, order.customer_whatsapp]
      .join(' ').toLowerCase();
    if (search && !searchContent.includes(search)) return false;

    if (paymentFilter === 'approved' && !isApproved(order)) return false;
    if (paymentFilter === 'pending' && !['Aguardando pagamento', 'Aguardando confirmação', 'Pagamento em análise'].includes(order.status)) return false;
    if (paymentFilter === 'rejected' && !['Pagamento recusado', 'Cancelado', 'Reembolsado', 'Erro ao gerar pagamento'].includes(order.status)) return false;
    if (fulfillmentFilter !== 'all' && order.fulfillment_status !== fulfillmentFilter) return false;
    if (archiveFilter === 'active' && order.archived_at) return false;
    if (archiveFilter === 'archived' && !order.archived_at) return false;
    return true;
  });
}

function fulfillmentOptionsFor(order) {
  if (isApproved(order)) return fulfillmentOptions.filter(option => option !== 'Aguardando pagamento');
  return ['Aguardando pagamento', 'Cancelado'];
}

function renderOrders() {
  const orders = filteredOrders();
  $('#ordersCount').textContent = `${orders.length} pedido(s) exibido(s)`;
  $('#adminOrdersBody').innerHTML = orders.length ? orders.map(order => {
    const options = fulfillmentOptionsFor(order);
    const currentStatus = options.includes(order.fulfillment_status) ? order.fulfillment_status : options[0];
    return `<tr class="${order.archived_at ? 'archived-order' : ''}">
      <td><button class="order-code-button" data-order-detail="${order.id}">${escapeHtml(order.order_code)}</button>${order.archived_at ? '<small>Arquivado</small>' : ''}</td>
      <td>${formatShortDate(order.created_at)}</td>
      <td><strong>${escapeHtml(order.customer_name)}</strong><small>${escapeHtml(order.customer_email || 'Sem e-mail')}</small></td>
      <td><strong>${money.format(Number(order.total || 0))}</strong><small>${paymentMethodLabel(order)}</small></td>
      <td>${statusBadge(order.status, paymentClass(order.status))}</td>
      <td><select class="fulfillment-select" data-fulfillment-id="${order.id}" ${order.archived_at ? 'disabled' : ''}>${options.map(option => `<option ${option === currentStatus ? 'selected' : ''}>${option}</option>`).join('')}</select></td>
      <td><div class="table-actions"><button class="table-button primary" data-order-detail="${order.id}">Detalhes</button><a class="table-button whatsapp-link" href="${whatsappUrl(order.customer_whatsapp, order.order_code)}" target="_blank" rel="noopener noreferrer">WhatsApp</a></div></td>
    </tr>`;
  }).join('') : '<tr><td class="empty-table" colspan="7">Nenhum pedido corresponde aos filtros selecionados.</td></tr>';
}

function renderCustomers() {
  $('#adminCustomersBody').innerHTML = state.customers.length ? state.customers.map(customer => `<tr>
    <td><strong>${escapeHtml(customer.name)}</strong></td>
    <td><a class="whatsapp-link" href="${whatsappUrl(customer.whatsapp)}" target="_blank" rel="noopener noreferrer">${escapeHtml(formatPhone(customer.whatsapp))}</a></td>
    <td><a href="mailto:${escapeHtml(customer.email || '')}">${escapeHtml(customer.email || '—')}</a></td>
    <td>${formatDate(customer.created_at)}</td>
  </tr>`).join('') : '<tr><td class="empty-table" colspan="4">Nenhum cliente registrado.</td></tr>';
}

function renderCoupons() {
  $('#couponList').innerHTML = state.coupons.length ? state.coupons.map(coupon => `<li><strong>${escapeHtml(coupon.code)}</strong><span>${coupon.type === 'percent' ? `${coupon.value}%` : money.format(Number(coupon.value))}</span><button class="small-button" data-delete-coupon="${coupon.id}">Excluir</button></li>`).join('') : '<li><span>Nenhum cupom criado.</span></li>';
}

function renderSettings() {
  const form = $('#settingsForm');
  if (!state.settings) return;
  Object.entries(state.settings).forEach(([key, value]) => {
    if (form.elements[key]) form.elements[key].value = value ?? '';
  });
}

async function uploadProductImage(productId, file) {
  if (!file) return null;
  const extension = (file.name.split('.').pop() || 'webp').toLowerCase().replace(/[^a-z0-9]/g, '');
  const path = `${productId}/${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from('product-images').upload(path, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`;
}

function openOrderDetails(orderId) {
  const order = state.orders.find(item => item.id === orderId);
  if (!order) return;
  state.selectedOrderId = orderId;
  const items = state.orderItems.filter(item => item.order_id === orderId);

  $('#modalOrderCode').textContent = order.order_code;
  $('#modalPaymentStatus').outerHTML = statusBadge(order.status, paymentClass(order.status)).replace('<span ', '<span id="modalPaymentStatus" ');
  $('#modalFulfillmentStatus').outerHTML = statusBadge(order.fulfillment_status, fulfillmentClass(order.fulfillment_status)).replace('<span ', '<span id="modalFulfillmentStatus" ');

  $('#modalCustomerDetails').innerHTML = [
    detailRow('Nome', escapeHtml(order.customer_name)),
    detailRow('WhatsApp', `<a class="whatsapp-link" href="${whatsappUrl(order.customer_whatsapp, order.order_code)}" target="_blank" rel="noopener noreferrer">${escapeHtml(formatPhone(order.customer_whatsapp))}</a>`),
    detailRow('E-mail', `<a href="mailto:${escapeHtml(order.customer_email || '')}">${escapeHtml(order.customer_email || '—')}</a>`),
    detailRow('Data do pedido', escapeHtml(formatDate(order.created_at))),
  ].join('');

  const installmentText = order.payment_method === 'card'
    ? (order.payment_installments ? `${order.payment_installments}x` : 'Parcelas não registradas neste teste')
    : 'À vista';
  $('#modalPaymentDetails').innerHTML = [
    detailRow('Forma', escapeHtml(paymentMethodLabel(order))),
    detailRow('Parcelamento', escapeHtml(installmentText)),
    detailRow('Subtotal', money.format(Number(order.subtotal || 0))),
    detailRow('Frete', Number(order.shipping || 0) > 0 ? money.format(Number(order.shipping)) : 'Não cobrado'),
    detailRow('Desconto', Number(order.discount || 0) > 0 ? money.format(Number(order.discount)) : '—'),
    detailRow('Total', money.format(Number(order.total || 0))),
    detailRow('Status', escapeHtml(order.status)),
  ].join('');

  const deliveryLabel = deliveryType(order) === 'pickup' ? 'Retirada em Macaé' : 'Entrega no endereço';
  $('#modalDeliveryDetails').innerHTML = [
    detailRow('Modalidade', escapeHtml(deliveryLabel)),
    detailRow('Endereço', escapeHtml(formatAddress(order))),
  ].join('');

  $('#modalOrderItems').innerHTML = items.length ? items.map(item => `<div class="order-item-line">
    <div><strong>${escapeHtml(item.brand)} ${escapeHtml(item.product_name)}</strong><small>${escapeHtml(item.sku || item.product_id)}</small></div>
    <strong>${item.quantity} un.</strong>
    <strong>${money.format(Number(item.line_total || Number(item.unit_price) * Number(item.quantity)))}</strong>
  </div>`).join('') : '<p>Nenhum item encontrado.</p>';

  $('#modalCustomerNotes').textContent = order.notes || 'Nenhuma observação do cliente.';
  const modalSelect = $('#modalFulfillmentSelect');
  modalSelect.innerHTML = fulfillmentOptionsFor(order).map(option => `<option ${option === order.fulfillment_status ? 'selected' : ''}>${option}</option>`).join('');
  $('#modalAdminNotes').value = order.admin_notes || '';
  $('#toggleOrderArchive').textContent = order.archived_at ? 'Restaurar pedido' : 'Arquivar pedido';
  orderModal.showModal();
}

async function updateOrderManagement(order, fulfillmentStatus, notes, archived = null) {
  const { error } = await supabase.rpc('update_order_fulfillment', {
    p_order_id: order.id,
    p_fulfillment_status: fulfillmentStatus,
    p_admin_notes: notes || null,
    p_archived: archived,
  });
  if (error) throw error;
}

document.addEventListener('click', async event => {
  const saveButton = event.target.closest('[data-save-product]');
  if (saveButton) {
    saveButton.disabled = true;
    const original = saveButton.textContent;
    saveButton.textContent = 'Salvando...';
    try {
      const id = saveButton.dataset.saveProduct;
      const patch = {};
      document.querySelectorAll(`[data-product="${id}"]`).forEach(input => {
        if (input.dataset.field === 'active') patch.active = input.checked;
        else if (input.dataset.field === 'image') patch.image = input.value.trim() || null;
        else patch[input.dataset.field] = valueOrNull(input.value);
      });
      const file = document.querySelector(`[data-file-product="${id}"]`)?.files?.[0];
      const uploadedUrl = await uploadProductImage(id, file);
      if (uploadedUrl) patch.image = uploadedUrl;
      patch.status = patch.price > 0 && patch.stock > 0 ? 'Disponível' : 'Preço e estoque a confirmar';
      const { error } = await supabase.from('products').update(patch).eq('id', id);
      if (error) throw error;
      showToast('Produto atualizado.');
      await loadAll();
    } catch (error) {
      console.error(error);
      showToast(error.message || 'Erro ao salvar produto.');
    } finally {
      saveButton.disabled = false;
      saveButton.textContent = original;
    }
    return;
  }

  const detailButton = event.target.closest('[data-order-detail]');
  if (detailButton) {
    openOrderDetails(detailButton.dataset.orderDetail);
    return;
  }

  const deleteCoupon = event.target.closest('[data-delete-coupon]');
  if (deleteCoupon) {
    const { error } = await supabase.from('coupons').delete().eq('id', deleteCoupon.dataset.deleteCoupon);
    if (error) showToast(error.message);
    else {
      showToast('Cupom excluído.');
      await loadAll();
    }
  }
});

document.addEventListener('change', async event => {
  const select = event.target.closest('[data-fulfillment-id]');
  if (!select) return;
  const order = state.orders.find(item => item.id === select.dataset.fulfillmentId);
  if (!order) return;
  select.disabled = true;
  try {
    await updateOrderManagement(order, select.value, order.admin_notes || '', null);
    showToast('Andamento do pedido atualizado.');
    await loadAll();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível atualizar o pedido.');
    renderOrders();
  } finally {
    select.disabled = false;
  }
});

['orderSearch', 'orderPaymentFilter', 'orderFulfillmentFilter', 'orderArchiveFilter'].forEach(id => {
  $(`#${id}`).addEventListener(id === 'orderSearch' ? 'input' : 'change', renderOrders);
});

$('#closeOrderModal').addEventListener('click', () => orderModal.close());
orderModal.addEventListener('click', event => {
  if (event.target === orderModal) orderModal.close();
});

$('#saveOrderManagement').addEventListener('click', async () => {
  const order = state.orders.find(item => item.id === state.selectedOrderId);
  if (!order) return;
  const button = $('#saveOrderManagement');
  button.disabled = true;
  try {
    await updateOrderManagement(order, $('#modalFulfillmentSelect').value, $('#modalAdminNotes').value, null);
    showToast('Gestão do pedido salva.');
    await loadAll();
    openOrderDetails(order.id);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível salvar o pedido.');
  } finally {
    button.disabled = false;
  }
});

$('#toggleOrderArchive').addEventListener('click', async () => {
  const order = state.orders.find(item => item.id === state.selectedOrderId);
  if (!order) return;
  const shouldArchive = !order.archived_at;
  if (shouldArchive && !confirm(`Arquivar o pedido ${order.order_code}? Ele continuará salvo e poderá ser restaurado.`)) return;
  const button = $('#toggleOrderArchive');
  button.disabled = true;
  try {
    await updateOrderManagement(order, $('#modalFulfillmentSelect').value, $('#modalAdminNotes').value, shouldArchive);
    orderModal.close();
    showToast(shouldArchive ? 'Pedido arquivado.' : 'Pedido restaurado.');
    await loadAll();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível alterar o arquivamento.');
  } finally {
    button.disabled = false;
  }
});

$('#archiveUnpaidOrders').addEventListener('click', async () => {
  const ids = state.orders
    .filter(order => !order.archived_at && !isApproved(order) && order.fulfillment_status === 'Aguardando pagamento')
    .map(order => order.id);
  if (!ids.length) return showToast('Não há tentativas não pagas para arquivar.');
  if (!confirm(`Arquivar ${ids.length} tentativa(s) sem pagamento? Os registros não serão apagados.`)) return;
  const button = $('#archiveUnpaidOrders');
  button.disabled = true;
  try {
    const { error } = await supabase.from('orders').update({ archived_at: new Date().toISOString() }).in('id', ids);
    if (error) throw error;
    showToast(`${ids.length} tentativa(s) arquivada(s).`);
    await loadAll();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível arquivar os pedidos.');
  } finally {
    button.disabled = false;
  }
});

$('#couponForm').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.from('coupons').insert({
    code: String(data.code).trim().toUpperCase(),
    type: data.type,
    value: Number(data.value),
    active: true,
  });
  if (error) showToast(error.message);
  else {
    event.target.reset();
    showToast('Cupom criado.');
    await loadAll();
  }
});

$('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  data.id = 1;
  data.free_shipping_from = valueOrNull(data.free_shipping_from);
  const { error } = await supabase.from('store_settings').upsert(data, { onConflict: 'id' });
  if (error) showToast(error.message);
  else {
    $('#settingsSaved').hidden = false;
    setTimeout(() => { $('#settingsSaved').hidden = true; }, 2000);
    showToast('Configurações salvas.');
    await loadAll();
  }
});

passwordForm.addEventListener('submit', async event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(passwordForm));
  const password = String(data.newPassword || '');
  const confirmation = String(data.confirmPassword || '');
  if (password.length < 8) return showToast('A nova senha precisa ter pelo menos 8 caracteres.');
  if (password !== confirmation) return showToast('As senhas não coincidem.');
  const button = passwordForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    passwordForm.reset();
    $('#passwordSaved').hidden = false;
    setTimeout(() => { $('#passwordSaved').hidden = true; }, 2500);
    showToast('Senha administrativa atualizada.');
  } catch (error) {
    showToast(error.message || 'Não foi possível atualizar a senha.');
  } finally {
    button.disabled = false;
  }
});

supabase.auth.onAuthStateChange(event => {
  initialize().then(() => {
    if (event === 'PASSWORD_RECOVERY') {
      activateTab('settingsView');
      showToast('Defina a nova senha em “Senha administrativa”.');
      setTimeout(() => passwordForm?.elements?.newPassword?.focus(), 200);
    }
  });
});

initialize();