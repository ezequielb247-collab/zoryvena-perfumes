import { cartDetails, cartTotal, money, createOrder, productPriceForPayment, showToast } from './store.js';

const form = document.querySelector('#checkoutForm');
const empty = document.querySelector('#checkoutEmpty');
const content = document.querySelector('#checkoutContent');
const paymentSelect = form?.elements?.payment;
const deliverySelect = form?.elements?.delivery;
const items = cartDetails();

function selectedPaymentMethod() {
  return paymentSelect?.value === 'pix' ? 'pix' : 'card';
}

function selectedDeliveryMethod() {
  return deliverySelect?.value === 'pickup' ? 'pickup' : 'shipping';
}

function renderSummary() {
  const paymentMethod = selectedPaymentMethod();
  const deliveryMethod = selectedDeliveryMethod();
  const checkoutItems = document.querySelector('#checkoutItems');
  const checkoutTotal = document.querySelector('#checkoutTotal');
  const checkoutDelivery = document.querySelector('#checkoutDelivery');
  const deliveryNote = document.querySelector('#deliverySummaryNote');

  checkoutItems.innerHTML = items.map(item => {
    const unitPrice = productPriceForPayment(item.product, paymentMethod);
    return `<li><span>${item.quantity}× ${item.product.brand} ${item.product.name}</span><strong>${money.format(unitPrice * item.quantity)}</strong></li>`;
  }).join('');

  checkoutTotal.textContent = money.format(cartTotal(paymentMethod));

  if (deliveryMethod === 'pickup') {
    checkoutDelivery.textContent = 'Grátis';
    deliveryNote.textContent = 'Retirada gratuita em Macaé. O local e o horário serão confirmados no atendimento.';
  } else {
    checkoutDelivery.textContent = 'Sob consulta';
    deliveryNote.textContent = 'O frete será calculado e confirmado antes do envio. Ele ainda não está incluído no total parcial.';
  }
}

if (!items.length) {
  content.hidden = true;
  empty.hidden = false;
} else {
  paymentSelect?.addEventListener('change', renderSummary);
  deliverySelect?.addEventListener('change', renderSummary);
  renderSummary();
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  const original = button?.textContent;

  if (button) {
    button.disabled = true;
    button.textContent = 'Gerando pagamento...';
  }

  try {
    const data = Object.fromEntries(new FormData(form));
    data.deliveryLabel = data.delivery === 'pickup' ? 'Retirada em Macaé — grátis' : 'Consultar frete';
    const order = await createOrder(data);
    if (!order.paymentUrl) throw new Error('O endereço de pagamento não foi gerado.');
    location.href = order.paymentUrl;
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível iniciar o pagamento. Confira os dados e tente novamente.');
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
});
