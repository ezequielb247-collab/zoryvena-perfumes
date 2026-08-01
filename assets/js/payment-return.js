import { saveCart, whatsappUrl } from './store.js';

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

const approved = result === 'sucesso' || result === 'approved';
const failed = result === 'falha' || result === 'failure' || result === 'rejected';

if (approved) {
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

if (lastOrder?.id) {
  order.textContent = `Pedido ${lastOrder.id}`;
  whatsapp.href = whatsappUrl(`Olá! Gostaria de atendimento sobre o pedido ${lastOrder.id}.`);
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener noreferrer';
} else {
  order.textContent = params.get('external_reference') ? `Referência: ${params.get('external_reference')}` : '';
  whatsapp.href = '/contato.html';
}
