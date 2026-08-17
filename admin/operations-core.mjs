import './shipping-quotes-bootstrap.mjs';

const amount = value => Number.isFinite(Number(value)) ? Number(value) : 0;

export function grossMarginPercent(price, cost) {
  const sale = amount(price);
  const baseCost = amount(cost);
  if (sale <= 0 || baseCost < 0) return null;
  return ((sale - baseCost) / sale) * 100;
}

export function productOperationalRisks(product = {}) {
  if (!product.active) return [];
  const risks = [];
  const stock = amount(product.stock);
  const minimum = amount(product.minimum_stock);
  const cost = amount(product.cost);
  const price = amount(product.price);
  const pix = amount(product.pix_price);

  if (stock <= minimum) risks.push('low_stock');
  if (stock <= 0) risks.push('sold_out');
  if (cost <= 0) risks.push('missing_cost');
  if (price <= 0) risks.push('missing_price');
  if (pix <= 0) risks.push('missing_pix_price');
  if (cost > 0 && price > 0 && price <= cost) risks.push('card_no_margin');
  if (cost > 0 && pix > 0 && pix <= cost) risks.push('pix_no_margin');
  if (!String(product.image || '').trim()) risks.push('missing_image');
  return risks;
}

export function operationalSummary(products = [], orders = [], settings = {}) {
  const activeProducts = products.filter(product => product.active);
  const activeOrders = orders.filter(order => !order.archived_at);
  const riskMap = new Map(activeProducts.map(product => [product.id, productOperationalRisks(product)]));

  const lowStockProducts = activeProducts.filter(product => riskMap.get(product.id)?.includes('low_stock'));
  const soldOutProducts = activeProducts.filter(product => riskMap.get(product.id)?.includes('sold_out'));
  const pricingRiskProducts = activeProducts.filter(product => {
    const risks = riskMap.get(product.id) || [];
    return risks.some(risk => ['missing_cost', 'missing_price', 'missing_pix_price', 'card_no_margin', 'pix_no_margin'].includes(risk));
  });
  const imageRiskProducts = activeProducts.filter(product => riskMap.get(product.id)?.includes('missing_image'));

  const approvedOrders = activeOrders.filter(order => order.status === 'Pagamento aprovado');
  const pendingPaymentOrders = activeOrders.filter(order =>
    ['Aguardando pagamento', 'Aguardando confirmação', 'Pagamento em análise'].includes(order.status)
  );
  const shippingQuoteOrders = activeOrders.filter(order =>
    ['Aguardando cotação de frete', 'Frete cotado'].includes(order.status)
  );
  const newOrders = approvedOrders.filter(order => order.fulfillment_status === 'Novo pedido');
  const separatingOrders = approvedOrders.filter(order => order.fulfillment_status === 'Em separação');
  const pickupReadyOrders = approvedOrders.filter(order => order.fulfillment_status === 'Pronto para retirada');

  return {
    activeProducts: activeProducts.length,
    readyUnits: activeProducts.reduce((total, product) => total + Math.max(0, Math.trunc(amount(product.stock))), 0),
    lowStockProducts,
    soldOutProducts,
    pricingRiskProducts,
    imageRiskProducts,
    pendingPaymentOrders,
    shippingQuoteOrders,
    newOrders,
    separatingOrders,
    pickupReadyOrders,
    paymentEnvironment: settings?.payment_environment || 'test',
    paymentProductionCredentialsVerified: Boolean(settings?.payment_production_credentials_verified_at),
    paymentWebhookVerified: Boolean(settings?.payment_webhook_verified_at),
    supplierDocsVerified: Boolean(settings?.supplier_docs_verified),
    supplierDocsExceptionAcknowledged: Boolean(settings?.supplier_docs_unavailable_acknowledged_at),
    launchStatus: settings?.launch_status || 'preparation',
    emailNotificationsEnabled: Boolean(settings?.email_notifications_enabled),
    shippingMode: settings?.shipping_mode || 'manual_quote',
  };
}

export function launchGuardState({
  storedSupplierDocsVerified = false,
  supplierDocsExceptionAcknowledged = false,
  productionCredentialsVerified = true,
  productionWebhookVerified = true,
  selectedSupplierDocsVerified = false,
  selectedPaymentEnvironment = 'test',
  storedLaunchStatus = 'preparation',
} = {}) {
  const storedSupplierVerified = Boolean(storedSupplierDocsVerified);
  const supplierVerified = storedSupplierVerified && Boolean(selectedSupplierDocsVerified);
  const supplierRequirementMet = supplierVerified || Boolean(supplierDocsExceptionAcknowledged);
  const paymentReadinessMet = Boolean(productionCredentialsVerified) && Boolean(productionWebhookVerified);
  const paymentProduction = selectedPaymentEnvironment === 'production';
  const canSelectProduction = supplierRequirementMet && paymentReadinessMet;
  const canSelectSoftLaunch = canSelectProduction && paymentProduction;
  const canSelectLive = canSelectSoftLaunch && ['soft_launch', 'live'].includes(storedLaunchStatus);

  return {
    canSelectSupplierVerified: storedSupplierVerified,
    supplierVerified,
    supplierDocsExceptionAcknowledged: Boolean(supplierDocsExceptionAcknowledged),
    supplierRequirementMet,
    productionCredentialsVerified: Boolean(productionCredentialsVerified),
    productionWebhookVerified: Boolean(productionWebhookVerified),
    paymentReadinessMet,
    canSelectProduction,
    canSelectSoftLaunch,
    canSelectLive,
  };
}

export function auditEntryLabel(entry = {}) {
  const entity = {
    products: 'Produto',
    orders: 'Pedido',
    store_settings: 'Configurações',
    coupons: 'Cupom',
  }[entry.entity_type] || 'Registro';
  const action = {
    INSERT: 'criado',
    UPDATE: 'atualizado',
    DELETE: 'excluído',
  }[entry.action] || String(entry.action || '').toLowerCase();
  return `${entity} ${action}`.trim();
}
