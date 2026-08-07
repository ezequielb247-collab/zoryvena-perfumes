import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeDelivery,
  normalizePayment,
  shouldRequestShippingQuote,
  checkoutDestination,
} from '../assets/js/checkout-routing.mjs';

assert.equal(normalizeDelivery('pickup'), 'pickup');
assert.equal(normalizeDelivery('shipping'), 'shipping');
assert.equal(normalizeDelivery('other'), null);
assert.equal(normalizeDelivery(null), null);

assert.equal(normalizePayment('pix'), 'pix');
assert.equal(normalizePayment('card'), 'card');
assert.equal(normalizePayment('other'), null);

assert.equal(shouldRequestShippingQuote('shipping'), true);
assert.equal(shouldRequestShippingQuote('pickup'), false);
assert.equal(checkoutDestination('pickup'), 'payment');
assert.equal(checkoutDestination('shipping'), 'whatsapp_quote');
assert.equal(checkoutDestination('invalid'), 'invalid');

const checkout = await readFile(new URL('../assets/js/checkout.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../checkout.html', import.meta.url), 'utf8');

assert.match(checkout, /const submittedForm = new FormData\(form\)/);
assert.match(checkout, /normalizeDelivery\(submittedForm\.get\('delivery'\)\)/);
assert.match(checkout, /normalizePayment\(submittedForm\.get\('payment'\)\)/);
assert.match(checkout, /if \(shouldRequestShippingQuote\(data\.delivery\)\)/);
assert.doesNotMatch(checkout, /data\.delivery = deliveryMethod\(\)/);
assert.match(html, /checkout\.js\?v=20260807-2/);

console.log('checkout routing regression tests: ok');
