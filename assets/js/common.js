import { getCart, getFavorites, getCompare, getConfig, showToast, toggleFavorite, toggleCompare, syncStoreData } from './store.js';

function loadStylesheet(href, attribute) {
  if (document.querySelector(`link[${attribute}]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute(attribute, '');
  document.head.appendChild(link);
}

function loadEnhancementStyles() {
  loadStylesheet('/assets/css/mobile-fixes.css?v=20260801-3', 'data-zoryvena-mobile-fixes');
  loadStylesheet('/assets/css/professional-polish.css?v=20260801-1', 'data-zoryvena-professional-polish');
  loadStylesheet('/assets/css/site-review.css?v=20260801-1', 'data-zoryvena-site-review');
  loadStylesheet('/assets/css/launch-safety.css?v=20260802-1', 'data-zoryvena-launch-safety');
}

function updateCounts() {
  const cartCount = getCart().reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  document.querySelectorAll('[data-cart-count]').forEach(element => { element.textContent = String(cartCount); });
  document.querySelectorAll('[data-favorite-count]').forEach(element => { element.textContent = String(getFavorites().length); });
  document.querySelectorAll('[data-compare-count]').forEach(element => { element.textContent = String(getCompare().length); });
}

function formatShippingValue(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL',
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function whatsappContactUrl(number) {
  const digits = String(number || '').replace(/\D/g, '').slice(0, 15);
  if (digits.length < 10) return '';
  const message = 'Olá! Vim pelo site da Zoryvena Perfumes e gostaria de atendimento.';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function instagramUrl(handle) {
  const username = String(handle || '').trim().replace(/^@/, '');
  return /^[a-z0-9._]{1,30}$/i.test(username) ? `https://instagram.com/${username}` : '';
}

function validEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email.length <= 150 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function externalLink(url, label, ariaLabel = label) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  link.setAttribute('aria-label', ariaLabel);
  return link;
}

function applyConfig() {
  const config = getConfig();
  const whatsappUrl = whatsappContactUrl(config.whatsapp);
  const instagram = String(config.instagram || '@zoryvenaperfumes').slice(0, 32);
  const instagramLink = instagramUrl(instagram);
  const email = validEmail(config.email);

  document.querySelectorAll('[data-store-whatsapp]').forEach(element => {
    if (!whatsappUrl) {
      element.textContent = 'WhatsApp indisponível';
      return;
    }
    const link = externalLink(whatsappUrl, 'Falar pelo WhatsApp', 'Falar com a Zoryvena pelo WhatsApp');
    link.classList.add('button', 'button-outline');
    if (element.tagName === 'A') {
      element.href = link.href;
      element.target = link.target;
      element.rel = link.rel;
      element.textContent = link.textContent;
      element.setAttribute('aria-label', link.getAttribute('aria-label'));
      element.classList.add('button', 'button-outline');
    } else {
      element.replaceChildren(link);
    }
  });

  document.querySelectorAll('[data-store-instagram]').forEach(element => {
    if (!instagramLink) {
      element.textContent = instagram;
      return;
    }
    element.replaceChildren(externalLink(instagramLink, instagram, 'Abrir Instagram da Zoryvena'));
  });

  document.querySelectorAll('[data-store-email]').forEach(element => {
    if (!email) {
      element.textContent = 'E-mail indisponível';
      return;
    }
    const link = document.createElement('a');
    link.href = `mailto:${email}`;
    link.textContent = email;
    element.replaceChildren(link);
  });

  document.querySelectorAll('[data-current-year]').forEach(element => { element.textContent = String(new Date().getFullYear()); });

  document.querySelectorAll('.announcement-bar, [data-free-shipping]').forEach(element => {
    const minimum = Number(config.freeShippingFrom);
    if (Number.isFinite(minimum) && minimum > 0 && config.shippingMode === 'automatic') {
      element.textContent = `🚚 Frete grátis para todo o Brasil nas compras acima de ${formatShippingValue(minimum)}`;
      element.hidden = false;
    } else if (config.shippingMode === 'manual_quote' && element.classList.contains('announcement-bar')) {
      element.textContent = '📦 Entrega com cotação antes do pagamento • Retirada combinada em Macaé';
      element.hidden = false;
    } else if (config.shippingMode === 'pickup_only' && element.classList.contains('announcement-bar')) {
      element.textContent = '📍 Retirada combinada em Macaé';
      element.hidden = false;
    } else {
      element.hidden = true;
    }
  });

  document.querySelectorAll('.footer-bottom').forEach(footer => {
    const finalText = footer.lastElementChild;
    if (finalText && /preenchid|lançamento|configur/i.test(finalText.textContent || '')) {
      finalText.textContent = 'Compra segura e atendimento exclusivamente pelos canais oficiais.';
    }
  });
}

function polishPublicCopy() {
  const replacements = new Map([
    ['Os perfumes são originais?', 'A Zoryvena seleciona produtos com procedência verificada e mantém controle interno de fornecedor, lote e origem.'],
    ['Como funcionará a entrega?', 'A Zoryvena é virtual. Para entrega, o frete é cotado antes da geração do pagamento; eventual retirada em Macaé é combinada individualmente.'],
    ['Quero consultar preço e estoque', 'Cada produto mostra preço normal, condição no Pix, parcelamento e disponibilidade. Quando a quantidade estiver sob consulta, fale com a equipe pelo WhatsApp.'],
  ]);
  document.querySelectorAll('.faq details').forEach(detail => {
    const summary = detail.querySelector('summary');
    const paragraph = detail.querySelector('p');
    const replacement = replacements.get(summary?.textContent?.trim());
    if (!replacement || !paragraph) return;
    if (summary.textContent.trim() === 'Como funcionará a entrega?') summary.textContent = 'Como funciona a entrega?';
    paragraph.textContent = replacement;
  });
}

function normalizePath(path) {
  const clean = String(path || '/').split('?')[0].replace(/index\.html$/, '').replace(/\/+$/, '');
  return clean || '/';
}

function updateActiveNavigation() {
  const current = normalizePath(location.pathname);
  document.querySelectorAll('.desktop-nav a, .mobile-menu a, .mobile-bottom-nav a').forEach(link => {
    const target = normalizePath(new URL(link.href, location.origin).pathname);
    const active = target === current || (target !== '/' && current.startsWith(`${target}/`));
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function bindHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const update = () => header.classList.toggle('is-scrolled', window.scrollY > 12);
  update();
  window.addEventListener('scroll', update, { passive: true });
}

function bindImageFallbacks() {
  document.addEventListener('error', event => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) || !image.matches('[data-product-image]')) return;
    image.parentElement?.classList.add('image-error');
    image.remove();
  }, true);
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
  menu.addEventListener('click', event => { if (event.target === menu || event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) setMenu(false); });
  window.addEventListener('resize', () => { if (window.innerWidth > 650 && !menu.hidden) setMenu(false); });
  window.addEventListener('pagehide', () => {
    document.body.classList.remove('menu-open');
    document.body.style.position = '';
    document.body.style.insetInline = '';
    document.body.style.width = '';
    document.body.style.top = '';
  });
}

loadEnhancementStyles();
updateActiveNavigation();
polishPublicCopy();
bindHeaderScroll();
bindImageFallbacks();
window.addEventListener('zoryvena:state', updateCounts);
window.addEventListener('zoryvena:data', applyConfig);
updateCounts();
applyConfig();
bindGlobalActions();
syncStoreData().then(changed => {
  applyConfig();
  if (changed) window.dispatchEvent(new Event('zoryvena:state'));
});
