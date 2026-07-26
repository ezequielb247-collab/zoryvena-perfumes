import { BASE_PRODUCTS } from './products.js';
import { DEFAULT_CONFIG, KEYS } from './config.js';

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
export function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

export function getConfig() { return { ...DEFAULT_CONFIG, ...load(KEYS.settings, {}) }; }
export function getProducts() {
  const overrides = load(KEYS.productOverrides, {});
  return BASE_PRODUCTS.map(product => ({ ...product, ...(overrides[product.id] || {}) }));
}
export function getProduct(id) { return getProducts().find(product => product.id === id); }
export function isPriced(product) { return Number.isFinite(Number(product?.price)) && Number(product.price) > 0; }
export function isAvailable(product) { return isPriced(product) && Number(product.stock) > 0; }
export function priceText(product) { return isPriced(product) ? money.format(Number(product.price)) : 'Consulte o valor'; }
export function productUrl(product) { return `/produto/${product.id}/`; }
export function productImage(product) { return product.image ? `/${product.image.replace(/^\//, '')}` : ''; }

export function getCart() { return load(KEYS.cart, []); }
export function saveCart(cart) { save(KEYS.cart, cart); window.dispatchEvent(new Event('velmora:state')); }
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
export function cartDetails() {
  return getCart().map(item => ({ ...item, product: getProduct(item.id) })).filter(item => item.product);
}
export function cartTotal() { return cartDetails().reduce((total, item) => total + Number(item.product.price || 0) * item.quantity, 0); }

export function getFavorites() { return load(KEYS.favorites, []); }
export function toggleFavorite(id) {
  const favorites = getFavorites(); const next = favorites.includes(id) ? favorites.filter(x => x !== id) : [...favorites, id];
  save(KEYS.favorites, next); window.dispatchEvent(new Event('velmora:state')); return next.includes(id);
}
export function getCompare() { return load(KEYS.compare, []); }
export function toggleCompare(id) {
  const selected = getCompare();
  if (selected.includes(id)) { const next = selected.filter(x => x !== id); save(KEYS.compare, next); window.dispatchEvent(new Event('velmora:state')); return { ok: true, selected: next }; }
  if (selected.length >= 3) return { ok: false, selected };
  const next = [...selected, id]; save(KEYS.compare, next); window.dispatchEvent(new Event('velmora:state')); return { ok: true, selected: next };
}
export function clearCompare() { save(KEYS.compare, []); window.dispatchEvent(new Event('velmora:state')); }

export function whatsappUrl(message) {
  const config = getConfig();
  const number = String(config.whatsapp || '').replace(/\D/g, '');
  const base = number && !String(config.whatsapp).includes('PREENCHER') ? `https://wa.me/${number}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}
export function productWhatsapp(product) {
  return whatsappUrl(`Olá! Gostaria de consultar o perfume ${product.brand} ${product.name} (${product.volume}).`);
}

export function createOrder(data) {
  const orders = load(KEYS.orders, []);
  const id = `VEL-${Date.now().toString().slice(-8)}`;
  const order = { id, createdAt: new Date().toISOString(), status: 'Aguardando confirmação', items: cartDetails().map(item => ({ id: item.id, name: item.product.name, brand: item.product.brand, price: item.product.price, quantity: item.quantity })), total: cartTotal(), ...data };
  orders.unshift(order); save(KEYS.orders, orders); saveCart([]); return order;
}
export function getOrders() { return load(KEYS.orders, []); }
export function saveOrders(orders) { save(KEYS.orders, orders); }

export function showToast(message) {
  const toast = document.querySelector('.toast'); if (!toast) return;
  toast.textContent = message; toast.hidden = false; clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2800);
}
