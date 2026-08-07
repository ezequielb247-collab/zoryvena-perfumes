function finiteTimestamp(value) {
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

export function effectivePaymentExpiry({ createdAt, pixExpiresInSeconds, reservationExpiresAt } = {}) {
  const created = Number(createdAt);
  const boundedSeconds = Math.min(3600, Math.max(60, Number(pixExpiresInSeconds || 1800)));
  const pixExpiry = Number.isFinite(created) && created > 0
    ? created + boundedSeconds * 1000
    : null;
  const reservationExpiry = finiteTimestamp(reservationExpiresAt);
  const candidates = [pixExpiry, reservationExpiry].filter(Number.isFinite);
  return candidates.length ? Math.min(...candidates) : Date.now();
}

export function paymentTimeRemaining(expiry, now = Date.now()) {
  const target = Number(expiry);
  const current = Number(now);
  if (!Number.isFinite(target) || !Number.isFinite(current)) return 0;
  return Math.max(0, Math.floor((target - current) / 1000));
}
