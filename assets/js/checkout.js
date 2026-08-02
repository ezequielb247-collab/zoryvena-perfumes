import {
  cartDetails,
  cartTotal,
  money,
  createOrder,
  productPriceForPayment,
  showToast,
  whatsappUrl,
  getConfig,
} from './store.js';

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
  cepStatus.textContent = String(message || '').slice(0, 300);
  state ? cepStatus.dataset.state = state : delete cepStatus.dataset.state;
}

function fill(name, value) {
  const field = form?.elements?.[name];
  if (field) field.value = String(value || '').slice(0, 180);
}

function policyLink(href, label) {
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function ensurePolicyAcceptance() {
  if (!form || form.querySelector('[data-policy-acceptance]')) return;
  const submit = form.querySelector('button[type="submit"]');
  if (!submit) return;

  const wrapper = document.createElement('label');
  wrapper.className = 'checkout-policy-acceptance';
  wrapper.dataset.policyAcceptance = '';
  const checkbox = document.createElement('input');
  checkbox.required = true;
  checkbox.type = 'checkbox';
  checkbox.name = 'acceptedPolicies';
  checkbox.value = 'yes';
  const text = document.createElement('span');
  text.append('Li e aceito os ');
  text.append(policyLink('/politicas/termos-de-compra.html', 'Termos de compra'));
  text.append(', a ');
  text.append(policyLink('/politicas/trocas-e-devolucoes.html', 'Política de trocas'));
  text.append(' e a ');
  text.append(policyLink('/politicas/privacidade.html', 'Política de privacidade'));
  text.append('.');
  wrapper.append(checkbox, text);
  submit.before(wrapper);
}

function updateSubmitButton() {
  const button = form?.querySelector('button[type="submit"]');
  if (!button || button.disabled) return;
  button.textContent = deliveryMethod() === 'shipping'
    ? 'Solicitar cotação de frete no WhatsApp'
    : 'Ir para pagamento seguro';
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
  updateSubmitButton();
}

function renderSummary() {
  const method = paymentMethod();
  const pickup = deliveryMethod() === 'pickup';
  const list = document.querySelector('#checkoutItems');
  const total = document.querySelector('#checkoutTotal');
  const delivery = document.querySelector('#checkoutDelivery');
  const note = document.querySelector('#deliverySummaryNote');
  const environmentNote = document.querySelector('#environmentNote');
  if (!list || !total || !delivery || !note) return;

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const price = productPriceForPayment(item.product, method);
    const row = document.createElement('li');
    const description = document.createElement('span');
    description.textContent = `${item.quantity}× ${String(item.product.brand || '').slice(0, 100)} ${String(item.product.name || '').slice(0, 120)}`;
    const value = document.createElement('strong');
    value.textContent = money.format(price * item.quantity);
    row.append(description, value);
    fragment.appendChild(row);
  });
  list.replaceChildren(fragment);
  total.textContent = money.format(cartTotal(method));
  delivery.textContent = pickup ? 'Grátis' : 'Cotação antes do pagamento';
  note.textContent = pickup
    ? 'Retirada combinada em Macaé. O local e o horário serão confirmados no atendimento.'
    : 'Para evitar cobrança incompleta, o frete será cotado no WhatsApp antes da geração do pagamento.';

  const config = getConfig();
  if (environmentNote) {
    environmentNote.hidden = config.paymentEnvironment === 'production';
    environmentNote.textContent = 'Ambiente de teste: nenhum valor real será cobrado nesta etapa.';
  }
  updateSubmitButton();
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
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: cepRequest.signal,
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
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
  const emailHelp = document.querySelector('#emailHelp');
  if (emailHelp) emailHelp.textContent = 'Obrigatório para identificar o pedido e permitir o contato sobre pagamento, retirada ou entrega.';

  const limits = {
    name: 120, whatsapp: 20, email: 150, street: 160, number: 20,
    complement: 120, neighborhood: 100, city: 100, state: 2, notes: 1000,
  };
  Object.entries(limits).forEach(([name, maxLength]) => {
    const field = form?.elements?.[name];
    if (field) field.maxLength = maxLength;
  });

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

  phone?.addEventListener('input', event => { event.target.value = formatPhone(event.target.value); });
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

function shippingQuoteMessage(data) {
  const method = paymentMethod();
  const lines = items.map(item => {
    const unit = productPriceForPayment(item.product, method);
    return `• ${item.quantity}x ${String(item.product.brand || '').slice(0, 100)} ${String(item.product.name || '').slice(0, 120)} — ${money.format(unit * item.quantity)}`;
  });
  const address = [
    `${String(data.street || '').slice(0, 160)}, ${String(data.number || '').slice(0, 20)}`,
    String(data.complement || '').slice(0, 120),
    String(data.neighborhood || '').slice(0, 100),
    `${String(data.city || '').slice(0, 100)}/${String(data.state || '').slice(0, 2)}`,
    `CEP ${formatCep(data.cep)}`,
  ].filter(Boolean).join(' — ');

  return [
    'Olá! Gostaria de cotar o frete de um pedido da Zoryvena Perfumes.',
    '',
    `Nome: ${String(data.name || '').slice(0, 120)}`,
    `WhatsApp: ${String(data.whatsapp || '').slice(0, 20)}`,
    `E-mail: ${String(data.email || '').slice(0, 150)}`,
    `Endereço: ${address}`,
    '',
    'Itens:',
    ...lines,
    `Total dos produtos (${method === 'pix' ? 'Pix' : 'cartão'}): ${money.format(cartTotal(method))}`,
    '',
    'Aguardo o valor e o prazo do frete antes de realizar o pagamento.',
  ].join('\n');
}

if (!items.length) {
  if (content) content.hidden = true;
  if (empty) empty.hidden = false;
} else {
  ensurePolicyAcceptance();
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
    button.textContent = deliveryMethod() === 'shipping'
      ? 'Abrindo cotação…'
      : paymentMethod() === 'pix'
        ? 'Gerando QR Code…'
        : 'Preparando cartão…';
  }

  try {
    const data = Object.fromEntries(new FormData(form));
    data.delivery = deliveryMethod();
    data.payment = paymentMethod();
    data.deliveryLabel = data.delivery === 'pickup' ? 'Retirada combinada em Macaé' : 'Entrega com cotação antes do pagamento';
    data.whatsapp = digits(data.whatsapp);
    data.email = String(data.email || '').trim().toLowerCase();

    if (data.delivery === 'shipping') {
      data.cep = digits(data.cep);
      data.state = String(data.state || '').toUpperCase();
      data.address = [data.street, data.number, data.complement, data.neighborhood].filter(Boolean).join(', ');
      location.href = whatsappUrl(shippingQuoteMessage(data));
      return;
    }

    data.address = 'Retirada combinada em Macaé';
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
    showToast(error?.message || 'Não foi possível iniciar o pagamento. Confira os dados e tente novamente.');
    if (button) {
      button.disabled = false;
      button.textContent = original;
      updateSubmitButton();
    }
  }
});
