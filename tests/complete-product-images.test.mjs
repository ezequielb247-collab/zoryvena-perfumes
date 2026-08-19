import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, store, render] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260819033000_complete_product_images.sql', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
]);

const expectedIds = [
  'afnan-9pm',
  'lattafa-asad-bourbon',
  'afnan-supremacy-not-only-intense',
  'lattafa-hayaati',
  'maison-alhambra-jean-lowe-immortel',
  'lattafa-mayar',
  'afnan-9pm-pour-femme',
  'lattafa-honor-and-glory',
  'lattafa-oud-for-glory',
  'paris-corner-khair-pistachio',
];

for (const id of expectedIds) {
  assert.match(migration, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

// A migration completa apenas imagens vazias e preserva qualquer foto já cadastrada.
assert.match(migration, /when nullif\(trim\(coalesce\(p\.image, ''\)\), ''\) is not null then p\.image/);
assert.match(migration, /else s\.image/);

// Foto nunca pode mudar regras comerciais ou disponibilidade do produto.
for (const field of ['price', 'pix_price', 'cost', 'stock', 'active', 'preorder_enabled', 'preorder_limit', 'supplier_availability']) {
  assert.doesNotMatch(migration, new RegExp(`\\b${field}\\s*=`, 'i'), `Migration de imagens não pode alterar ${field}`);
}

// Toda origem externa precisa estar autorizada tanto no storefront quanto na CSP.
const urls = [...migration.matchAll(/'https:\/\/([^/'?]+)[^']*'/g)].map(match => match[1]);
for (const host of new Set(urls)) {
  assert.ok(store.includes(`'${host}'`), `Host ausente do allowlist do storefront: ${host}`);
  assert.ok(render.includes(`https://${host}`), `Host ausente da CSP: ${host}`);
}

assert.equal(new Set(urls).size, 2);
assert.deepEqual([...new Set(urls)].sort(), ['orientalaromas.com', 'zaoud.it']);

console.log(`product images completion: ${expectedIds.length} produtos verificados`);
