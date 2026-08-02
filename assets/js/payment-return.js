import { money, saveCart, whatsappUrl, getOrderStatus } from './store.js';

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

let countdownTimer = null;
let statusTimer = null;
let statusRequestRunning = false;
let finalStateRendered = false;

function stopTimers() {
  if (countdownTimer) clearInterval(countdownTimer);
  if (statusTimer) clearInterval(statusTimer);
  countdownTimer = null;
  statusTimer = null;
}

function configureOrderSupport() {
  if (lastOrder?.id) {
    order.textContent = `Pedido ${lastOrder.id}`;
    whatsapp.href = whatsappUrl(`Olá! Gostaria de atendimento sobre o pedido ${lastOrder.id}.`);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
  } else {
    order.textContent = params.get('external_reference') ? `Referência: ${params.get('external_reference')}` : '';
    whatsapp.href = '/contato.html';
  }
}

function renderQrCode(pix) {
  if (!pixQrVisual) return;
  pixQrVisual.innerHTML = '';

  if (pix.qrCodeBase64) {
    const image = document.createElement('img');
    image.src = `data:image/png;base64,${pix.qrCodeBase64}`;
    image.alt = 'QR Code Pix do pedido';
    image.width = 258;
    image.height = 258;
    pixQrVisual.appendChild(image);
    return;
  }

  if (pix.qrCode && window.QRCode) {
    new window.QRCode(pixQrVisual, {
      text: pix.qrCode,
      width: 258,
      height: 258,
      correctLevel: window.QRCode.CorrectLevel.M,
    });
    return;
  }

  pixQrVisual.textContent = 'Use o botão abaixo para abrir as instruções do Pix.';
}

function startCountdown(orderData) {
  const seconds = Number(orderData?.pix?.expiresInSeconds || 1800);
  const createdAt = Number(orderData?.createdAt || Date.now());
  const expiresAt = createdAt + seconds * 1000;

  const update = () => {
    const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
    const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    if (pixCountdown) pixCountdown.textContent = `${minutes}:${secs}`;

    if (remaining <= 0) {
      if (pixCountdown) {
        pixCountdown.textContent = 'Expirado';
        pixCountdown.classList.add('expired');
      }
      if (copyPix) copyPix.disabled = true;
      if (pixCopyFeedback) pixCopyFeedback.textContent = 'Este código expirou. Volte ao checkout para gerar um novo Pix.';
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = null;
    }
  };

  update();
  countdownTimer = setInterval(update, 1000);
}

async function copyPixCode() {
  const code = String(lastOrder?.pix?.qrCode || '');
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
  if (confirmedOrderCode) confirmedOrderCode.textContent = statusData.orderCode || lastOrder?.id || '';

  paymentCard?.classList.add('payment-card-approved');
  if (eyebrow) eyebrow.hidden = true;
  if (title) title.hidden = true;
  message.textContent = 'Seu pagamento foi confirmado. Confira abaixo os detalhes do pedido.';
  primary.textContent = 'Continuar comprando';
  primary.href = '/catalogo.html';

  if (environmentNote && lastOrder?.environment === 'test') {
    environmentNote.textContent = 'Teste concluído: o webhook e a atualização automática do pedido funcionaram corretamente.';
  }
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
  title.textContent = statusData.status || 'Pagamento não aprovado';
  message.textContent = 'O pagamento não foi confirmado. Você pode voltar ao checkout e gerar uma nova cobrança.';
  primary.textContent = 'Tentar novamente';
  primary.href = '/checkout.html';
}

async function checkOrderStatus() {
  if (!lastOrder?.databaseId || statusRequestRunning || finalStateRendered) return;
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
  } catch (error) {
    console.warn('Não foi possível atualizar o status do pedido.', error);
    if (!finalStateRendered && pixCopyFeedback) {
      pixCopyFeedback.textContent = 'Pagamento gerado. A confirmação será atualizada automaticamente.';
    }
  } finally {
    statusRequestRunning = false;
  }
}

function startStatusMonitoring() {
  if (!lastOrder?.databaseId) return;
  checkOrderStatus();
  statusTimer = setInterval(() => {
    if (!document.hidden) checkOrderStatus();
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOrderStatus();
  });
}

if (isPix) {
  saveCart([]);
  const pix = lastOrder.pix;
  const chargedAmount = Number(pix.chargedAmount || lastOrder.total || 0);
  const actualOrderTotal = Number(pix.actualOrderTotal || lastOrder.total || 0);

  eyebrow.textContent = 'Pagamento por Pix';
  title.textContent = 'Escaneie o QR Code para testar';
  message.textContent = pix.simulated
    ? `O sandbox do Mercado Pago exige um Pix predefinido de ${money.format(chargedAmount)}. O total real do pedido é ${money.format(actualOrderTotal)} e será usado somente quando ativarmos a produção.`
    : 'Após o pagamento, a confirmação será processada pelo Mercado Pago e vinculada ao seu pedido.';

  pixPayment.hidden = false;
  pixAmount.textContent = money.format(chargedAmount);
  pixCode.value = pix.qrCode || '';
  renderQrCode(pix);
  startCountdown(lastOrder);
  startStatusMonitoring();
  copyPix?.addEventListener('click', copyPixCode);

  if (pix.ticketUrl) {
    openPixTicket.href = pix.ticketUrl;
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
} else {
  saveCart([]);
  eyebrow.textContent = 'Pagamento pendente';
  title.textContent = 'O Mercado Pago está processando o pagamento';
  message.textContent = 'O pedido foi registrado e o status será atualizado automaticamente quando houver uma confirmação.';
  primary.textContent = 'Voltar ao catálogo';
  primary.href = '/catalogo.html';
  startStatusMonitoring();
}

configureOrderSupport();