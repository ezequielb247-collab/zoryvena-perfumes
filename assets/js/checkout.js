import { cartDetails, cartTotal, money, createOrder, productPriceForPayment, showToast } from './store.js';

const form = document.querySelector('#checkoutForm');
const empty = document.querySelector('#checkoutEmpty');
const content = document.querySelector('#checkoutContent');
const paymentSelect = form?.elements?.payment;
const items = cartDetails();

function selectedPaymentMethod() {
  return paymentSelect?.value === 'pix' ? 'pix' : 'card';
}

function renderSummary() {
  const paymentMethod = selectedPaymentMethod();
  document.querySelector('#checkoutItems').innerHTML = items.map(item => {
    const unitPrice = productPriceForPayment(item.product, paymentMethod);
    return `<li><span>${item.quantity}× ${item.product.brand} ${item.product.name}</span><strong>${money.format(unitPrice * item.quantity)}</strong></li>`;
  }).join('');
  document.querySelector('#checkoutTotal').textContent = money.format(cartTotal(paymentMethod));
}

if (!items.length) {
  content.hidden = true;
  empty.hidden = false;
} else {
  if (paymentSelect) {
    paymentSelect.innerHTML = `
      <option value="pix">Pix com desconto</option>
      <option value="card">Cartão em até 3x sem juros</option>
    `;
    paymentSelect.addEventListener('change', renderSummary);
  }

  const button = form?.querySelector('button[type="submit"]');
  if (button) button.textContent = 'Ir para pagamento seguro';

  const intro = document.querySelector('.catalog-hero .section-heading p');
  if (intro) intro.textContent = 'Preencha seus dados e siga para o ambiente seguro do Mercado Pago.';

  const summaryNote = document.querySelector('.summary-card > p');
  if (summaryNote) summaryNote.textContent = 'Integração em ambiente de teste. Nenhum valor real será cobrado nesta etapa.';

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
