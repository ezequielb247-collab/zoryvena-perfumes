import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, createOrder, quoteStatus, quotePage, quoteClient, quoteAdmin, build, robots, cardFunction, checkoutPage, shippingBootstrap] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260817002000_complete_manual_shipping_checkout.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/create-order/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/shipping-quote-status/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../frete.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/shipping-quote.js', import.meta.url), 'utf8'),
  readFile(new URL('../admin/shipping-quotes-bootstrap.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../render-build.sh', import.meta.url), 'utf8'),
  readFile(new URL('../robots.txt', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/functions/process-card-payment/index.ts', import.meta.url), 'utf8'),
  readFile(new URL('../checkout.html', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/shipping-checkout-bootstrap.mjs', import.meta.url), 'utf8'),
]);

assert.match(migration, /create or replace function public\.create_shipping_quote_request/);
assert.match(migration, /'Aguardando cotação de frete'/);
assert.match(migration, /'Frete cotado'/);
assert.match(migration, /shipping_quote_expires_at/);
assert.match(migration, /perform private\.assert_admin_mfa\(\)/);
assert.match(migration, /create or replace function public\.prepare_shipping_order_payment/);
assert.match(migration, /for update/);
assert.match(migration, /stock = stock - v_ready_quantity/);
assert.match(migration, /inventory_reserved_at = now\(\)/);
assert.match(migration, /inventory_reservation_expires_at = now\(\) \+ interval '35 minutes'/);
assert.match(migration, /grant execute on function public\.create_shipping_quote_request\(jsonb,jsonb,text,text\) to service_role/);
assert.match(migration, /grant execute on function public\.admin_set_shipping_quote\(uuid,numeric,text\) to authenticated/);

assert.match(createOrder, /payload\?\.action === "start_shipping_payment"/);
assert.match(createOrder, /create_shipping_quote_request/);
assert.match(createOrder, /prepare_shipping_order_payment/);
assert.match(createOrder, /X-Idempotency-Key/);
assert.match(createOrder, /external_reference: orderId/);
assert.match(createOrder, /Math\.abs\(returnedAmount - expectedAmount\)/);
assert.match(createOrder, /onExternalCharge\(\)/);
assert.match(createOrder, /releaseOnFailure = false/);
assert.match(createOrder, /customerEmail/);
assert.match(cardFunction, /sync_order_payment_status/);
assert.match(cardFunction, /returnedExternal !== order\.id/);
assert.match(cardFunction, /Math\.abs\(returnedAmount - Number\(order\.total\)\)/);

assert.match(quoteStatus, /public_status_token/);
assert.match(quoteStatus, /quoteReady/);
assert.doesNotMatch(quoteStatus, /customer_whatsapp/);
assert.doesNotMatch(quoteStatus, /customer_email/);
assert.doesNotMatch(quoteStatus, /customer_name/);

assert.match(quotePage, /meta name="robots" content="noindex,nofollow"/);
assert.match(quoteClient, /shipping-quote-status/);
assert.match(quoteClient, /start_shipping_payment/);
assert.match(quoteClient, /result\.customerEmail/);
assert.match(quoteClient, /sessionStorage\.setItem\('zoryvena\.last-order'/);
assert.match(quoteAdmin, /admin_set_shipping_quote/);
assert.match(quoteAdmin, /navigator\.clipboard\.writeText/);
assert.match(build, /frete\.html/);
assert.match(robots, /Disallow: \/frete\.html/);

assert.match(shippingBootstrap, /submitted\.get\('delivery'\) !== 'shipping'/);
assert.match(shippingBootstrap, /supabase\.functions\.invoke\('create-order'/);
assert.match(shippingBootstrap, /quoteMode !== 'manual_shipping'/);
assert.match(shippingBootstrap, /sessionStorage\.setItem\('zoryvena\.shipping-quote'/);
assert.match(shippingBootstrap, /location\.href = `\/frete\.html\?pedido=/);
assert.doesNotMatch(shippingBootstrap, /whatsappUrl/);

const bootstrapScript = '/assets/js/shipping-checkout-bootstrap.mjs';
const checkoutScript = '/assets/js/checkout.js';
assert.match(checkoutPage, /shipping-checkout-bootstrap\.mjs/);
assert.ok(
  checkoutPage.indexOf(bootstrapScript) < checkoutPage.indexOf(checkoutScript),
  'shipping checkout bootstrap must load before checkout.js',
);

console.log('shipping checkout regression tests: ok');
