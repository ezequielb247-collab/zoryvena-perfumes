export function normalizeDelivery(value) {
  if (value === 'pickup') return 'pickup';
  if (value === 'shipping') return 'shipping';
  return null;
}

export function normalizePayment(value) {
  if (value === 'pix') return 'pix';
  if (value === 'card') return 'card';
  return null;
}

export function shouldRequestShippingQuote(delivery) {
  return normalizeDelivery(delivery) === 'shipping';
}

export function checkoutDestination(delivery) {
  const normalized = normalizeDelivery(delivery);
  if (normalized === 'pickup') return 'payment';
  if (normalized === 'shipping') return 'whatsapp_quote';
  return 'invalid';
}
