import { supabase } from '../assets/js/supabase.js';
import { money, showToast } from '../assets/js/store.js';

const login = document.querySelector('#adminLogin');
const panel = document.querySelector('#adminPanel');
const loginForm = document.querySelector('#loginForm');
const loginMessage = document.querySelector('#loginMessage');
const magicLinkButton = document.querySelector('#magicLinkButton');
const ADMIN_EMAIL = 'zoryvenaperfumes@gmail.com';

let state = { products: [], orders: [], customers: [], coupons: [], settings: null };

function message(text, error = false) {
  loginMessage.hidden = false;
  loginMessage.textContent = text;
  loginMessage.style.color = error ? 'var(--red)' : 'var(--green)';
}
function valueOrNull(value) { return value === '' || value == null ? null : Number(value); }
function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function formatDate(value) { return value ? new Date(value).toLocaleString('pt-BR') : '—'; }

async function isAuthorizedAdmin() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const { data, error } = await supabase.from('admin_users').select('user_id,email,active').eq('user_id', session.user.id).maybeSingle();
  if (error) throw error;
  if (!data?.active) return false;
  document.querySelector('#adminIdentity').textContent = `Conectado como ${data.email}`;
  return true;
}

async function initialize() {
  try {
    if (await isAuthorizedAdmin()) {
      login.hidden = true;
      panel.hidden = false;
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
  if (!password) return message('Informe a senha ou use “Receber link de acesso”.', true);
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await initialize();
  } catch (error) {
    message(error.message || 'Não foi possível entrar.', true);
  } finally { button.disabled = false; }
});

magicLinkButton.addEventListener('click', async () => {
  const formData = Object.fromEntries(new FormData(loginForm));
  const email = String(formData.email || '').trim().toLowerCase();
  const password = String(formData.password || '');
  if (email !== ADMIN_EMAIL) return message('Use o e-mail oficial da Zoryvena.', true);
  magicLinkButton.disabled = true;
  try {
    if (password.length >= 8) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${location.origin}/admin/` },
      });
      if (error) throw error;
      message('Cadastro solicitado. Confirme o e-mail enviado pelo Supabase e depois entre com a senha.');
    } else {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/admin/`, shouldCreateUser: true },
      });
      if (error) throw error;
      message('Link de acesso enviado. Confira a caixa de entrada e o spam.');
    }
  } catch (error) {
    message(error.message || 'Não foi possível enviar o acesso.', true);
  } finally { magicLinkButton.disabled = false; }
});

document.querySelector('#logoutAdmin').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});
document.querySelector('#refreshAdmin').addEventListener('click', loadAll);

document.querySelectorAll('[data-admin-tab]').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('[data-admin-tab]').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  document.querySelectorAll('.admin-view').forEach(view => view.hidden = true);
  document.querySelector(`#${button.dataset.adminTab}`).hidden = false;
}));

async function loadAll() {
  const refresh = document.querySelector('#refreshAdmin');
  if (refresh) refresh.disabled = true;
  try {
    const [productsResult, ordersResult, customersResult, couponsResult, settingsResult] = await Promise.all([
      supabase.from('products').select('*').order('rank'),
      supabase.from('orders').select('*').order('created_at', { ascending: false }),
      supabase.from('customers').select('*').order('created_at', { ascending: false }),
      supabase.from('coupons').select('*').order('created_at', { ascending: false }),
      supabase.from('store_settings').select('*').eq('id', 1).single(),
    ]);
    for (const result of [productsResult, ordersResult, customersResult, couponsResult, settingsResult]) if (result.error) throw result.error;
    state = {
      products: productsResult.data || [],
      orders: ordersResult.data || [],
      customers: customersResult.data || [],
      coupons: couponsResult.data || [],
      settings: settingsResult.data,
    };
    renderAll();
    document.querySelector('#lastRefresh').textContent = `Atualizado em ${new Date().toLocaleTimeString('pt-BR')}.`;
  } catch (error) {
    console.error(error); showToast(error.message || 'Erro ao carregar o painel.');
  } finally { if (refresh) refresh.disabled = false; }
}

function renderAll() { renderDashboard(); renderProducts(); renderOrders(); renderCustomers(); renderCoupons(); renderSettings(); }
function renderDashboard() {
  document.querySelector('#metricProducts').textContent = state.products.length;
  document.querySelector('#metricStock').textContent = state.products.reduce((sum, product) => sum + Number(product.stock || 0), 0);
  document.querySelector('#metricOrders').textContent = state.orders.length;
  document.querySelector('#metricRevenue').textContent = money.format(state.orders.filter(order => order.status !== 'Cancelado').reduce((sum, order) => sum + Number(order.total || 0), 0));
  document.querySelector('#lowStock').innerHTML = state.products.filter(product => product.active && Number(product.stock) <= Number(product.minimum_stock)).slice(0, 10).map(product => `<li><span>${escapeHtml(product.brand)} ${escapeHtml(product.name)}</span><strong>${product.stock} un.</strong></li>`).join('') || '<li>Nenhum alerta.</li>';
}
function renderProducts() {
  document.querySelector('#adminProductsBody').innerHTML = state.products.map(product => `<tr>
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
function renderOrders() {
  const statuses = ['Aguardando confirmação','Pagamento aprovado','Separando pedido','Enviado','Entregue','Cancelado'];
  document.querySelector('#adminOrdersBody').innerHTML = state.orders.length ? state.orders.map(order => `<tr><td>${escapeHtml(order.order_code)}</td><td>${formatDate(order.created_at)}</td><td>${escapeHtml(order.customer_name)}</td><td>${escapeHtml(order.customer_whatsapp)}</td><td>${money.format(Number(order.total || 0))}</td><td><select data-order-status="${order.id}">${statuses.map(status => `<option ${status === order.status ? 'selected' : ''}>${status}</option>`).join('')}</select></td></tr>`).join('') : '<tr><td colspan="6">Nenhum pedido registrado.</td></tr>';
}
function renderCustomers() {
  document.querySelector('#adminCustomersBody').innerHTML = state.customers.length ? state.customers.map(customer => `<tr><td>${escapeHtml(customer.name)}</td><td>${escapeHtml(customer.whatsapp)}</td><td>${escapeHtml(customer.email || '—')}</td><td>${formatDate(customer.created_at)}</td></tr>`).join('') : '<tr><td colspan="4">Nenhum cliente registrado.</td></tr>';
}
function renderCoupons() {
  document.querySelector('#couponList').innerHTML = state.coupons.length ? state.coupons.map(coupon => `<li><strong>${escapeHtml(coupon.code)}</strong><span>${coupon.type === 'percent' ? `${coupon.value}%` : money.format(Number(coupon.value))}</span><button data-delete-coupon="${coupon.id}">Excluir</button></li>`).join('') : '<li>Nenhum cupom.</li>';
}
function renderSettings() {
  const form = document.querySelector('#settingsForm');
  if (!state.settings) return;
  Object.entries(state.settings).forEach(([key, value]) => { if (form.elements[key]) form.elements[key].value = value ?? ''; });
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

document.addEventListener('click', async event => {
  const saveButton = event.target.closest('[data-save-product]');
  if (saveButton) {
    saveButton.disabled = true; const original = saveButton.textContent; saveButton.textContent = 'Salvando...';
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
      showToast('Produto atualizado.'); await loadAll();
    } catch (error) { console.error(error); showToast(error.message || 'Erro ao salvar produto.'); }
    finally { saveButton.disabled = false; saveButton.textContent = original; }
  }
  const deleteCoupon = event.target.closest('[data-delete-coupon]');
  if (deleteCoupon) {
    const { error } = await supabase.from('coupons').delete().eq('id', deleteCoupon.dataset.deleteCoupon);
    if (error) showToast(error.message); else { showToast('Cupom excluído.'); await loadAll(); }
  }
});

document.addEventListener('change', async event => {
  const status = event.target.closest('[data-order-status]');
  if (!status) return;
  const { error } = await supabase.from('orders').update({ status: status.value }).eq('id', status.dataset.orderStatus);
  if (error) showToast(error.message); else showToast('Status atualizado.');
});

document.querySelector('#couponForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  const { error } = await supabase.from('coupons').insert({ code: String(data.code).trim().toUpperCase(), type: data.type, value: Number(data.value), active: true });
  if (error) showToast(error.message); else { event.target.reset(); showToast('Cupom criado.'); await loadAll(); }
});
document.querySelector('#settingsForm').addEventListener('submit', async event => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.target));
  data.id = 1; data.free_shipping_from = valueOrNull(data.free_shipping_from);
  const { error } = await supabase.from('store_settings').upsert(data, { onConflict: 'id' });
  if (error) showToast(error.message); else { document.querySelector('#settingsSaved').hidden = false; setTimeout(() => document.querySelector('#settingsSaved').hidden = true, 2000); await loadAll(); }
});

supabase.auth.onAuthStateChange(() => initialize());
initialize();
