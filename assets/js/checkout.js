import { cartDetails, cartTotal, money, createOrder, productPriceForPayment, showToast } from './store.js';

const form = document.querySelector('#checkoutForm');
const empty = document.querySelector('#checkoutEmpty');
const content = document.querySelector('#checkoutContent');
const addressSection = document.querySelector('#shippingAddressFields');
const cepStatus = document.querySelector('#cepStatus');
const items = cartDetails();
const addressNames = ['cep', 'street', 'number', 'complement', 'neighborhood', 'city', 'state'];
const requiredAddressNames = new Set(['cep', 'street', 'number', 'neighborhood', 'city', 'state']);
let cepRequest;
let cepTimer;
let lastCep = '';

const digits = value => String(value || '').replace(/\D/g, '');
const selected = (name, fallback) => form?.querySelector(`[name="${name}"]:checked`)?.value || fallback;
const paymentMethod = () => selected('payment', 'pix') === 'pix' ? 'pix' : 'card';
const deliveryMethod = () => selected('delivery', 'shipping') === 'pickup' ? 'pickup' : 'shipping';

function formatCep(value) {
  const valueDigits = digits(value).slice(0, 8);
  return valueDigits.length > 5 ? `${valueDigits.slice(0, 5)}-${valueDigits.slice(5)}` : valueDigits;
}

function formatPhone(value) {
  const raw = digits(value).slice(0, 13);
  const hasCountry = raw.startsWith('55') && raw.length > 11;
  const local = hasCountry ? raw.slice(2) : raw;
  const prefix = hasCountry ? '+55 ' : '';
  if (local.length <= 2) return prefix + local;
  if (local.length <= 6) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2)}`;
  if (local.length <= 10) return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return `${prefix}(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7, 11)}`;
}

function showCepMessage(message, state = '') {
  if (!cepStatus) return;
  cepStatus.textContent = message;
  state ? cepStatus.dataset.state = state : delete cepStatus.dataset.state;
}

function fill(name, value) {
  const field = form?.elements?.[name];
  if (field) field.value = value || '';
}

function updateAddressVisibility() {
  const shipping = deliveryMethod() === 'shipping';
  if (addressSection) addressSection.hidden = !shipping;
  addressNames.forEach(name => {
    const field = form?.elements?.[name];
    if (!field) return;
    field.disabled = !shipping;
    field.required = shipping && requiredAddressNames.has(name);
  });
  if (!shipping) {
    cepRequest?.abort();
    clearTimeout(cepTimer);
  }
}

function renderSummary() {
  const method = paymentMethod();
  const pickup = deliveryMethod() === 'pickup';
  const list = document.querySelector('#checkoutItems');
  const total = document.querySelector('#checkoutTotal');
  const delivery = document.querySelector('#checkoutDelivery');
  const note = document.querySelector('#deliverySummaryNote');
  if (!list || !total || !delivery || !note) return;

  list.innerHTML = items.map(item => {
    const price = productPriceForPayment(item.product, method);
    return `<li><span>${item.quantity}× ${item.product.brand} ${item.product.name}</span><strong>${money.format(price * item.quantity)}</strong></li>`;
  }).join('');
  total.textContent = money.format(cartTotal(method));
  delivery.textContent = pickup ? 'Grátis' : 'Sob consulta';
  note.textContent = pickup
    ? 'Retirada gratuita em Macaé. O local e o horário serão confirmados no atendimento.'
    : 'O frete será calculado e confirmado antes do envio. Ele ainda não está incluído no total parcial.';
}

async function searchCep(value) {
  const cep = digits(value);
  if (cep.length !== 8 || deliveryMethod() !== 'shipping') return;
  if (cep === lastCep && form?.elements?.city?.value) return;

  cepRequest?.abort();
  cepRequest = new AbortController();
  lastCep = cep;
  form?.elements?.cep?.setAttribute('aria-busy', 'true');
  showCepMessage('Buscando endereço…', 'loading');

  try {
    const response = await fetch('https://viacep.com.br/ws/' + cep + '/json/', {
      signal: cepRequest.signal,
    });
    if (!response.ok) throw new Error('Não foi possível consultar o CEP agora.');
    const address = await response.json();
    if (address.erro) throw new Error('CEP não encontrado. Confira os números digitados.');

    fill('street', address.logradouro);
    fill('neighborhood', address.bairro);
    fill('city', address.localidade);
    fill('state', String(address.uf || '').toUpperCase());
    showCepMessage('Endereço encontrado. Informe o número e, se necessário, o complemento.', 'success');
    (address.logradouro ? form?.elements?.number : form?.elements?.street)?.focus();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    lastCep = '';
    const message = error?.message || 'Não foi possível buscar o CEP. Preencha manualmente.';
    showCepMessage(message, 'error');
    showToast(message);
  } finally {
    form?.elements?.cep?.removeAttribute('aria-busy');
  }
}

function bindForm() {
  const cep = form?.elements?.cep;
  const phone = form?.elements?.whatsapp;
  const state = form?.elements?.state;

  cep?.addEventListener('input', event => {
    event.target.value = formatCep(event.target.value);
    const currentCep = digits(event.target.value);
    if (currentCep !== lastCep) lastCep = '';
    clearTimeout(cepTimer);
    if (currentCep.length < 8) {
      showCepMessage('Digite os 8 números do CEP para preencher o endereço automaticamente.');
      return;
    }
    cepTimer = setTimeout(() => searchCep(currentCep), 280);
  });

  cep?.addEventListener('blur', event => {
    if (digits(event.target.value).length === 8) searchCep(event.target.value);
  });

  phone?.addEventListener('input', event => event.target.value = formatPhone(event.target.value));
  state?.addEventListener('input', event => {
    event.target.value = String(event.target.value || '').replace(/[^a-z]/gi, '').slice(0, 2).toUpperCase();
  });

  form?.querySelectorAll('[name="delivery"], [name="payment"]').forEach(input => {
    input.addEventListener('change', () => {
      updateAddressVisibility();
      renderSummary();
    });
  });
}

if (!items.length) {
  if (content) content.hidden = true;
  if (empty) empty.hidden = false;
} else {
  bindForm();
  updateAddressVisibility();
  renderSummary();
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const button = form.querySelector('button[type="submit"]');
  const original = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = paymentMethod() === 'pix' ? 'Gerando QR Code…' : 'Preparando cartão…';
  }

  try {
    const data = Object.fromEntries(new FormData(form));
    data.delivery = deliveryMethod();
    data.payment = paymentMethod();
    data.deliveryLabel = data.delivery === 'pickup' ? 'Retirada em Macaé — grátis' : 'Entrega com frete sob consulta';
    data.whatsapp = digits(data.whatsapp);
    data.email = String(data.email || '').trim().toLowerCase();

    if (data.delivery === 'shipping') {
      data.cep = digits(data.cep);
      data.state = String(data.state || '').toUpperCase();
      data.address = [data.street, data.number, data.complement, data.neighborhood].filter(Boolean).join(', ');
    } else {
      data.address = 'Retirada em Macaé';
    }

    const order = await createOrder(data);

    if (order.paymentMode === 'pix' && (order.pix?.qrCode || order.pix?.ticketUrl)) {
      location.href = '/pagamento.html?resultado=pix';
      return;
    }

    if (order.paymentMode === 'card_brick') {
      location.href = '/cartao.html';
      return;
    }

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
