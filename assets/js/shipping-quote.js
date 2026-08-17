import { money, showToast, whatsappUrl } from './store.js';
import { supabase } from './supabase.js';

const params = new URLSearchParams(location.search);
const orderId = String(params.get('pedido') || '').trim();
const statusToken = String(params.get('token') || '').trim();
const loading = document.querySelector('#shippingQuoteLoading');
const content = document.querySelector('#shippingQuoteContent');
const errorBox = document.querySelector('#shippingQuoteError');
const errorMessage = document.querySelector('#shippingQuoteErrorMessage');
const orderCode = document.querySelector('#shippingOrderCode');
const title = document.querySelector('#shippingQuoteTitle');
const message = document.querySelector('#shippingQuoteMessage');
const values = document.querySelector('#shippingQuoteValues');
const startButton = document.querySelector('#startShippingPayment');
const refreshButton = document.querySelector('#refreshShippingQuote');
const whatsapp = document.querySelector('#shippingWhatsapp');
let currentStatus = null;

const localQuote = (() => {
  try {
    const value = JSON.parse(sessionStorage.getItem('zoryvena.shipping-quote') || 'null');
    return value?.databaseId === orderId && value?.statusToken === statusToken ? value : null;
  } catch { return null; }
})();

function validCredential(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || ''));
}

function showError(text) {
  if (loading) loading.hidden = true;
  if (content) content.hidden = true;
  if (errorBox) errorBox.hidden = false;
  if (errorMessage) errorMessage.textContent = String(text || 'Não foi possível consultar a cotação.').slice(0, 300);
}

async function functionErrorMessage(error, fallback) {
  let details = error?.message || fallback;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      details = body?.error || details;
    }
  } catch { /* mantém mensagem disponível */ }
  return String(details || fallback).slice(0, 300);
}

function detailRow(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  const name = document.createElement('span');
  name.textContent = label;
  const strong = document.createElement('strong');
  strong.textContent = value;
  row.append(name, strong);
  return row;
}

function quoteExpired(status) {
  if (!status?.quoteExpiresAt) return false;
  const expires = new Date(status.quoteExpiresAt).getTime();
  return Number.isFinite(expires) && expires <= Date.now();
}

function updateWhatsapp(status) {
  if (!whatsapp) return;
  const text = status?.orderCode
    ? `Olá! Estou falando sobre a cotação de frete do pedido ${status.orderCode} da Zoryvena Perfumes.`
    : 'Olá! Gostaria de falar sobre uma cotação de frete da Zoryvena Perfumes.';
  whatsapp.href = whatsappUrl(text);
}

function render(status) {
  currentStatus = status;
  if (loading) loading.hidden = true;
  if (errorBox) errorBox.hidden = true;
  if (content) content.hidden = false;
  if (orderCode) orderCode.textContent = `Pedido ${String(status.orderCode || '').slice(0, 40)}`;
  updateWhatsapp(status);

  const expired = quoteExpired(status);
  values?.replaceChildren(
    detailRow('Produtos', money.format(Number(status.subtotal || 0))),
    detailRow('Frete', status.shippingQuotedAt ? money.format(Number(status.shipping || 0)) : 'Aguardando cotação'),
    detailRow('Total', money.format(Number(status.total || 0))),
    detailRow('Forma de pagamento', status.paymentMethod === 'pix' ? 'Pix' : 'Cartão'),
  );

  if (status.paid) {
    title.textContent = 'Pagamento aprovado';
    message.textContent = 'Seu pagamento já foi confirmado. A loja seguirá com a preparação e a entrega do pedido.';
    startButton.hidden = true;
    return;
  }

  if (status.status === 'Aguardando cotação de frete') {
    title.textContent = 'Cotação solicitada';
    message.textContent = 'Seu pedido foi registrado sem reservar estoque e sem gerar cobrança. Fale com a Zoryvena no WhatsApp para receber o valor do frete; depois volte a este mesmo link.';
    startButton.hidden = true;
    return;
  }

  if (status.status === 'Frete cotado') {
    if (expired) {
      title.textContent = 'Cotação expirada';
      message.textContent = 'O prazo desta cotação terminou. Fale com a Zoryvena para atualizar o valor antes de pagar.';
      startButton.hidden = true;
      return;
    }
    title.textContent = 'Frete cotado';
    message.textContent = 'Confira os valores. Ao continuar, preço e disponibilidade dos perfumes serão conferidos novamente e o estoque será reservado por tempo limitado.';
    startButton.hidden = false;
    startButton.textContent = 'Continuar para o pagamento';
    return;
  }

  if (['Aguardando pagamento', 'Pagamento em análise'].includes(status.status)) {
    title.textContent = status.status;
    message.textContent = 'O pagamento deste pedido já foi iniciado. Você pode continuar usando o botão abaixo enquanto a reserva estiver válida.';
    startButton.hidden = false;
    startButton.textContent = 'Continuar pagamento';
    return;
  }

  title.textContent = String(status.status || 'Cotação indisponível');
  message.textContent = ['Cancelado', 'Pagamento recusado', 'Reembolsado', 'Contestação'].includes(status.status)
    ? 'Este pedido não está disponível para iniciar um novo pagamento. Fale com a Zoryvena se precisar de ajuda.'
    : 'O pedido está em uma etapa que não permite iniciar o pagamento por este link.';
  startButton.hidden = true;
}

async function loadStatus() {
  if (!validCredential(orderId) || !validCredential(statusToken)) {
    showError('O link da cotação está incompleto ou inválido.');
    return;
  }
  if (refreshButton) refreshButton.disabled = true;
  try {
    const { data, error } = await supabase.functions.invoke('shipping-quote-status', {
      body: { orderId, statusToken },
    });
    if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível consultar a cotação.'));
    if (data?.error) throw new Error(data.error);
    render(data);
  } catch (error) {
    showError(error?.message || 'Não foi possível consultar a cotação.');
  } finally {
    if (refreshButton) refreshButton.disabled = false;
  }
}

async function startPayment() {
  if (!currentStatus || startButton.hidden) return;
  startButton.disabled = true;
  const original = startButton.textContent;
  startButton.textContent = currentStatus.paymentMethod === 'pix' ? 'Gerando Pix…' : 'Preparando cartão…';
  try {
    const { data: result, error } = await supabase.functions.invoke('create-order', {
      body: { action: 'start_shipping_payment', orderId, statusToken },
    });
    if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível iniciar o pagamento.'));
    if (result?.error) throw new Error(result.error);

    const order = {
      id: result.orderCode,
      databaseId: result.id,
      statusToken: result.statusToken || statusToken,
      total: Number(result.total || 0),
      paymentMethod: result.paymentMethod,
      paymentMode: result.paymentMode || result.paymentMethod,
      paymentUrl: result.paymentUrl || result.pix?.ticketUrl || '',
      mercadoPagoOrderId: result.mercadoPagoOrderId || '',
      paymentId: result.paymentId || '',
      cardPublicKey: result.cardPublicKey || '',
      testBuyerEmail: result.testBuyerEmail || '',
      pix: result.pix || null,
      environment: result.environment,
      reservationExpiresAt: result.reservationExpiresAt || '',
      containsPreorder: Boolean(result.containsPreorder),
      containsReadyStock: Boolean(result.containsReadyStock),
      createdAt: Date.now(),
      delivery: 'shipping',
      deliveryLabel: 'Entrega com frete cotado',
      email: result.customerEmail || localQuote?.email || '',
      name: localQuote?.name || '',
    };
    sessionStorage.setItem('zoryvena.last-order', JSON.stringify(order));

    if (order.paymentMode === 'pix' && (order.pix?.qrCode || order.pix?.ticketUrl)) {
      location.href = '/pagamento.html?resultado=pix';
      return;
    }
    if (order.paymentMode === 'card_brick') {
      location.href = '/cartao.html';
      return;
    }
    if (order.paymentUrl) {
      location.href = order.paymentUrl;
      return;
    }
    throw new Error('O endereço de pagamento não foi gerado.');
  } catch (error) {
    showToast(error?.message || 'Não foi possível iniciar o pagamento.');
    await loadStatus();
  } finally {
    startButton.disabled = false;
    startButton.textContent = original;
  }
}

refreshButton?.addEventListener('click', loadStatus);
startButton?.addEventListener('click', startPayment);
loadStatus();
