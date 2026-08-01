import { getCart, getFavorites, getCompare, getConfig, showToast, toggleFavorite, toggleCompare, syncStoreData } from './store.js';

function loadMobileFixes() {
  if (document.querySelector('link[data-zoryvena-mobile-fixes]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/assets/css/mobile-fixes.css?v=20260801-3';
  link.dataset.zoryvenaMobileFixes = 'true';
  document.head.appendChild(link);
}

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

function whatsappContactUrl(number) {
  const digits = String(number || '').replace(/\D/g, '');
  const message = 'Olá! Vim pelo site da Zoryvena Perfumes e gostaria de atendimento.';
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : '';
}

function applyConfig() {
  const config = getConfig();
  const whatsappUrl = whatsappContactUrl(config.whatsapp);

  document.querySelectorAll('[data-store-whatsapp]').forEach(el => {
    if (!whatsappUrl) {
      el.textContent = 'WhatsApp indisponível';
      return;
    }

    if (el.tagName === 'A') {
      el.href = whatsappUrl;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
      el.classList.add('button', 'button-outline');
      el.textContent = 'Falar pelo WhatsApp';
      return;
    }

    el.innerHTML = `<a class="button button-outline" href="${whatsappUrl}" target="_blank" rel="noopener noreferrer" aria-label="Falar com a Zoryvena pelo WhatsApp">Falar pelo WhatsApp</a>`;
  });

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
  if (!menuButton || !menu) return;

  let lockedScrollY = 0;

  function setMenu(open) {
    if (open === !menu.hidden) return;

    if (open) {
      lockedScrollY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.insetInline = '0';
      document.body.style.width = '100%';
      document.body.style.top = `-${lockedScrollY}px`;
      document.body.classList.add('menu-open');
    } else {
      document.body.classList.remove('menu-open');
      document.body.style.position = '';
      document.body.style.insetInline = '';
      document.body.style.width = '';
      document.body.style.top = '';
    }

    menu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    menuButton.textContent = open ? '×' : '☰';

    if (!open) window.scrollTo(0, lockedScrollY);
  }

  menuButton.addEventListener('click', () => setMenu(menu.hidden));

  menu.addEventListener('click', event => {
    if (event.target === menu || event.target.closest('a')) setMenu(false);
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !menu.hidden) setMenu(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 650 && !menu.hidden) setMenu(false);
  });

  window.addEventListener('pagehide', () => {
    document.body.classList.remove('menu-open');
    document.body.style.position = '';
    document.body.style.insetInline = '';
    document.body.style.width = '';
    document.body.style.top = '';
  });
}

loadMobileFixes();
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