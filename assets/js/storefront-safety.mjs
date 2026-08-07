function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.trunc(number));
}

export function parseCollectionCache(rawValue) {
  if (rawValue == null) return { present: false, values: [] };
  try {
    const parsed = JSON.parse(rawValue);
    return { present: true, values: Array.isArray(parsed) ? parsed : [] };
  } catch {
    return { present: true, values: [] };
  }
}

export function maximumPurchasable(product) {
  const ready = positiveInteger(product?.stock);
  const preorder = product?.preorderEnabled ? positiveInteger(product?.preorderLimit) : 0;
  return ready + preorder;
}

export function isSellableProduct(product) {
  const price = Number(product?.price);
  return Boolean(product?.id)
    && Number.isFinite(price)
    && price > 0
    && maximumPurchasable(product) > 0;
}

export function reconcileCartItems(cart, products) {
  const productMap = new Map(
    (Array.isArray(products) ? products : [])
      .filter(isSellableProduct)
      .map(product => [String(product.id), product])
  );
  const totals = new Map();

  for (const entry of Array.isArray(cart) ? cart : []) {
    const id = String(entry?.id || '');
    if (!productMap.has(id)) continue;
    const quantity = Math.max(1, positiveInteger(entry?.quantity, 1));
    totals.set(id, (totals.get(id) || 0) + quantity);
  }

  return [...totals.entries()].map(([id, requested]) => ({
    id,
    quantity: Math.min(requested, maximumPurchasable(productMap.get(id))),
  }));
}

export function reconcileProductIds(ids, products, limit = Number.POSITIVE_INFINITY) {
  const allowed = new Set(
    (Array.isArray(products) ? products : [])
      .filter(isSellableProduct)
      .map(product => String(product.id))
  );
  const unique = [];

  for (const value of Array.isArray(ids) ? ids : []) {
    const id = String(value || '');
    if (!allowed.has(id) || unique.includes(id)) continue;
    unique.push(id);
    if (unique.length >= limit) break;
  }

  return unique;
}
