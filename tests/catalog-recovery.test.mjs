import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(new URL('../assets/js/catalog.js', import.meta.url), 'utf8');
const cart = await readFile(new URL('../assets/js/cart.js', import.meta.url), 'utf8');

assert.match(catalog, /zoryvena:data-error/);
assert.match(catalog, /data-retry-catalog/);
assert.match(catalog, /syncStoreData\(\)/);
assert.match(catalog, /não exibirá produtos antigos/i);
assert.match(cart, /window\.addEventListener\('zoryvena:data', render\)/);

console.log('catalog-recovery: ok');
