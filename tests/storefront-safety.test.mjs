import assert from 'node:assert/strict';
import {
  parseCollectionCache,
  maximumPurchasable,
  isSellableProduct,
  reconcileCartItems,
  reconcileProductIds,
} from '../assets/js/storefront-safety.mjs';

const readyProduct = {
  id: 'yara',
  price: 249.9,
  stock: 1,
  preorderEnabled: false,
  preorderLimit: 0,
};
const twoUnitProduct = {
  id: 'watani',
  price: 299.9,
  stock: 2,
  preorderEnabled: false,
  preorderLimit: 0,
};
const unavailableProduct = {
  id: 'old-product',
  price: 199.9,
  stock: 0,
  preorderEnabled: false,
  preorderLimit: 0,
};

assert.deepEqual(parseCollectionCache(null), { present: false, values: [] });
assert.deepEqual(parseCollectionCache('[]'), { present: true, values: [] });
assert.deepEqual(parseCollectionCache('{broken'), { present: true, values: [] });
assert.deepEqual(parseCollectionCache(JSON.stringify([readyProduct])).values, [readyProduct]);

assert.equal(maximumPurchasable(readyProduct), 1);
assert.equal(maximumPurchasable(twoUnitProduct), 2);
assert.equal(maximumPurchasable({ ...readyProduct, stock: 0 }), 0);
assert.equal(isSellableProduct(readyProduct), true);
assert.equal(isSellableProduct(unavailableProduct), false);

assert.deepEqual(
  reconcileCartItems([
    { id: 'yara', quantity: 5 },
    { id: 'watani', quantity: 1 },
    { id: 'watani', quantity: 3 },
    { id: 'old-product', quantity: 1 },
    { id: 'removed-product', quantity: 1 },
  ], [readyProduct, twoUnitProduct, unavailableProduct]),
  [
    { id: 'yara', quantity: 1 },
    { id: 'watani', quantity: 2 },
  ]
);

assert.deepEqual(
  reconcileProductIds(
    ['old-product', 'yara', 'yara', 'watani', 'removed-product'],
    [readyProduct, twoUnitProduct, unavailableProduct]
  ),
  ['yara', 'watani']
);

assert.deepEqual(
  reconcileProductIds(['watani', 'yara'], [readyProduct, twoUnitProduct], 1),
  ['watani']
);

console.log('storefront-safety: ok');
