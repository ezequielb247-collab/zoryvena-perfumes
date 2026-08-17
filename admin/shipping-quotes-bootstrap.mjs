function isQuoteStatus(value) {
  return ['Aguardando cotação de frete', 'Frete cotado'].includes(String(value || ''));
}

function ensureFilterOptions() {
  const filter = document.querySelector('#orderFulfillmentFilter');
  if (!filter || filter.querySelector('option[value="Aguardando cotação de frete"]')) return;
  const first = filter.querySelector('option[value="Aguardando pagamento"]');
  for (const status of ['Aguardando cotação de frete', 'Frete cotado']) {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    first?.before(option);
  }
}

function ensureQuotePanel() {
  const grid = document.querySelector('#orderModal .order-detail-grid');
  if (!grid || document.querySelector('#shippingQuoteAdmin')) return;
  const card = document.createElement('article');
  card.className = 'order-detail-card full';
  card.id = 'shippingQuoteAdmin';
  card.hidden = true;
  card.innerHTML = `
    <h3>Cotação de frete</h3>
    <p id="shippingQuoteAdminStatus">Informe o valor do frete antes de enviar o link de pagamento ao cliente.</p>
    <div class="order-admin-controls">
      <label>Valor do frete<input id="shippingQuoteAmount" inputmode="decimal" placeholder="0,00" autocomplete="off"></label>
      <label>Link seguro para o cliente<input id="shippingQuoteLink" readonly></label>
    </div>
    <div class="admin-modal-footer">
      <button class="admin-action" id="copyShippingQuoteLink" type="button" hidden>Copiar link de pagamento</button>
      <button class="admin-action primary" id="saveShippingQuote" type="button">Salvar cotação</button>
    </div>`;
  const internal = [...grid.children].find(node => node.querySelector?.('#modalAdminNotes'));
  if (internal) grid.insertBefore(card, internal);
  else grid.append(card);
}

function decorateQuoteRows() {
  document.querySelectorAll('#adminOrdersBody tr').forEach(row => {
    const status = row.querySelector('.status-badge')?.textContent?.trim();
    if (!isQuoteStatus(status)) return;
    const select = row.querySelector('[data-fulfillment-id]');
    if (!select) return;
    select.replaceChildren(new Option(status, status, true, true));
    select.disabled = true;
    select.title = 'O andamento será liberado depois que o pagamento for aprovado.';
  });
}

if (typeof document !== 'undefined') {
  ensureFilterOptions();
  ensureQuotePanel();
  const ordersBody = document.querySelector('#adminOrdersBody');
  if (ordersBody) new MutationObserver(decorateQuoteRows).observe(ordersBody, { childList: true, subtree: true });
  decorateQuoteRows();

  let currentOrder = null;

  async function loadQuote(orderId) {
    ensureQuotePanel();
    const [{ supabase }, { money, showToast }] = await Promise.all([
      import('../assets/js/supabase.js'),
      import('../assets/js/store.js'),
    ]);
    const { data: order, error } = await supabase.from('orders').select(
      'id,order_code,status,fulfillment_status,shipping,subtotal,total,public_status_token,address,shipping_quoted_at,shipping_quote_expires_at,inventory_reserved_at,admin_notes'
    ).eq('id', orderId).maybeSingle();
    if (error || !order || order.address?.delivery !== 'shipping' || !isQuoteStatus(order.status)) {
      currentOrder = null;
      document.querySelector('#shippingQuoteAdmin')?.setAttribute('hidden', '');
      const fulfillment = document.querySelector('#modalFulfillmentSelect');
      const saveManagement = document.querySelector('#saveOrderManagement');
      const archive = document.querySelector('#toggleOrderArchive');
      if (fulfillment) fulfillment.disabled = false;
      if (saveManagement) saveManagement.hidden = false;
      if (archive) archive.hidden = false;
      return;
    }

    currentOrder = order;
    const panel = document.querySelector('#shippingQuoteAdmin');
    const input = document.querySelector('#shippingQuoteAmount');
    const link = document.querySelector('#shippingQuoteLink');
    const copy = document.querySelector('#copyShippingQuoteLink');
    const status = document.querySelector('#shippingQuoteAdminStatus');
    if (panel) panel.hidden = false;
    if (input) input.value = order.shipping_quoted_at ? Number(order.shipping || 0).toFixed(2).replace('.', ',') : '';
    const secureLink = `${location.origin}/frete.html?pedido=${encodeURIComponent(order.id)}&token=${encodeURIComponent(order.public_status_token)}`;
    if (link) link.value = secureLink;
    if (copy) copy.hidden = order.status !== 'Frete cotado';
    if (status) status.textContent = order.status === 'Frete cotado'
      ? `Frete salvo. Produtos ${money.format(Number(order.subtotal || 0))} + frete ${money.format(Number(order.shipping || 0))} = ${money.format(Number(order.total || 0))}. Envie o link seguro ao cliente.`
      : 'Este pedido ainda não reservou estoque nem gerou cobrança. Informe o frete para liberar o link de pagamento.';

    const fulfillment = document.querySelector('#modalFulfillmentSelect');
    const saveManagement = document.querySelector('#saveOrderManagement');
    const archive = document.querySelector('#toggleOrderArchive');
    if (fulfillment) {
      fulfillment.replaceChildren(new Option(order.fulfillment_status, order.fulfillment_status, true, true));
      fulfillment.disabled = true;
    }
    if (saveManagement) saveManagement.hidden = true;
    if (archive) archive.hidden = true;
    if (order.admin_notes && document.querySelector('#modalAdminNotes')) document.querySelector('#modalAdminNotes').value = order.admin_notes;
    showToast(order.status === 'Frete cotado' ? 'Cotação carregada.' : 'Pedido aguardando valor do frete.');
  }

  document.addEventListener('click', event => {
    const details = event.target.closest?.('[data-order-detail]');
    if (details?.dataset?.orderDetail) setTimeout(() => loadQuote(details.dataset.orderDetail), 0);
  });

  document.addEventListener('click', async event => {
    if (event.target.closest?.('#saveShippingQuote')) {
      if (!currentOrder) return;
      const button = document.querySelector('#saveShippingQuote');
      const raw = String(document.querySelector('#shippingQuoteAmount')?.value || '').trim().replace(',', '.');
      const shipping = Number(raw);
      const { showToast } = await import('../assets/js/store.js');
      if (!Number.isFinite(shipping) || shipping < 0 || shipping > 5000) {
        showToast('Informe um valor de frete válido.');
        return;
      }
      button.disabled = true;
      try {
        const { supabase } = await import('../assets/js/supabase.js');
        const { data, error } = await supabase.rpc('admin_set_shipping_quote', {
          p_order_id: currentOrder.id,
          p_shipping: shipping,
          p_admin_notes: document.querySelector('#modalAdminNotes')?.value || null,
        });
        if (error) throw error;
        currentOrder = { ...currentOrder, status: 'Frete cotado', shipping: data.shipping, subtotal: data.subtotal, total: data.total };
        const copy = document.querySelector('#copyShippingQuoteLink');
        if (copy) copy.hidden = false;
        document.querySelector('#shippingQuoteAdminStatus').textContent = `Cotação salva. Total com frete: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(data.total || 0))}.`;
        showToast('Cotação salva. Agora copie o link seguro para o cliente.');
        document.querySelector('#refreshAdmin')?.click();
      } catch (error) {
        console.error(error);
        showToast(error?.message || 'Não foi possível salvar a cotação.');
      } finally {
        button.disabled = false;
      }
      return;
    }

    if (event.target.closest?.('#copyShippingQuoteLink')) {
      const { showToast } = await import('../assets/js/store.js');
      const value = document.querySelector('#shippingQuoteLink')?.value || '';
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        showToast('Link de pagamento copiado.');
      } catch {
        document.querySelector('#shippingQuoteLink')?.select();
        showToast('Selecione e copie o link exibido.');
      }
    }
  });
}
