import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { paymentProductionState, missingProductionChecks } from '../admin/mp-production-readiness-core.mjs';

const missing = paymentProductionState({
  credentialsVerifiedAt: null,
  webhookVerifiedAt: null,
  supplierDocsExceptionAcknowledged: true,
  selectedPaymentEnvironment: 'production',
});
assert.equal(missing.paymentReady, false);
assert.equal(missing.canUseProduction, false);
assert.deepEqual(missingProductionChecks(missing), ['Credenciais produtivas', 'Webhook produtivo']);

const credentialsOnly = paymentProductionState({
  credentialsVerifiedAt: '2026-08-07T15:00:00Z',
  webhookVerifiedAt: null,
  supplierDocsExceptionAcknowledged: true,
  selectedPaymentEnvironment: 'production',
});
assert.equal(credentialsOnly.canUseProduction, false);
assert.deepEqual(missingProductionChecks(credentialsOnly), ['Webhook produtivo']);

const ready = paymentProductionState({
  credentialsVerifiedAt: '2026-08-07T15:00:00Z',
  webhookVerifiedAt: '2026-08-07T15:05:00Z',
  supplierDocsExceptionAcknowledged: true,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'preparation',
});
assert.equal(ready.paymentReady, true);
assert.equal(ready.canUseProduction, true);
assert.equal(ready.canUseSoftLaunch, true);
assert.equal(ready.canUseLive, false);

const liveReady = paymentProductionState({
  credentialsVerifiedAt: '2026-08-07T15:00:00Z',
  webhookVerifiedAt: '2026-08-07T15:05:00Z',
  supplierDocsExceptionAcknowledged: true,
  selectedPaymentEnvironment: 'production',
  storedLaunchStatus: 'soft_launch',
});
assert.equal(liveReady.canUseLive, true);

const [migration, diagnostic, webhook, operations] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260807154416_require_verified_mercado_pago_production.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/mp-production-readiness/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/mercado-pago-webhook/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../admin/operations.js', import.meta.url), 'utf8'),
]);

assert.match(migration, /payment_production_credentials_verified_at/);
assert.match(migration, /payment_webhook_verified_at/);
assert.match(migration, /Verifique as credenciais produtivas do Mercado Pago/);
assert.match(migration, /Verifique o webhook produtivo do Mercado Pago/);

assert.match(diagnostic, /claims\?\.aal !== "aal2"/);
assert.match(diagnostic, /api\.mercadopago\.com\/v1\/payment_methods/);
assert.match(diagnostic, /payment_production_credentials_verified_at/);
assert.doesNotMatch(diagnostic, /console\.log\([^\n]*(MERCADO_PAGO_ACCESS_TOKEN|publicKey|pixToken|cardToken)/);

assert.match(webhook, /searchParams\.get\("mode"\)===\"production\"/);
assert.match(webhook, /payment_webhook_verified_at/);
assert.match(webhook, /validSignature/);
assert.match(webhook, /x-signature/);
assert.match(webhook, /x-request-id/);

assert.match(operations, /import '\.\/mp-production-readiness\.js';/);

console.log('mercado pago production readiness regression tests: ok');
