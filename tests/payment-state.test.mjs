import assert from 'node:assert/strict';
import { effectivePaymentExpiry, paymentTimeRemaining } from '../assets/js/payment-state.mjs';

const createdAt = Date.parse('2026-08-07T12:00:00Z');
const reservationSooner = '2026-08-07T12:10:00Z';
const reservationLater = '2026-08-07T13:00:00Z';

assert.equal(
  effectivePaymentExpiry({ createdAt, pixExpiresInSeconds: 1800, reservationExpiresAt: reservationSooner }),
  Date.parse(reservationSooner)
);

assert.equal(
  effectivePaymentExpiry({ createdAt, pixExpiresInSeconds: 300, reservationExpiresAt: reservationLater }),
  createdAt + 300_000
);

assert.equal(paymentTimeRemaining(createdAt + 90_000, createdAt), 90);
assert.equal(paymentTimeRemaining(createdAt - 1, createdAt), 0);
assert.equal(paymentTimeRemaining(Number.NaN, createdAt), 0);

console.log('payment-state: ok');
