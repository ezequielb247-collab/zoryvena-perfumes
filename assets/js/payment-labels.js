const currentOrder = (() => {
  try { return JSON.parse(sessionStorage.getItem('zoryvena.last-order') || 'null'); }
  catch { return null; }
})();

const confirmationTitle = document.querySelector('#confirmedPaymentTitle');
const confirmationMessage = document.querySelector('#confirmedPaymentMessage');

if (currentOrder?.paymentMethod === 'card') {
  if (confirmationTitle) confirmationTitle.textContent = 'Cartão aprovado com sucesso';
  if (confirmationMessage) confirmationMessage.textContent = 'O Mercado Pago aprovou o cartão e o pedido já foi atualizado automaticamente.';
} else if (currentOrder?.paymentMethod === 'pix') {
  if (confirmationTitle) confirmationTitle.textContent = 'Pix recebido com sucesso';
  if (confirmationMessage) confirmationMessage.textContent = 'O Mercado Pago confirmou o Pix e o pedido já foi atualizado automaticamente.';
}
