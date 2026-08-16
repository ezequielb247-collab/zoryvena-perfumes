import { getFavorites, getCompare, priceText, installmentText, pixPriceText, availabilityText, productImage, productUrl } from './store.js';

const VERIFIED_PRODUCT_IMAGE_HOSTS = new Set([
  'images.tcdn.com.br',
  'orientalaromas.com',
  'zaoud.it',
  'media.zid.store',
  'lattafa-brasil.com',
]);

export function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

export function safeInternalHref(value, fallback = '/') {
  try {
    const url = new URL(String(value || fallback), location.origin);
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

function safeVisual(value) {
  const allowed = new Set(['black', 'noir', 'blue', 'pink', 'amber', 'green']);
  const visual = String(value || '').toLowerCase();
  return allowed.has(visual) ? visual : 'amber';
}

function verifiedProductImage(product) {
  const managed = productImage(product);
  if (managed) return managed;

  const raw = String(product?.image || '').trim();
  if (!raw.startsWith('https://')) return '';
  try {
    const url = new URL(raw);
    if (!VERIFIED_PRODUCT_IMAGE_HOSTS.has(url.host)) return '';
    return url.href;
  } catch {
    return '';
  }
}

export function media(product, size = '') {
  const image = verifiedProductImage(product);
  const safeSize = new Set(['', 'large', 'thumb', 'compare']).has(size) ? size : '';
  const placeholder = `<div class="product-placeholder visual-${safeVisual(product.visual)}"><span>${escapeHtml(product.brand)}</span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.volume)}</small></div>`;
  if (image) {
    return `<div class="product-media ${safeSize}"><img data-product-image src="${escapeHtml(image)}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${placeholder}</div>`;
  }
  return `<div class="product-media ${safeSize} image-error">${placeholder}</div>`;
}

export function productCard(product) {
  const favorites = getFavorites();
  const compare = getCompare();
  const installments = installmentText(product);
  const pix = pixPriceText(product);
  const href = safeInternalHref(productUrl(product), '/catalogo.html');
  const id = escapeHtml(product.id);
  const favoriteActive = favorites.includes(product.id);
  const favoriteLabel = `${favoriteActive ? 'Remover' : 'Adicionar'} ${product.name} ${favoriteActive ? 'dos' : 'aos'} favoritos`;
  return `<article class="product-card" data-id="${id}">
    ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ''}
    <button class="favorite-button ${favoriteActive ? 'active' : ''}" data-favorite="${id}" aria-label="${escapeHtml(favoriteLabel)}">${favoriteActive ? '♥' : '♡'}</button>
    <a href="${escapeHtml(href)}" class="product-media-link">${media(product)}</a>
    <div class="product-card-body">
      <span class="eyebrow">${escapeHtml(product.brand)} · ${escapeHtml(product.gender)}</span>
      <h3><a href="${escapeHtml(href)}">${escapeHtml(product.name)}</a></h3>
      <p>${escapeHtml(product.family)} · ${escapeHtml(product.occasion)}</p>
      <strong class="product-price">${escapeHtml(priceText(product))}</strong>
      ${installments ? `<small class="installment-price">${escapeHtml(installments)}</small>` : ''}
      ${pix ? `<small class="pix-price">${escapeHtml(pix)}</small>` : ''}
      <small class="availability-price">${escapeHtml(availabilityText(product))}</small>
      <div class="product-card-actions">
        <a class="button button-dark" href="${escapeHtml(href)}">Ver perfume</a>
        <label class="compare-check"><input type="checkbox" data-compare="${id}" ${compare.includes(product.id) ? 'checked' : ''}> Comparar</label>
      </div>
    </div>
  </article>`;
}

export function emptyState(title, text, actionHref = '/catalogo.html', actionLabel = 'Ver perfumes') {
  const href = safeInternalHref(actionHref, '/catalogo.html');
  return `<div class="empty-state"><span>◇</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><a class="button button-dark" href="${escapeHtml(href)}">${escapeHtml(actionLabel)}</a></div>`;
}
