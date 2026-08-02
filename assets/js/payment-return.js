import { money, saveCart, whatsappUrl } from './store.js';

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
const pixPayment = document.querySelector('#pixPayment');
const pixAmount = document.querySelector('#pixAmount');
const pixCountdown = document.querySelector('#pixCountdown');
const pixQrVisual = document.querySelector('#pixQrVisual');
const pixCode = document.querySelector('#pixCode');
const copyPix = document.querySelector('#copyPix');
const openPixTicket = document.querySelector('#openPixTicket');
const pixCopyFeedback = document.querySelector('#pixCopyFeedback');

const approved = result === 'sucesso' || result === 'approved';
const failed = result === 'falha' || result === 'failure' || result === 'rejected';
const isPix = result === 'pix' && lastOrder?.paymentMethod === 'pix' && lastOrder?.pix;

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
      clearInterval(timer);
    }
  };

  update();
  const timer = setInterval(update, 1000);
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

if (isPix) {
  saveCart([]);
  const pix = lastOrder.pix;
  eyebrow.textContent = 'Pagamento por Pix';
  title.textContent = 'Escaneie o QR Code para pagar';
  message.textContent = 'Após o pagamento, a confirmação será processada pelo Mercado Pago e vinculada ao seu pedido.';
  pixPayment.hidden = false;
  pixAmount.textContent = money.format(Number(lastOrder.total || 0));
  pixCode.value = pix.qrCode || '';
  renderQrCode(pix);
  startCountdown(lastOrder);
  copyPix?.addEventListener('click', copyPixCode);

  if (pix.ticketUrl) {
    openPixTicket.href = pix.ticketUrl;
    openPixTicket.hidden = false;
  }

  primary.textContent = 'Voltar à loja';
  primary.href = '/catalogo.html';
} else if (approved) {
  saveCart([]);
  eyebrow.textContent = 'Teste concluído';
  title.textContent = 'Pagamento aprovado no ambiente de teste';
  message.textContent = 'O retorno do Mercado Pago funcionou. O pedido será atualizado automaticamente pelo webhook.';
  primary.textContent = 'Voltar ao catálogo';
  primary.href = '/catalogo.html';
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
}

configureOrderSupport();
