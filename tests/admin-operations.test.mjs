import assert from 'node:assert/strict';
import { grossMarginPercent, productOperationalRisks, operationalSummary, auditEntryLabel, launchGuardState } from '../admin/operations-core.mjs';

assert.equal(Math.round(grossMarginPercent(200, 100)), 50);
assert.equal(grossMarginPercent(0, 100), null);

assert.deepEqual(
  productOperationalRisks({ active: true, stock: 0, minimum_stock: 1, cost: 100, price: 100, pix_price: 90, image: '' }).sort(),
  ['card_no_margin', 'low_stock', 'missing_image', 'pix_no_margin', 'sold_out'].sort()
);
assert.deepEqual(productOperationalRisks({ active: false, stock: 0 }), []);

const products = [
  { id: 'ready', active: true, stock: 2, minimum_stock: 1, cost: 100, price: 200, pix_price: 180, image: '/assets/ready.webp' },
  { id: 'low', active: true, stock: 1, minimum_stock: 1, cost: 100, price: 190, pix_price: 170, image: '/assets/low.webp' },
  { id: 'risk', active: true, stock: 0, minimum_stock: 1, cost: 150, price: 150, pix_price: 140, image: '' },
  { id: 'inactive', active: false, stock: 99, minimum_stock: 1, cost: 1, price: 2, pix_price: 2, image: '' },
];
const orders = [
  { id: 'new', status: 'Pagamento aprovado', fulfillment_status: 'Novo pedido', archived_at: null },
  { id: 'separating', status: 'Pagamento aprovado', fulfillment_status: 'Em separação', archived_at: null },
  { id: 'pickup', status: 'Pagamento aprovado', fulfillment_status: 'Pronto para retirada', archived_at: null },
  { id: 'pending', status: 'Aguardando pagamento', fulfillment_status: 'Aguardando pagamento', archived_at: null },
  { id: 'quote-pending', status: 'Aguardando cotação de frete', fulfillment_status: 'Aguardando cotação de frete', archived_at: null },
  { id: 'quote-ready', status: 'Frete cotado', fulfillment_status: 'Frete cotado', archived_at: null },
  { id: 'archived', status: 'Aguardando pagamento', fulfillment_status: 'Aguardando pagamento', archived_at: '2026-08-07T00:00:00Z' },
];
const summary = operationalSummary(products, orders, {
  payment_environment: 'test',
  payment_production_credentials_verified_at: null,
  payment_webhook_verified_at: null,
  supplier_docs_verified: false,
  supplier_docs_unavailable_acknowledged_at: '2026-08-07T14:15:07Z',
  launch_status: 'preparation',
  email_notifications_enabled: false,
  shipping_mode: 'manual_quote',
});

assert.equal(summary.activeProducts, 3);
assert.equal(summary.readyUnits, 3);
assert.equal(summary.lowStockProducts.length, 2);
assert.equal(summary.soldOutProducts.length, 1);
assert.equal(summary.pricingRiskProducts.length, 1);
assert.equal(summary.imageRiskProducts.length, 1);
assert.equal(summary.pendingPaymentOrders.length, 1);
assert.equal(summary.shippingQuoteOrders.length, 2);
assert.equal(summary.newOrders.length, 1);
assert.equal(summary.separatingOrders.length, 1);
assert.equal(summary.pickupReadyOrders.length, 1);
assert.equal(summary.paymentEnvironment, 'test');
assert.equal(summary.paymentProductionCredentialsVerified, false);
assert.equal(summary.paymentWebhookVerified, false);
assert.equal(summary.supplierDocsVerified, false);
assert.equal(summary.supplierDocsExceptionAcknowledged, true);

const missingEverything = launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: false,
  productionCredentialsVerified: false,
  productionWebhookVerified: false,
  selectedSupplierDocsVerified: true,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
});
assert.equal(missingEverything.supplierRequirementMet, false);
assert.equal(missingEverything.paymentReadinessMet, false);
assert.equal(missingEverything.canSelectProduction, false);

const supplierExceptionOnly = launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  productionCredentialsVerified: false,
  productionWebhookVerified: false,
  selectedSupplierDocsVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
});
assert.equal(supplierExceptionOnly.supplierRequirementMet, true);
assert.equal(supplierExceptionOnly.paymentReadinessMet, false);
assert.equal(supplierExceptionOnly.canSelectProduction, false);

const credentialsOnly = launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  productionCredentialsVerified: true,
  productionWebhookVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
});
assert.equal(credentialsOnly.canSelectProduction, false);

const productionReady = launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  productionCredentialsVerified: true,
  productionWebhookVerified: true,
  selectedSupplierDocsVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
});
assert.equal(productionReady.paymentReadinessMet, true);
assert.equal(productionReady.canSelectProduction, true);
assert.equal(productionReady.canSelectSoftLaunch, true);
assert.equal(productionReady.canSelectLive, false);

assert.equal(launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  productionCredentialsVerified: true,
  productionWebhookVerified: true,
  selectedSupplierDocsVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'soft_launch',
}).canSelectLive, true);

assert.equal(auditEntryLabel({ entity_type: 'products', action: 'UPDATE' }), 'Produto atualizado');
assert.equal(auditEntryLabel({ entity_type: 'orders', action: 'INSERT' }), 'Pedido criado');

console.log('admin operations regression tests: ok');
