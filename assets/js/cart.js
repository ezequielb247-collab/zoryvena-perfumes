import { cartDetails, cartTotal, money, updateCart, removeFromCart, showToast, productUrl } from './store.js';
import { media, emptyState, escapeHtml, safeInternalHref } from './components.js';

const list = document.querySelector('#cartList');
const summary = document.querySelector('#cartSummary');

function quantityControl(item) {
  const stock = Math.max(1, Number(item.product.stock || 1));
  const quantity = Math.max(1, Number(item.quantity || 1));
  const atMinimum = quantity <= 1;
  const atMaximum = quantity >= stock;
  const id = escapeHtml(item.id);
  const stockMessage = stock === 1
    ? 'Somente 1 unidade disponível no momento.'
    : `${stock} unidades disponíveis no momento.`;

  return `<div class="quantity-block">
    <div class="quantity" aria-label="Controle de quantidade">
      <button class="quantity-button" type="button" data-minus="${id}" ${atMinimum ? 'disabled' : ''} aria-label="Diminuir quantidade">−</button>
      <input class="quantity-input" data-quantity="${id}" type="number" min="1" max="${stock}" value="${quantity}" inputmode="numeric" aria-label="Quantidade de ${escapeHtml(item.product.name)}">
      <button class="quantity-button" type="button" data-plus="${id}" ${atMaximum ? 'disabled' : ''} aria-label="Aumentar quantidade">+</button>
    </div>
    <small class="quantity-helper">${escapeHtml(stockMessage)}</small>
  </div>`;
}

function render() {
  const items = cartDetails();

  if (!items.length) {
    list.innerHTML = emptyState('Seu carrinho está vazio', 'Explore o catálogo e encontre sua próxima fragrância.');
    summary.hidden = true;
    return;
  }

  summary.hidden = false;
  list.innerHTML = items.map(item => {
    const id = escapeHtml(item.id);
    const href = escapeHtml(safeInternalHref(productUrl(item.product), '/catalogo.html'));
    return `<article class="cart-item">
      ${media(item.product, 'thumb')}
      <div class="cart-item-copy">
        <span class="eyebrow">${escapeHtml(item.product.brand)}</span>
        <h2><a href="${href}">${escapeHtml(item.product.name)}</a></h2>
        <p>${escapeHtml(item.product.volume)}</p>
        <strong>${escapeHtml(money.format(Number(item.product.price)))}</strong>
      </div>
      ${quantityControl(item)}
      <button class="remove-link" type="button" data-remove="${id}">Remover</button>
    </article>`;
  }).join('');

  document.querySelector('#subtotal').textContent = money.format(cartTotal());
  document.querySelector('#total').textContent = money.format(cartTotal());
}

document.addEventListener('click', event => {
  const remove = event.target.closest('[data-remove]');
  if (remove) {
    removeFromCart(remove.dataset.remove);
    render();
    showToast('Item removido.');
    return;
  }

  const plus = event.target.closest('[data-plus]');
  if (plus) {
    const input = document.querySelector(`[data-quantity="${CSS.escape(plus.dataset.plus)}"]`);
    if (input) updateCart(plus.dataset.plus, Number(input.value) + 1);
    render();
    return;
  }

  const minus = event.target.closest('[data-minus]');
  if (minus) {
    const input = document.querySelector(`[data-quantity="${CSS.escape(minus.dataset.minus)}"]`);
    if (input) updateCart(minus.dataset.minus, Number(input.value) - 1);
    render();
  }
});

document.addEventListener('change', event => {
  if (!event.target.matches('[data-quantity]')) return;
  updateCart(event.target.dataset.quantity, event.target.value);
  render();
});

render();
