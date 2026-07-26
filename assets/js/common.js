import { getCart, getFavorites, getCompare, getConfig, showToast, toggleFavorite, toggleCompare } from './store.js';

function updateCounts() {
  const cartCount = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cartCount);
  document.querySelectorAll('[data-favorite-count]').forEach(el => el.textContent = getFavorites().length);
  document.querySelectorAll('[data-compare-count]').forEach(el => el.textContent = getCompare().length);
}
function applyConfig() {
  const config = getConfig();
  document.querySelectorAll('[data-store-whatsapp]').forEach(el => el.textContent = config.whatsapp === 'PREENCHER' ? 'WhatsApp a configurar' : config.whatsapp);
  document.querySelectorAll('[data-store-instagram]').forEach(el => el.textContent = config.instagram);
  document.querySelectorAll('[data-current-year]').forEach(el => el.textContent = new Date().getFullYear());
}
function bindGlobalActions() {
  document.addEventListener('click', event => {
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) { event.preventDefault(); const active = toggleFavorite(favorite.dataset.favorite); favorite.classList.toggle('active', active); favorite.textContent = active ? '♥' : '♡'; showToast(active ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.'); }
  });
  document.addEventListener('change', event => {
    const compare = event.target.closest('[data-compare]');
    if (compare) { const result = toggleCompare(compare.dataset.compare); if (!result.ok) { compare.checked = false; showToast('Você pode comparar até 3 perfumes.'); } else showToast(compare.checked ? 'Adicionado à comparação.' : 'Removido da comparação.'); }
  });
  const menuButton = document.querySelector('.menu-toggle'); const menu = document.querySelector('.mobile-menu');
  menuButton?.addEventListener('click', () => { const open = menu.hidden; menu.hidden = !open; menuButton.setAttribute('aria-expanded', String(open)); });
}
window.addEventListener('velmora:state', updateCounts);
updateCounts(); applyConfig(); bindGlobalActions();
