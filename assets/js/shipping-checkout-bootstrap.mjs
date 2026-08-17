const digits = value => String(value || '').replace(/\D/g, '');

async function functionErrorMessage(error, fallback) {
  let details = error?.message || fallback;
  try {
    const response = error?.context;
    if (response && typeof response.json === 'function') {
      const body = await response.json();
      details = body?.error || details;
    }
  } catch { /* mantém a mensagem disponível */ }
  return String(details || fallback).slice(0, 300);
}

if (typeof document !== 'undefined') {
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'checkoutForm') return;
    const submitted = new FormData(form);
    if (submitted.get('delivery') !== 'shipping') return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (!form.reportValidity()) return;

    const button = form.querySelector('button[type="submit"]');
    const original = button?.textContent || 'Solicitar cotação de frete';
    if (button) {
      button.disabled = true;
      button.textContent = 'Registrando cotação…';
    }

    try {
      const [{ cartDetails, showToast }, { supabase }] = await Promise.all([
        import('./store.js'),
        import('./supabase.js'),
      ]);
      const items = cartDetails().map(item => ({ id: item.id, quantity: item.quantity }));
      if (!items.length) throw new Error('Seu carrinho não possui itens disponíveis.');

      const data = Object.fromEntries(submitted);
      data.delivery = 'shipping';
      data.payment = submitted.get('payment') === 'card' ? 'card' : 'pix';
      data.deliveryLabel = 'Entrega com cotação antes do pagamento';
      data.whatsapp = digits(data.whatsapp);
      data.email = String(data.email || '').trim().toLowerCase();
      data.cep = digits(data.cep);
      data.state = String(data.state || '').trim().toUpperCase();
      data.address = [data.street, data.number, data.complement, data.neighborhood].filter(Boolean).join(', ');

      const { data: result, error } = await supabase.functions.invoke('create-order', {
        body: {
          customer: data,
          items,
          notes: data.notes || null,
          paymentMethod: data.payment,
        },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Não foi possível registrar a cotação de frete.'));
      if (result?.error) throw new Error(result.error);
      if (result?.quoteMode !== 'manual_shipping' || !result?.id || !result?.statusToken) {
        throw new Error('A cotação não foi registrada corretamente. Nenhum pagamento foi iniciado.');
      }

      const quote = {
        databaseId: result.id,
        id: result.orderCode,
        statusToken: result.statusToken,
        quoteStatus: result.quoteStatus || 'Aguardando cotação de frete',
        quoteExpiresAt: result.quoteExpiresAt || '',
        paymentMethod: data.payment,
        environment: result.environment,
        createdAt: Date.now(),
        ...data,
      };
      sessionStorage.setItem('zoryvena.shipping-quote', JSON.stringify(quote));
      location.href = `/frete.html?pedido=${encodeURIComponent(result.id)}&token=${encodeURIComponent(result.statusToken)}`;
    } catch (error) {
      const { showToast } = await import('./store.js');
      showToast(error?.message || 'Não foi possível registrar a cotação de frete.');
      if (button) {
        button.disabled = false;
        button.textContent = original;
      }
    }
  }, true);
}
