import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, store, render] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260819050339_refresh_visible_product_images.sql', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
]);

const expectedIds = [
  'lattafa-asad',
  'lattafa-fakhar-black',
  'lattafa-qaed-al-fursan',
  'lattafa-yara',
  'lattafa-yara-moi',
  'lattafa-eclaire',
  'lattafa-khamrah',
];

for (const id of expectedIds) {
  assert.match(migration, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

// Este lote deve trocar somente a URL da imagem. Regras comerciais são imutáveis aqui.
for (const field of [
  'price',
  'pix_price',
  'cost',
  'stock',
  'active',
  'preorder_enabled',
  'preorder_limit',
  'supplier_availability',
  'status',
]) {
  assert.doesNotMatch(migration, new RegExp(`\\b${field}\\s*=`, 'i'), `Migration de imagens não pode alterar ${field}`);
}

assert.match(migration, /set image = source\.image/);
assert.match(migration, /<> 7/);

const urls = [...migration.matchAll(/'https:\/\/([^/'?]+)[^']*'/g)].map(match => match[1]);
const hosts = [...new Set(urls)].sort();
assert.deepEqual(hosts, ['www.lattafa-usa.com', 'zaoud.it']);

for (const host of hosts) {
  assert.ok(store.includes(`'${host}'`), `Host ausente do allowlist do storefront: ${host}`);
  assert.ok(render.includes(`https://${host}`), `Host ausente da CSP: ${host}`);
}

assert.equal(urls.filter(host => host === 'www.lattafa-usa.com').length, 5);
assert.equal(urls.filter(host => host === 'zaoud.it').length, 2);

console.log(`visible product image refresh: ${expectedIds.length} produtos verificados`);
