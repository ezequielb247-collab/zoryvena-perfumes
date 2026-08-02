import { supabase } from './supabase.js';
import { money, showToast } from './store.js';

const loading = document.querySelector('#cardLoading');
const messageBox = document.querySelector('#cardPaymentMessage');
const orderCode = document.querySelector('#cardOrderCode');
const orderTotal = document.querySelector('#cardOrderTotal');
const orderEmail = document.querySelector('#cardOrderEmail');
const testNote = document.querySelector('.card-test-note');

const order = (() => {
  try { return JSON.parse(sessionStorage.getItem('zoryvena.last-order') || 'null'); }
  catch { return null; }
})();

function showMessage(message, type = 'error') {
  if (!messageBox) return;
  messageBox.hidden = false;
  messageBox.dataset.type = type;
  messageBox.textContent = String(message || '').slice(0, 300);
}

function friendlyStatusDetail(detail) {
  const messages = {
    accredited: 'Pagamento aprovado.',
    cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
    cc_rejected_bad_filled_date: 'Confira a validade do cartão.',
    cc_rejected_bad_filled_security_code: 'Confira o código de segurança do cartão.',
    cc_rejected_bad_filled_other: 'Confira os dados do cartão e do titular.',
    cc_rejected_insufficient_amount: 'O cartão não possui limite suficiente.',
    cc_rejected_high_risk: 'O Mercado Pago recusou o pagamento por segurança.',
    cc_rejected_call_for_authorize: 'O titular precisa autorizar a compra com o emissor.',
    cc_rejected_card_disabled: 'O cartão está desabilitado para esta compra.',
    cc_rejected_duplicated_payment: 'Este pagamento já foi processado.',
    cc_rejected_max_attempts: 'O limite de tentativas foi atingido. Gere um novo pedido.',
    cc_rejected_other_reason: 'O cartão foi recusado. Tente outro cartão ou revise os dados.',
    rejected: 'O cartão foi recusado. Revise os dados ou tente outro cartão.',
    failed: 'O cartão foi recusado. Revise os dados ou tente outro cartão.',
  };
  return messages[String(detail || '')] || 'Não foi possível aprovar o cartão. Revise os dados e tente novamente.';
}

async function functionErrorMessage(error, fallback) {
  let details = fallback;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      details = body?.error || details;
    }
  } catch { /* mantém mensagem padrão */ }
  return String(details || fallback).slice(0, 300);
}

function reservationExpired() {
  const expiry = new Date(order?.reservationExpiresAt || 0).getTime();
  return !Number.isFinite(expiry) || expiry <= Date.now();
}

async function processCard(cardData) {
  if (reservationExpired()) throw new Error('A reserva deste pedido expirou. Volte ao carrinho e gere um novo pedido.');
  const { data, error } = await supabase.functions.invoke('process-card-payment', {
    body: {
      orderId: order.databaseId,
      statusToken: order.statusToken,
      cardData,
    },
  });

  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível processar o cartão.'));
  if (data?.error) throw new Error(data.error);

  order.mercadoPagoOrderId = data.mercadoPagoOrderId || '';
  order.paymentId = data.paymentId || '';
  order.paymentStatus = data.status || '';
  order.paymentStatusDetail = data.statusDetail || '';
  sessionStorage.setItem('zoryvena.last-order', JSON.stringify(order));
  return data;
}

async function renderBrick() {
  if (!order || order.paymentMethod !== 'card' || order.paymentMode !== 'card_brick' || !order.databaseId || !order.statusToken) {
    location.replace('/checkout.html');
    return;
  }

  orderCode.textContent = `Pedido ${String(order.id || '').slice(0, 40)}`;
  orderTotal.textContent = money.format(Number(order.total || 0));
  orderEmail.textContent = String(order.email || 'E-mail do pedido').slice(0, 150);
  if (testNote) testNote.hidden = order.environment !== 'test';

  if (reservationExpired()) {
    showMessage('A reserva deste pedido expirou. Volte ao carrinho e gere um novo pedido.');
    if (loading) loading.hidden = true;
    return;
  }

  if (!order.cardPublicKey) {
    showMessage('Este pedido foi criado com uma configuração antiga. Volte ao checkout e gere um pedido novo.');
    if (loading) loading.hidden = true;
    return;
  }

  if (!window.MercadoPago) {
    showMessage('Não foi possível carregar o formulário do Mercado Pago. Atualize a página e tente novamente.');
    if (loading) loading.hidden = true;
    return;
  }

  const payerEmail = order.environment === 'test'
    ? (order.testBuyerEmail || 'test@testuser.com')
    : String(order.email || '');
  const mp = new window.MercadoPago(order.cardPublicKey, { locale: 'pt-BR' });
  const bricksBuilder = mp.bricks();

  const settings = {
    initialization: {
      amount: Number(order.total || 0),
      payer: { email: payerEmail },
    },
    customization: {
      visual: {
        style: { theme: 'dark' },
        texts: {
          formTitle: 'Cartão de crédito',
          formSubmit: 'Pagar com cartão',
          installmentsSectionTitle: 'Escolha as parcelas',
        },
      },
      paymentMethods: { minInstallments: 1, maxInstallments: 3 },
    },
    callbacks: {
      onReady: () => { if (loading) loading.hidden = true; },
      onSubmit: (cardData, additionalData) => new Promise(async (resolve, reject) => {
        if (messageBox) messageBox.hidden = true;
        try {
          const result = await processCard({
            ...cardData,
            payment_type_id: additionalData?.paymentTypeId || 'credit_card',
          });
          if (result.approved) {
            location.href = '/pagamento.html?resultado=sucesso';
            resolve();
            return;
          }
          if (result.pending) {
            location.href = '/pagamento.html?resultado=pendente';
            resolve();
            return;
          }
          const friendly = friendlyStatusDetail(result.statusDetail || result.status);
          showMessage(friendly);
          showToast(friendly);
          resolve();
        } catch (error) {
          const friendly = error?.message || 'Não foi possível processar o cartão.';
          showMessage(friendly);
          showToast(friendly);
          reject(new Error(friendly));
        }
      }),
      onError: () => {
        if (loading) loading.hidden = true;
        showMessage('O formulário seguro apresentou um erro. Atualize a página e tente novamente.');
      },
    },
  };

  try {
    window.cardPaymentBrickController = await bricksBuilder.create('cardPayment', 'cardPaymentBrick_container', settings);
  } catch {
    if (loading) loading.hidden = true;
    showMessage('Não foi possível iniciar o pagamento com cartão. Atualize a página e tente novamente.');
  }
}

window.addEventListener('beforeunload', () => {
  window.cardPaymentBrickController?.unmount?.();
});

renderBrick();
