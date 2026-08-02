import { supabase } from './supabase.js';
import { money, showToast } from './store.js';

const TEST_PUBLIC_KEY = 'APP_USR-74283ccc-271a-4441-ac0b-94059e14e820';
const loading = document.querySelector('#cardLoading');
const messageBox = document.querySelector('#cardPaymentMessage');
const orderCode = document.querySelector('#cardOrderCode');
const orderTotal = document.querySelector('#cardOrderTotal');
const orderEmail = document.querySelector('#cardOrderEmail');

const order = (() => {
  try { return JSON.parse(sessionStorage.getItem('zoryvena.last-order') || 'null'); }
  catch { return null; }
})();

function showMessage(message, type = 'error') {
  if (!messageBox) return;
  messageBox.hidden = false;
  messageBox.dataset.type = type;
  messageBox.textContent = message;
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
  };
  return messages[String(detail || '')] || 'Não foi possível aprovar o cartão. Revise os dados e tente novamente.';
}

async function functionErrorMessage(error, fallback) {
  let details = error?.message || fallback;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      details = body?.error || details;
    }
  } catch { /* mantém mensagem padrão */ }
  return details || fallback;
}

async function processCard(cardData) {
  const submissionId = crypto.randomUUID();
  const { data, error } = await supabase.functions.invoke('process-card-payment', {
    body: {
      orderId: order.databaseId,
      statusToken: order.statusToken,
      submissionId,
      cardData,
    },
  });

  if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível processar o cartão.'));
  if (data?.error) throw new Error(data.error);

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

  orderCode.textContent = `Pedido ${order.id}`;
  orderTotal.textContent = money.format(Number(order.total || 0));
  orderEmail.textContent = order.email || 'E-mail do pedido';

  if (!window.MercadoPago) {
    showMessage('Não foi possível carregar o formulário do Mercado Pago. Atualize a página e tente novamente.');
    if (loading) loading.hidden = true;
    return;
  }

  const mp = new window.MercadoPago(TEST_PUBLIC_KEY, { locale: 'pt-BR' });
  const bricksBuilder = mp.bricks();

  const settings = {
    initialization: {
      amount: Number(order.total || 0),
      payer: {
        email: order.email || '',
      },
    },
    customization: {
      visual: {
        style: {
          theme: 'dark',
        },
        texts: {
          formTitle: 'Cartão de crédito',
          formSubmit: 'Pagar com cartão',
          installmentsSectionTitle: 'Escolha as parcelas',
        },
      },
      paymentMethods: {
        minInstallments: 1,
        maxInstallments: 3,
      },
    },
    callbacks: {
      onReady: () => {
        if (loading) loading.hidden = true;
      },
      onSubmit: cardData => new Promise(async (resolve, reject) => {
        if (messageBox) messageBox.hidden = true;
        try {
          const result = await processCard(cardData);
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
          const friendly = friendlyStatusDetail(result.statusDetail);
          showMessage(friendly);
          showToast(friendly);
          resolve();
        } catch (error) {
          console.error(error);
          const friendly = error?.message || 'Não foi possível processar o cartão.';
          showMessage(friendly);
          showToast(friendly);
          reject(error);
        }
      }),
      onError: error => {
        console.error('Mercado Pago Brick error', error);
        if (loading) loading.hidden = true;
        showMessage('O formulário seguro apresentou um erro. Atualize a página e tente novamente.');
      },
    },
  };

  try {
    window.cardPaymentBrickController = await bricksBuilder.create(
      'cardPayment',
      'cardPaymentBrick_container',
      settings,
    );
  } catch (error) {
    console.error(error);
    if (loading) loading.hidden = true;
    showMessage('Não foi possível iniciar o pagamento com cartão. Atualize a página e tente novamente.');
  }
}

window.addEventListener('beforeunload', () => {
  window.cardPaymentBrickController?.unmount?.();
});

renderBrick();
