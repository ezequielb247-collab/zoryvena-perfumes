import { cartDetails, cartTotal, money, updateCart, removeFromCart, showToast } from './store.js';
import { media, emptyState, escapeHtml } from './components.js';
const list = document.querySelector('#cartList'); const summary = document.querySelector('#cartSummary');
function render() {
  const items = cartDetails();
  if (!items.length) { list.innerHTML = emptyState('Seu carrinho está vazio','Explore o catálogo e encontre sua próxima fragrância.'); summary.hidden=true; return; }
  summary.hidden=false;
  list.innerHTML = items.map(item=>`<article class="cart-item">${media(item.product,'thumb')}<div><span class="eyebrow">${escapeHtml(item.product.brand)}</span><h2><a href="/produto/${item.product.id}/">${escapeHtml(item.product.name)}</a></h2><p>${escapeHtml(item.product.volume)}</p><strong>${money.format(Number(item.product.price))}</strong></div><div class="quantity"><button data-minus="${item.id}">−</button><input data-quantity="${item.id}" type="number" min="1" max="${item.product.stock}" value="${item.quantity}"><button data-plus="${item.id}">+</button></div><button class="remove-link" data-remove="${item.id}">Remover</button></article>`).join('');
  document.querySelector('#subtotal').textContent = money.format(cartTotal()); document.querySelector('#total').textContent = money.format(cartTotal());
}
document.addEventListener('click',e=>{ const remove=e.target.closest('[data-remove]'); if(remove){removeFromCart(remove.dataset.remove);render();showToast('Item removido.');} const plus=e.target.closest('[data-plus]'); if(plus){const input=document.querySelector(`[data-quantity="${plus.dataset.plus}"]`);updateCart(plus.dataset.plus,Number(input.value)+1);render();} const minus=e.target.closest('[data-minus]'); if(minus){const input=document.querySelector(`[data-quantity="${minus.dataset.minus}"]`);updateCart(minus.dataset.minus,Number(input.value)-1);render();} });
document.addEventListener('change',e=>{if(e.target.matches('[data-quantity]')){updateCart(e.target.dataset.quantity,e.target.value);render();}});
render();
