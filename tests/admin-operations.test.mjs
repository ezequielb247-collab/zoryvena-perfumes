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
  { id: 'archived', status: 'Aguardando pagamento', fulfillment_status: 'Aguardando pagamento', archived_at: '2026-08-07T00:00:00Z' },
];
const summary = operationalSummary(products, orders, {
  payment_environment: 'test',
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
assert.equal(summary.newOrders.length, 1);
assert.equal(summary.separatingOrders.length, 1);
assert.equal(summary.pickupReadyOrders.length, 1);
assert.equal(summary.paymentEnvironment, 'test');
assert.equal(summary.supplierDocsVerified, false);
assert.equal(summary.supplierDocsExceptionAcknowledged, true);

assert.deepEqual(launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: false,
  selectedSupplierDocsVerified: true,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
}), {
  canSelectSupplierVerified: false,
  supplierVerified: false,
  supplierDocsExceptionAcknowledged: false,
  supplierRequirementMet: false,
  canSelectProduction: false,
  canSelectSoftLaunch: false,
  canSelectLive: false,
});

assert.deepEqual(launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  selectedSupplierDocsVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
}), {
  canSelectSupplierVerified: false,
  supplierVerified: false,
  supplierDocsExceptionAcknowledged: true,
  supplierRequirementMet: true,
  canSelectProduction: true,
  canSelectSoftLaunch: true,
  canSelectLive: false,
});

assert.deepEqual(launchGuardState({
  storedSupplierDocsVerified: true,
  supplierDocsExceptionAcknowledged: false,
  selectedSupplierDocsVerified: true,
  selectedPaymentEnvironment: 'test',
  storedLaunchStatus: 'preparation',
}), {
  canSelectSupplierVerified: true,
  supplierVerified: true,
  supplierDocsExceptionAcknowledged: false,
  supplierRequirementMet: true,
  canSelectProduction: true,
  canSelectSoftLaunch: false,
  canSelectLive: false,
});

assert.equal(launchGuardState({
  storedSupplierDocsVerified: false,
  supplierDocsExceptionAcknowledged: true,
  selectedSupplierDocsVerified: false,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'soft_launch',
}).canSelectLive, true);

assert.equal(auditEntryLabel({ entity_type: 'products', action: 'UPDATE' }), 'Produto atualizado');
assert.equal(auditEntryLabel({ entity_type: 'orders', action: 'INSERT' }), 'Pedido criado');

console.log('admin operations regression tests: ok');
