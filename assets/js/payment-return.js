import { money, saveCart, whatsappUrl, getOrderStatus } from './store.js';
import { effectivePaymentExpiry, paymentTimeRemaining } from './payment-state.mjs';

const params = new URLSearchParams(location.search);
const result = params.get('resultado') || params.get('status') || 'pendente';
const lastOrder = (() => {
  try { return JSON.parse(sessionStorage.getItem('zoryvena.last-order') || 'null'); }
  catch { return null; }
})();

const title = document.querySelector('#paymentTitle');
const message = document.querySelector('#paymentMessage');
const eyebrow = document.querySelector('#paymentEyebrow');
const order = document.querySelector('#paymentOrder');
const primary = document.querySelector('#paymentPrimary');
const whatsapp = document.querySelector('#paymentWhatsapp');
const paymentCard = document.querySelector('#paymentCard');
const pixPayment = document.querySelector('#pixPayment');
const pixAmount = document.querySelector('#pixAmount');
const pixCountdown = document.querySelector('#pixCountdown');
const pixQrVisual = document.querySelector('#pixQrVisual');
const pixCode = document.querySelector('#pixCode');
const copyPix = document.querySelector('#copyPix');
const openPixTicket = document.querySelector('#openPixTicket');
const pixCopyFeedback = document.querySelector('#pixCopyFeedback');
const paymentConfirmed = document.querySelector('#paymentConfirmed');
const confirmedOrderCode = document.querySelector('#confirmedOrderCode');
const environmentNote = document.querySelector('#environmentNote');

const approved = result === 'sucesso' || result === 'approved';
const failed = result === 'falha' || result === 'failure' || result === 'rejected';
const isPix = result === 'pix' && lastOrder?.paymentMethod === 'pix' && lastOrder?.pix;
const isTestEnvironment = lastOrder?.environment === 'test';

let countdownTimer = null;
let statusTimer = null;
let statusRequestRunning = false;
let finalStateRendered = false;

if (environmentNote) {
  environmentNote.hidden = !isTestEnvironment;
  if (isTestEnvironment) environmentNote.textContent = 'Ambiente de teste: nenhuma cobrança real é realizada.';
}

function stopTimers() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (statusTimer) clearInterval(statusTimer);
  countdownTimer = null;
  statusTimer = null;
}

function minimizeStoredOrder(status = '') {
  if (!lastOrder) return;
  const minimal = {
    id: String(lastOrder.id || '').slice(0, 60),
    paymentMethod: lastOrder.paymentMethod === 'card' ? 'card' : 'pix',
    environment: lastOrder.environment === 'production' ? 'production' : 'test',
    paymentStatus: String(status || '').slice(0, 80),
    completedAt: Date.now(),
  };
  sessionStorage.setItem('zoryvena.last-order', JSON.stringify(minimal));
}

function safeMercadoPagoUrl(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase();
    const allowed = host === 'mercadopago.com'
      || host.endsWith('.mercadopago.com')
      || host === 'mercadopago.com.br'
      || host.endsWith('.mercadopago.com.br')
      || host === 'mercadolivre.com.br'
      || host.endsWith('.mercadolivre.com.br');
    return url.protocol === 'https:' && allowed ? url.href : '';
  } catch {
    return '';
  }
}

function configureOrderSupport() {
  if (lastOrder?.id) {
    const code = String(lastOrder.id).slice(0, 60);
    order.textContent = `Pedido ${code}`;
    whatsapp.href = whatsappUrl(`Olá! Gostaria de atendimento sobre o pedido ${code}.`);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
  } else {
    const reference = String(params.get('external_reference') || '').slice(0, 80);
    order.textContent = reference ? `Referência: ${reference}` : '';
    whatsapp.href = '/contato.html';
  }
}

function renderQrCode(pix) {
  if (!pixQrVisual) return;
  pixQrVisual.replaceChildren();

  const base64 = String(pix.qrCodeBase64 || '');
  if (base64 && base64.length <= 1_000_000 && /^[A-Za-z0-9+/=]+$/.test(base64)) {
    const image = document.createElement('img');
    image.src = `data:image/png;base64,${base64}`;
    image.alt = 'QR Code Pix do pedido';
    image.width = 258;
    image.height = 258;
    pixQrVisual.appendChild(image);
    return;
  }

  const qrCode = String(pix.qrCode || '').slice(0, 5000);
  if (qrCode && window.QRCode) {
    new window.QRCode(pixQrVisual, {
      text: qrCode,
      width: 258,
      height: 258,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return;
  }

  pixQrVisual.textContent = 'Use o botão abaixo para abrir as instruções do Pix.';
}

function startCountdown(orderData) {
  const expiresAt = effectivePaymentExpiry({
    createdAt: orderData?.createdAt,
    pixExpiresInSeconds: orderData?.pix?.expiresInSeconds,
    reservationExpiresAt: orderData?.reservationExpiresAt,
  });

  const update = () => {
    const remaining = paymentTimeRemaining(expiresAt);
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    if (pixCountdown) pixCountdown.textContent = `${minutes}:${secs}`;

    if (remaining <= 0) {
      if (pixCountdown) {
        pixCountdown.textContent = 'Expirado';
        pixCountdown.classList.add('expired');
      }
      if (copyPix) copyPix.disabled = true;
      if (pixCopyFeedback) pixCopyFeedback.textContent = 'Este código ou a reserva expirou. Seu carrinho foi mantido para você gerar um novo pedido.';
      if (primary) {
        primary.textContent = 'Gerar novo pedido';
        primary.href = '/checkout.html';
      }
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = null;
      checkOrderStatus();
    }
  };

  update();
  countdownTimer = setInterval(update, 1000);
}

async function copyPixCode() {
  const code = String(lastOrder?.pix?.qrCode || '').slice(0, 5000);
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    pixCopyFeedback.textContent = 'Código Pix copiado com sucesso.';
    copyPix.textContent = 'Código copiado ✓';
    setTimeout(() => { copyPix.textContent = 'Copiar código Pix'; }, 2200);
  } catch {
    pixCode.focus();
    pixCode.select();
    document.execCommand('copy');
    pixCopyFeedback.textContent = 'Código Pix copiado.';
  }
}

function renderPaymentApproved(statusData = {}) {
  if (finalStateRendered) return;
  finalStateRendered = true;
  stopTimers();
  saveCart([]);

  if (pixPayment) pixPayment.hidden = true;
  if (paymentConfirmed) paymentConfirmed.hidden = false;
  if (confirmedOrderCode) confirmedOrderCode.textContent = String(statusData.orderCode || lastOrder?.id || '').slice(0, 60);

  paymentCard?.classList.add('payment-card-approved');
  if (eyebrow) eyebrow.hidden = true;
  if (title) title.hidden = true;
  message.textContent = 'Seu pagamento foi confirmado. Confira abaixo os detalhes do pedido.';
  primary.textContent = 'Continuar comprando';
  primary.href = '/catalogo.html';

  if (environmentNote && isTestEnvironment) {
    environmentNote.hidden = false;
    environmentNote.textContent = 'Teste concluído: o webhook e a atualização automática do pedido funcionaram corretamente.';
  }
  minimizeStoredOrder('Pagamento aprovado');
}

function renderTerminalStatus(statusData) {
  if (statusData?.approved) {
    renderPaymentApproved(statusData);
    return;
  }
  if (!statusData?.terminal || finalStateRendered) return;

  finalStateRendered = true;
  stopTimers();
  if (pixPayment) pixPayment.hidden = true;
  eyebrow.hidden = false;
  title.hidden = false;
  eyebrow.textContent = 'Pagamento não concluído';
  title.textContent = String(statusData.status || 'Pagamento não aprovado').slice(0, 80);
  message.textContent = 'O pagamento não foi confirmado. Seu carrinho foi mantido para você gerar uma nova cobrança.';
  primary.textContent = 'Tentar novamente';
  primary.href = '/checkout.html';
  minimizeStoredOrder(statusData.status || 'Pagamento não concluído');
}

async function checkOrderStatus() {
  if (!lastOrder?.databaseId || !lastOrder?.statusToken || statusRequestRunning || finalStateRendered) return;
  statusRequestRunning = true;
  try {
    const statusData = await getOrderStatus(lastOrder);
    if (statusData?.approved) {
      renderPaymentApproved(statusData);
      return;
    }
    renderTerminalStatus(statusData);
    if (!finalStateRendered && pixCopyFeedback) {
      pixCopyFeedback.textContent = 'Aguardando a confirmação automática do pagamento…';
    }
  } catch {
    if (!finalStateRendered && pixCopyFeedback) {
      pixCopyFeedback.textContent = 'Pagamento gerado. A confirmação será atualizada automaticamente.';
    }
  } finally {
    statusRequestRunning = false;
  }
}

function startStatusMonitoring() {
  if (!lastOrder?.databaseId || !lastOrder?.statusToken) return;
  checkOrderStatus();
  statusTimer = setInterval(() => {
    if (!document.hidden) checkOrderStatus();
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOrderStatus();
  });
}

if (isPix) {
  const pix = lastOrder.pix;
  const chargedAmount = Number(pix.chargedAmount || lastOrder.total || 0);
  const actualOrderTotal = Number(pix.actualOrderTotal || lastOrder.total || 0);

  eyebrow.textContent = isTestEnvironment ? 'Pagamento por Pix — teste' : 'Pagamento por Pix';
  title.textContent = isTestEnvironment ? 'Escaneie o QR Code para testar' : 'Escaneie o QR Code para pagar';
  message.textContent = pix.simulated
    ? `O sandbox do Mercado Pago exige um Pix predefinido de ${money.format(chargedAmount)}. O total real do pedido é ${money.format(actualOrderTotal)} e será usado somente quando ativarmos a produção.`
    : 'Após o pagamento, a confirmação será processada pelo Mercado Pago e vinculada ao seu pedido.';

  pixPayment.hidden = false;
  pixAmount.textContent = money.format(chargedAmount);
  pixCode.value = String(pix.qrCode || '').slice(0, 5000);
  renderQrCode(pix);
  startCountdown(lastOrder);
  startStatusMonitoring();
  copyPix?.addEventListener('click', copyPixCode);

  const ticketUrl = safeMercadoPagoUrl(pix.ticketUrl);
  if (ticketUrl) {
    openPixTicket.href = ticketUrl;
    openPixTicket.hidden = false;
  }

  primary.textContent = 'Voltar à loja';
  primary.href = '/catalogo.html';
} else if (approved) {
  renderPaymentApproved({ orderCode: lastOrder?.id });
} else if (failed) {
  eyebrow.textContent = 'Pagamento não concluído';
  title.textContent = 'Não foi possível concluir o pagamento';
  message.textContent = 'O carrinho foi mantido para que você possa tentar novamente ou escolher outra forma de pagamento.';
  primary.textContent = 'Tentar novamente';
  primary.href = '/checkout.html';
  minimizeStoredOrder('Pagamento não concluído');
} else {
  eyebrow.textContent = 'Pagamento pendente';
  title.textContent = 'O Mercado Pago está processando o pagamento';
  message.textContent = 'O pedido foi registrado e o status será atualizado automaticamente quando houver uma confirmação. Seu carrinho só será limpo após a aprovação.';
  primary.textContent = 'Voltar ao catálogo';
  primary.href = '/catalogo.html';
  startStatusMonitoring();
}

configureOrderSupport();
