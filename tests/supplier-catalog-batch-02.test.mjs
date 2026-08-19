import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, store, render] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260817153000_supplier_catalog_batch_02.sql', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
]);

const expectedIds = [
  'al-haramain-laventure',
  'lattafa-fakhar-rose',
  'armaf-club-de-nuit-intense-woman',
];

for (const id of expectedIds) assert.match(migration, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

// Preços já existentes continuam sendo a fonte de verdade.
assert.match(migration, /when coalesce\(p\.price, 0\) > 0 then p\.price/);
assert.match(migration, /when coalesce\(p\.pix_price, 0\) > 0 then p\.pix_price/);

// Disponibilidade no fornecedor gera somente encomenda, nunca estoque físico fictício.
assert.doesNotMatch(migration, /stock\s*=\s*[1-9]/i);
assert.match(migration, /preorder_enabled = true/);
assert.match(migration, /supplier_availability = 'Disponível no fornecedor'/);

// Toda imagem externa usada pelo lote precisa estar aprovada no storefront e na CSP.
const urls = [...migration.matchAll(/'https:\/\/([^/'?]+)[^']*'/g)].map(match => match[1]);
for (const host of new Set(urls)) {
  assert.ok(store.includes(`'${host}'`), `Host ausente do allowlist do storefront: ${host}`);
  assert.ok(render.includes(`https://${host}`), `Host ausente da CSP: ${host}`);
}

console.log(`supplier catalog batch 02: ${expectedIds.length} produtos verificados`);
