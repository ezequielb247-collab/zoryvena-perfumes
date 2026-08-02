import { BASE_PRODUCTS } from './products.js';
import { DEFAULT_CONFIG, KEYS } from './config.js';
import { supabase, mapProductRow, mapSettingsRow } from './supabase.js';

const REMOTE_PRODUCTS_KEY = 'zoryvena.remote-products.v1';
const REMOTE_CONFIG_KEY = 'zoryvena.remote-config.v1';

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

export function getConfig() {
  return { ...DEFAULT_CONFIG, ...load(KEYS.settings, {}), ...load(REMOTE_CONFIG_KEY, {}) };
}

export function getProducts() {
  const remote = load(REMOTE_PRODUCTS_KEY, null);
  if (Array.isArray(remote) && remote.length) return remote;
  const overrides = load(KEYS.productOverrides, {});
  return BASE_PRODUCTS.map(product => ({ ...product, ...(overrides[product.id] || {}) }));
}

export async function syncStoreData() {
  try {
    const [{ data: products, error: productError }, { data: settings, error: settingsError }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('rank', { ascending: true }),
      supabase.from('store_settings').select('*').eq('id', 1).maybeSingle(),
    ]);
    if (productError) throw productError;
    if (settingsError) throw settingsError;

    const mappedProducts = (products || []).map(mapProductRow);
    const mappedSettings = mapSettingsRow(settings);
    const previousProducts = JSON.stringify(load(REMOTE_PRODUCTS_KEY, []));
    const previousSettings = JSON.stringify(load(REMOTE_CONFIG_KEY, {}));
    const nextProducts = JSON.stringify(mappedProducts);
    const nextSettings = JSON.stringify(mappedSettings);

    save(REMOTE_PRODUCTS_KEY, mappedProducts);
    save(REMOTE_CONFIG_KEY, mappedSettings);
    const changed = previousProducts !== nextProducts || previousSettings !== nextSettings;
    window.dispatchEvent(new CustomEvent('zoryvena:data', { detail: { changed } }));
    return changed;
  } catch (error) {
    console.warn('Não foi possível sincronizar os dados da loja.', error);
    return false;
  }
}

export function getProduct(id) { return getProducts().find(product => product.id === id); }
export function isPriced(product) { return Number.isFinite(Number(product?.price)) && Number(product.price) > 0; }
export function isAvailable(product) { return isPriced(product) && Number(product.stock) > 0; }
export function priceText(product) { return isPriced(product) ? money.format(Number(product.price)) : 'Consulte o valor'; }
export function installmentText(product, installments = 3) {
  if (!isPriced(product)) return '';
  return `${installments}x de ${money.format(Number(product.price) / installments)} sem juros`;
}
export function pixPriceText(product) {
  const value = Number(product?.pixPrice);
  return Number.isFinite(value) && value > 0 ? `${money.format(value)} no Pix` : '';
}
export function availabilityText(product) {
  if (Number(product?.stock) > 0) return `${product.stock} em estoque`;
  return isPriced(product) ? 'Estoque sob consulta' : 'Consulte disponibilidade';
}
export function productUrl(product) { return `/produto/${product.id}/`; }
export function productImage(product) {
  if (!product?.image) return '';
  if (/^https?:\/\//i.test(product.image)) return product.image;
  return `/${product.image.replace(/^\//, '')}`;
}

export function getCart() { return load(KEYS.cart, []); }
export function saveCart(cart) { save(KEYS.cart, cart); window.dispatchEvent(new Event('zoryvena:state')); }
export function addToCart(product, quantity = 1) {
  if (!isAvailable(product)) return false;
  const cart = getCart();
  const item = cart.find(entry => entry.id === product.id);
  if (item) item.quantity = Math.min(Number(product.stock), item.quantity + quantity);
  else cart.push({ id: product.id, quantity });
  saveCart(cart); return true;
}
export function updateCart(id, quantity) {
  const product = getProduct(id); const cart = getCart(); const item = cart.find(entry => entry.id === id);
  if (!item || !product) return;
  item.quantity = Math.max(1, Math.min(Number(product.stock || 1), Number(quantity || 1)));
  saveCart(cart);
}
export function removeFromCart(id) { saveCart(getCart().filter(item => item.id !== id)); }
export function cartDetails() { return getCart().map(item => ({ ...item, product: getProduct(item.id) })).filter(item => item.product); }
export function productPriceForPayment(product, paymentMethod = 'card') {
  const pixPrice = Number(product?.pixPrice);
  if (paymentMethod === 'pix' && Number.isFinite(pixPrice) && pixPrice > 0) return pixPrice;
  return Number(product?.price || 0);
}
export function cartTotal(paymentMethod = 'card') {
  return cartDetails().reduce((total, item) => total + productPriceForPayment(item.product, paymentMethod) * item.quantity, 0);
}

export function getFavorites() { return load(KEYS.favorites, []); }
export function toggleFavorite(id) {
  const favorites = getFavorites(); const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  save(KEYS.favorites, next); window.dispatchEvent(new Event('zoryvena:state')); return next.includes(id);
}
export function getCompare() { return load(KEYS.compare, []); }
export function toggleCompare(id) {
  const selected = getCompare();
  if (selected.includes(id)) { const next = selected.filter(x => x !== id); save(KEYS.compare, next); window.dispatchEvent(new Event('zoryvena:state')); return { ok: true, selected: next }; }
  if (selected.length >= 3) return { ok: false, selected };
  const next = [...selected, id]; save(KEYS.compare, next); window.dispatchEvent(new Event('zoryvena:state')); return { ok: true, selected: next };
}
export function clearCompare() { save(KEYS.compare, []); window.dispatchEvent(new Event('zoryvena:state')); }

export function whatsappUrl(message) {
  const config = getConfig();
  const number = String(config.whatsapp || '').replace(/\D/g, '');
  const base = number && !String(config.whatsapp).includes('PREENCHER') ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}
export function productWhatsapp(product) { return whatsappUrl(`Olá! Gostaria de consultar o perfume ${product.brand} ${product.name} (${product.volume}).`); }

async function functionErrorMessage(error, fallback) {
  let details = error?.message || fallback;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      details = body?.error || details;
    }
  } catch { /* mantém a mensagem original */ }
  return details || fallback;
}

export async function createOrder(data) {
  const items = cartDetails().map(item => ({ id: item.id, quantity: item.quantity }));
  const paymentMethod = data.payment === 'pix' ? 'pix' : 'card';
  const { data: result, error } = await supabase.functions.invoke('create-order', {
    body: { customer: data, items, notes: data.notes || null, paymentMethod },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível iniciar o pagamento.'));
  if (result?.error) throw new Error(result.error);

  const order = {
    id: result.orderCode,
    databaseId: result.id,
    statusToken: result.statusToken || '',
    total: Number(result.total || 0),
    paymentMethod,
    paymentMode: result.paymentMode || paymentMethod,
    paymentUrl: result.paymentUrl || result.pix?.ticketUrl || '',
    preferenceId: result.preferenceId || '',
    mercadoPagoOrderId: result.mercadoPagoOrderId || '',
    paymentId: result.paymentId || '',
    pix: result.pix || null,
    environment: result.environment,
    createdAt: Date.now(),
    ...data,
  };
  sessionStorage.setItem('zoryvena.last-order', JSON.stringify(order));
  return order;
}

export async function getOrderStatus(order) {
  if (!order?.databaseId) throw new Error('Pedido inválido para acompanhamento.');
  const { data, error } = await supabase.functions.invoke('order-status', {
    body: {
      orderId: order.databaseId,
      statusToken: order.statusToken || '',
      email: order.email || '',
    },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível consultar o pedido.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getOrders() { return load(KEYS.orders, []); }
export function saveOrders(orders) { save(KEYS.orders, orders); }

export function showToast(message) {
  const toast = document.querySelector('.toast'); if (!toast) return;
  toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2800);
}
