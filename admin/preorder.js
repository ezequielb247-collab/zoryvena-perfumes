import { supabase } from '../assets/js/supabase.js';
import { showToast } from '../assets/js/store.js';

const PREORDER_STATUSES = [
  'Aguardando pedido ao fornecedor',
  'Pedido realizado ao fornecedor',
  'Aguardando chegada do fornecedor',
];

let products = new Map();
let orders = new Map();
let currentOrderId = '';
let refreshTimer;

function createElement(tag, attributes = {}, text = '') {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') element.className = value;
    else if (key === 'dataset') Object.assign(element.dataset, value);
    else if (key in element) element[key] = value;
    else element.setAttribute(key, value);
  });
  if (text) element.textContent = text;
  return element;
}

function ensureProductHeader() {
  const row = document.querySelector('#productsView table thead tr');
  if (!row || row.querySelector('[data-preorder-heading]')) return;
  const heading = createElement('th', { dataset: { preorderHeading: '' } }, 'Venda');
  const activeHeading = [...row.children].find(cell => cell.textContent.trim() === 'Ativo');
  row.insertBefore(heading, activeHeading || row.lastElementChild);
}

function preorderCell(productId, product) {
  const cell = createElement('td', { dataset: { preorderCell: productId } });
  const wrapper = createElement('div', { className: 'admin-form' });
  wrapper.style.gap = '6px';
  wrapper.style.minWidth = '180px';

  const checkboxLabel = createElement('label');
  checkboxLabel.style.display = 'flex';
  checkboxLabel.style.alignItems = 'center';
  checkboxLabel.style.gap = '8px';
  const checkbox = createElement('input', {
    type: 'checkbox',
    checked: Boolean(product?.preorder_enabled),
    dataset: { field: 'preorder_enabled', product: productId },
  });
  checkboxLabel.append(checkbox, document.createTextNode('Sob encomenda'));

  const limitLabel = createElement('label', {}, 'Limite por pedido');
  const limit = createElement('input', {
    type: 'number',
    min: 1,
    max: 100,
    step: 1,
    value: Math.max(1, Number(product?.preorder_limit || 1)),
    disabled: !product?.preorder_enabled,
    dataset: { field: 'preorder_limit', product: productId },
  });
  limitLabel.appendChild(limit);

  const supplier = createElement('small', {}, product?.supplier_availability || 'Disponibilidade do fornecedor não informada');
  supplier.style.maxWidth = '220px';

  checkbox.addEventListener('change', () => {
    limit.disabled = !checkbox.checked;
    if (checkbox.checked && Number(limit.value) < 1) limit.value = '1';
  });

  wrapper.append(checkboxLabel, limitLabel, supplier);
  cell.appendChild(wrapper);
  return cell;
}

function enhanceProductTable() {
  ensureProductHeader();
  document.querySelectorAll('#adminProductsBody tr').forEach(row => {
    const button = row.querySelector('[data-save-product]');
    const productId = String(button?.dataset.saveProduct || '');
    if (!productId || row.querySelector('[data-preorder-cell]')) return;
    const activeCell = row.querySelector('[data-field="active"]')?.closest('td');
    row.insertBefore(preorderCell(productId, products.get(productId)), activeCell || row.lastElementChild);
  });
}

function addPreorderOptions(select, order) {
  if (!select || !order?.contains_preorder) return;
  const selectedValue = order.fulfillment_status || select.value;
  PREORDER_STATUSES.forEach(status => {
    if ([...select.options].some(option => option.value === status || option.textContent === status)) return;
    const option = createElement('option', { value: status }, status);
    const separation = [...select.options].find(item => item.value === 'Em separação' || item.textContent === 'Em separação');
    select.insertBefore(option, separation || null);
  });
  if ([...select.options].some(option => option.value === selectedValue || option.textContent === selectedValue)) {
    select.value = selectedValue;
  }
}

function enhanceOrderStatuses() {
  document.querySelectorAll('[data-fulfillment-id]').forEach(select => {
    addPreorderOptions(select, orders.get(String(select.dataset.fulfillmentId || '')));
  });
  if (currentOrderId) addPreorderOptions(document.querySelector('#modalFulfillmentSelect'), orders.get(currentOrderId));
}

function enhance() {
  enhanceProductTable();
  enhanceOrderStatuses();
}

async function refreshData() {
  clearTimeout(refreshTimer);
  try {
    const [productResult, orderResult] = await Promise.all([
      supabase.from('products').select('id,preorder_enabled,preorder_limit,supplier_availability'),
      supabase.from('orders').select('id,contains_preorder,contains_ready_stock,fulfillment_status'),
    ]);
    if (productResult.error) throw productResult.error;
    if (orderResult.error) throw orderResult.error;
    products = new Map((productResult.data || []).map(product => [String(product.id), product]));
    orders = new Map((orderResult.data || []).map(order => [String(order.id), order]));
    enhance();
  } catch (error) {
    console.error('preorder panel enhancement failed', error);
    showToast('Não foi possível carregar os controles de encomenda agora.');
  }
}

const observer = new MutationObserver(() => enhance());
observer.observe(document.documentElement, { childList: true, subtree: true });

document.addEventListener('click', event => {
  const detail = event.target.closest('[data-order-detail]');
  if (detail) {
    currentOrderId = String(detail.dataset.orderDetail || '');
    window.setTimeout(enhanceOrderStatuses, 0);
    window.setTimeout(enhanceOrderStatuses, 120);
  }

  if (event.target.closest('#refreshAdmin') || event.target.closest('[data-save-product]')) {
    refreshTimer = window.setTimeout(refreshData, 1200);
  }
}, { capture: true });

supabase.auth.onAuthStateChange(() => {
  refreshTimer = window.setTimeout(refreshData, 500);
});

window.setTimeout(refreshData, 700);
window.setTimeout(refreshData, 2200);
