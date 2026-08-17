import { DEFAULT_CONFIG, KEYS } from './config.js';
import { supabase, mapProductRow, mapSettingsRow } from './supabase.js';
import {
  parseCollectionCache,
  maximumPurchasable,
  isSellableProduct,
  reconcileCartItems,
  reconcileProductIds,
} from './storefront-safety.mjs';

const REMOTE_PRODUCTS_KEY = 'zoryvena.remote-products.v1';
const REMOTE_CONFIG_KEY = 'zoryvena.remote-config.v1';
const ALLOWED_IMAGE_HOSTS = new Set([
  location.host,
  'ajyultndtauabfufrmfr.supabase.co',
  'images.tcdn.com.br',
  'orientalaromas.com',
  'zaoud.it',
  'media.zid.store',
  'lattafa-brasil.com',
  'armaf.com',
  'www.justmylook.com',
  'd2r9epyceweg5n.cloudfront.net',
  'www.aarfragrances.com',
  'mimadaconsentida.com',
  'www.tradeinn.com',
  'perfumemarket.fr',
  'www.haarspullen.nl',
  'acdn-us.mitiendanube.com',
  'cdn11.bigcommerce.com',
  'media.douglas.de',
  'opulensi.com',
]);

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function catalogCache() {
  return parseCollectionCache(localStorage.getItem(REMOTE_PRODUCTS_KEY));
}

function differs(a, b) {
  return JSON.stringify(a) !== JSON.stringify(b);
}

function reconcileStoredState(products) {
  const currentCart = load(KEYS.cart, []);
  const currentFavorites = load(KEYS.favorites, []);
  const currentCompare = load(KEYS.compare, []);
  const nextCart = reconcileCartItems(currentCart, products);
  const nextFavorites = reconcileProductIds(currentFavorites, products);
  const nextCompare = reconcileProductIds(currentCompare, products, 3);
  let changed = false;

  if (differs(currentCart, nextCart)) {
    save(KEYS.cart, nextCart);
    changed = true;
  }
  if (differs(currentFavorites, nextFavorites)) {
    save(KEYS.favorites, nextFavorites);
    changed = true;
  }
  if (differs(currentCompare, nextCompare)) {
    save(KEYS.compare, nextCompare);
    changed = true;
  }
  return changed;
}

export function getConfig() {
  return { ...DEFAULT_CONFIG, ...load(KEYS.settings, {}), ...load(REMOTE_CONFIG_KEY, {}) };
}

export function getProducts() {
  const cache = catalogCache();
  return cache.present ? cache.values : [];
}

export async function syncStoreData() {
  try {
    const [{ data: products, error: productError }, { data: settingsRows, error: settingsError }] = await Promise.all([
      supabase.rpc('get_storefront_products'),
      supabase.rpc('get_storefront_settings'),
    ]);
    if (productError) throw productError;
    if (settingsError) throw settingsError;

    const mappedProducts = (products || []).map(mapProductRow);
    const mappedSettings = mapSettingsRow(Array.isArray(settingsRows) ? settingsRows[0] : settingsRows);
    const previousProducts = getProducts();
    const previousSettings = load(REMOTE_CONFIG_KEY, {});

    save(REMOTE_PRODUCTS_KEY, mappedProducts);
    save(REMOTE_CONFIG_KEY, mappedSettings);

    const stateChanged = reconcileStoredState(mappedProducts);
    const changed = differs(previousProducts, mappedProducts) || differs(previousSettings, mappedSettings);
    if (stateChanged) window.dispatchEvent(new Event('zoryvena:state'));
    window.dispatchEvent(new CustomEvent('zoryvena:data', { detail: { changed, stateChanged } }));
    return changed || stateChanged;
  } catch {
    const hasCache = catalogCache().present;
    console.warn('Não foi possível sincronizar os dados públicos da loja.');
    window.dispatchEvent(new CustomEvent('zoryvena:data-error', { detail: { hasCache } }));
    return false;
  }
}

export function getProduct(id) { return getProducts().find(product => product.id === id); }
export function isPriced(product) { return Number.isFinite(Number(product?.price)) && Number(product.price) > 0; }
export function readyStock(product) { return Math.max(0, Math.trunc(Number(product?.stock || 0))); }
export function preorderCapacity(product) {
  return product?.preorderEnabled ? Math.max(0, Math.trunc(Number(product?.preorderLimit || 0))) : 0;
}
export function maxPurchasableQuantity(product) { return maximumPurchasable(product); }
export function isAvailable(product) { return isSellableProduct(product); }
export function requiresPreorder(product, quantity = 1) {
  return Math.max(1, Number(quantity || 1)) > readyStock(product) && preorderCapacity(product) > 0;
}
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
  const stock = readyStock(product);
  const preorder = preorderCapacity(product);
  if (stock > 0 && preorder > 0) {
    return stock === 1
      ? '1 unidade à pronta entrega · também disponível sob encomenda'
      : `${stock} unidades à pronta entrega · também disponível sob encomenda`;
  }
  if (stock > 0) return stock === 1 ? '1 unidade à pronta entrega' : `${stock} unidades à pronta entrega`;
  if (preorder > 0) return 'Sob encomenda · pedido ao fornecedor após o pagamento';
  return isPriced(product) ? 'Indisponível no momento' : 'Consulte disponibilidade';
}
export function productUrl(product) {
  const id = String(product?.id || '');
  return /^[a-z0-9-]{1,120}$/i.test(id) ? `/produto/${id}/` : '/catalogo.html';
}
export function productImage(product) {
  const raw = String(product?.image || '').trim();
  if (!raw) return '';
  if (!/^https?:\/\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, '');
    return clean && !clean.includes('..') ? `/${clean}` : '';
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !ALLOWED_IMAGE_HOSTS.has(url.host)) return '';
    if (url.host === 'ajyultndtauabfufrmfr.supabase.co' && !url.pathname.startsWith('/storage/v1/object/public/product-images/')) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function getCart() { return load(KEYS.cart, []); }
export function saveCart(cart) { save(KEYS.cart, cart); window.dispatchEvent(new Event('zoryvena:state')); }
export function addToCart(product, quantity = 1) {
  if (!isAvailable(product)) return false;
  const maximum = maxPurchasableQuantity(product);
  const cart = getCart();
  const item = cart.find(entry => entry.id === product.id);
  if (item) item.quantity = Math.min(maximum, Math.max(1, Number(item.quantity || 1) + Number(quantity || 1)));
  else cart.push({ id: product.id, quantity: Math.min(maximum, Math.max(1, Number(quantity || 1))) });
  saveCart(cart);
  return true;
}
export function updateCart(id, quantity) {
  const product = getProduct(id);
  const cart = getCart();
  const item = cart.find(entry => entry.id === id);
  if (!item || !product || !isAvailable(product)) return;
  const maximum = Math.max(1, maxPurchasableQuantity(product));
  item.quantity = Math.max(1, Math.min(maximum, Number(quantity || 1)));
  saveCart(cart);
}
export function removeFromCart(id) { saveCart(getCart().filter(item => item.id !== id)); }
export function cartDetails() {
  const products = new Map(getProducts().map(product => [product.id, product]));
  return getCart()
    .map(item => ({ ...item, product: products.get(item.id) }))
    .filter(item => item.product && isAvailable(item.product));
}
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
  const favorites = getFavorites();
  const next = favorites.includes(id) ? favorites.filter(value => value !== id) : [...favorites, id];
  save(KEYS.favorites, next);
  window.dispatchEvent(new Event('zoryvena:state'));
  return next.includes(id);
}
export function getCompare() { return load(KEYS.compare, []); }
export function toggleCompare(id) {
  const selected = getCompare();
  if (selected.includes(id)) {
    const next = selected.filter(value => value !== id);
    save(KEYS.compare, next);
    window.dispatchEvent(new Event('zoryvena:state'));
    return { ok: true, selected: next };
  }
  if (selected.length >= 3) return { ok: false, selected };
  const next = [...selected, id];
  save(KEYS.compare, next);
  window.dispatchEvent(new Event('zoryvena:state'));
  return { ok: true, selected: next };
}
export function clearCompare() { save(KEYS.compare, []); window.dispatchEvent(new Event('zoryvena:state')); }

export function whatsappUrl(message) {
  const config = getConfig();
  const number = String(config.whatsapp || '').replace(/\D/g, '').slice(0, 15);
  const base = number.length >= 10 ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(String(message || '').slice(0, 3500))}`;
}
export function productWhatsapp(product) {
  return whatsappUrl(`Olá! Gostaria de consultar o perfume ${product.brand} ${product.name} (${product.volume}).`);
}

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
    cardPublicKey: result.cardPublicKey || '',
    testBuyerEmail: result.testBuyerEmail || '',
    pix: result.pix || null,
    environment: result.environment,
    reservationExpiresAt: result.reservationExpiresAt || '',
    containsPreorder: Boolean(result.containsPreorder),
    containsReadyStock: Boolean(result.containsReadyStock),
    createdAt: Date.now(),
    ...data,
  };
  sessionStorage.setItem('zoryvena.last-order', JSON.stringify(order));
  return order;
}

export async function getOrderStatus(order) {
  if (!order?.databaseId || !order?.statusToken) throw new Error('Pedido inválido para acompanhamento.');
  const { data, error } = await supabase.functions.invoke('order-status', {
    body: { orderId: order.databaseId, statusToken: order.statusToken },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível consultar o pedido.'));
  if (data?.error) throw new Error(data.error);
  return data;
}

export function getOrders() { return load(KEYS.orders, []); }
export function saveOrders(orders) { save(KEYS.orders, orders); }

export function showToast(message) {
  const toast = document.querySelector('.toast');
  if (!toast) return;
  toast.textContent = String(message || '').slice(0, 300);
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2800);
}
