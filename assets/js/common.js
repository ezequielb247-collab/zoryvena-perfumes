import { getCart, getFavorites, getCompare, getConfig, showToast, toggleFavorite, toggleCompare, syncStoreData } from './store.js';

function updateCounts() {
  const cartCount = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll('[data-cart-count]').forEach(el => el.textContent = cartCount);
  document.querySelectorAll('[data-favorite-count]').forEach(el => el.textContent = getFavorites().length);
  document.querySelectorAll('[data-compare-count]').forEach(el => el.textContent = getCompare().length);
}

function formatShippingValue(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function applyConfig() {
  const config = getConfig();
  const formattedWhatsapp = String(config.whatsapp || '').replace(/^(55)(\d{2})(\d{5})(\d{4})$/, '+$1 ($2) $3-$4');
  document.querySelectorAll('[data-store-whatsapp]').forEach(el => el.textContent = formattedWhatsapp || 'WhatsApp a configurar');
  document.querySelectorAll('[data-store-instagram]').forEach(el => el.textContent = config.instagram);
  document.querySelectorAll('[data-store-email]').forEach(el => el.textContent = config.email || 'E-mail a configurar');
  document.querySelectorAll('[data-current-year]').forEach(el => el.textContent = new Date().getFullYear());

  document.querySelectorAll('.announcement-bar, [data-free-shipping]').forEach(el => {
    const minimum = Number(config.freeShippingFrom);
    if (Number.isFinite(minimum) && minimum > 0) {
      el.textContent = `🚚 Frete grátis para todo o Brasil nas compras acima de ${formatShippingValue(minimum)}`;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  });
}

function bindGlobalActions() {
  document.addEventListener('click', event => {
    const favorite = event.target.closest('[data-favorite]');
    if (favorite) {
      event.preventDefault();
      const active = toggleFavorite(favorite.dataset.favorite);
      favorite.classList.toggle('active', active);
      favorite.textContent = active ? '♥' : '♡';
      showToast(active ? 'Adicionado aos favoritos.' : 'Removido dos favoritos.');
    }
  });
  document.addEventListener('change', event => {
    const compare = event.target.closest('[data-compare]');
    if (compare) {
      const result = toggleCompare(compare.dataset.compare);
      if (!result.ok) {
        compare.checked = false;
        showToast('Você pode comparar até 3 perfumes.');
      } else {
        showToast(compare.checked ? 'Adicionado à comparação.' : 'Removido da comparação.');
      }
    }
  });
  const menuButton = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.mobile-menu');
  menuButton?.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
  });
}

window.addEventListener('zoryvena:state', updateCounts);
window.addEventListener('zoryvena:data', applyConfig);
updateCounts();
applyConfig();
bindGlobalActions();

syncStoreData().then(changed => {
  applyConfig();
  if (!changed) return;
  window.dispatchEvent(new Event('zoryvena:state'));
});