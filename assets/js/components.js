import { getFavorites, getCompare, priceText, productImage, productUrl, isAvailable, productWhatsapp } from './store.js';

export function escapeHtml(value = '') { return String(value).replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' }[c])); }

export function media(product, size = '') {
  const image = productImage(product);
  if (image) return `<div class="product-media ${size}"><img src="${escapeHtml(image)}" alt="${escapeHtml(product.brand)} ${escapeHtml(product.name)}" loading="lazy" onerror="this.parentElement.classList.add('image-error');this.remove()"><div class="product-placeholder"><span>${escapeHtml(product.brand)}</span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.volume)}</small></div></div>`;
  return `<div class="product-media ${size} image-error"><div class="product-placeholder visual-${escapeHtml(product.visual || 'amber')}"><span>${escapeHtml(product.brand)}</span><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.volume)}</small></div></div>`;
}

export function productCard(product, options = {}) {
  const favorites = getFavorites(); const compare = getCompare();
  return `<article class="product-card" data-id="${escapeHtml(product.id)}">
    ${product.badge ? `<span class="product-badge">${escapeHtml(product.badge)}</span>` : ''}
    <button class="favorite-button ${favorites.includes(product.id) ? 'active' : ''}" data-favorite="${escapeHtml(product.id)}" aria-label="Adicionar ${escapeHtml(product.name)} aos favoritos">${favorites.includes(product.id) ? '♥' : '♡'}</button>
    <a href="${productUrl(product)}" class="product-media-link">${media(product)}</a>
    <div class="product-card-body">
      <span class="eyebrow">${escapeHtml(product.brand)} · ${escapeHtml(product.gender)}</span>
      <h3><a href="${productUrl(product)}">${escapeHtml(product.name)}</a></h3>
      <p>${escapeHtml(product.family)} · ${escapeHtml(product.occasion)}</p>
      <strong class="product-price">${escapeHtml(priceText(product))}</strong>
      <small>${isAvailable(product) ? `${product.stock} em estoque` : 'Consulte disponibilidade'}</small>
      <div class="product-card-actions">
        <a class="button button-dark" href="${productUrl(product)}">Ver perfume</a>
        <label class="compare-check"><input type="checkbox" data-compare="${escapeHtml(product.id)}" ${compare.includes(product.id) ? 'checked' : ''}> Comparar</label>
      </div>
    </div>
  </article>`;
}

export function emptyState(title, text, actionHref = '/catalogo.html', actionLabel = 'Ver perfumes') {
  return `<div class="empty-state"><span>◇</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><a class="button button-dark" href="${actionHref}">${escapeHtml(actionLabel)}</a></div>`;
}
