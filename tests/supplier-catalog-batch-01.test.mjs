import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, store, render] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260819021934_supplier_catalog_batch_01.sql', import.meta.url), 'utf8'),
  readFile(new URL('../assets/js/store.js', import.meta.url), 'utf8'),
  readFile(new URL('../render.yaml', import.meta.url), 'utf8'),
]);

const expectedIds = [
  'lattafa-asad',
  'armaf-club-de-nuit-intense-man',
  'rasasi-hawas-for-him',
  'lattafa-fakhar-black',
  'lattafa-qaed-al-fursan',
  'fragrance-world-liquid-brun',
  'lattafa-yara',
  'lattafa-yara-moi',
  'lattafa-yara-tous',
  'lattafa-yara-candy',
  'lattafa-eclaire',
  'lattafa-her-confession',
  'maison-alhambra-delilah',
  'lattafa-khamrah',
  'lattafa-khamrah-qahwa',
  'lattafa-nebras',
  'al-wataniah-durrat-al-aroos',
  'al-wataniah-sabah-al-ward',
  'al-wataniah-watani',
  'asdaaf-ameerat-al-arab',
  'maison-alhambra-rose-seduction-vip-pour-femme',
];

for (const id of expectedIds) assert.match(migration, new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

// Preços existentes devem ser preservados; a margem só completa cadastro sem preço.
assert.match(migration, /when coalesce\(p\.price, 0\) > 0 then p\.price/);
assert.match(migration, /when coalesce\(p\.pix_price, 0\) > 0 then p\.pix_price/);

// A lista do fornecedor nunca pode ser convertida em estoque físico fictício.
assert.doesNotMatch(migration, /stock\s*=\s*[1-9]/i);
assert.match(migration, /preorder_enabled = true/);
assert.match(migration, /supplier_availability = 'Disponível no fornecedor'/);

// Itens explicitamente em falta perdem apenas a encomenda; estoque físico existente é preservado.
assert.match(migration, /supplier_availability = 'Em falta no fornecedor'/);
assert.match(migration, /preorder_enabled = false/);
assert.match(migration, /active = \(p\.stock > 0\)/);

// Toda origem externa cadastrada no lote precisa estar tanto no allowlist JS quanto na CSP.
const urls = [...migration.matchAll(/'https:\/\/([^/'?]+)[^']*'/g)].map(match => match[1]);
for (const host of new Set(urls)) {
  assert.ok(store.includes(`'${host}'`), `Host ausente do allowlist do storefront: ${host}`);
  assert.ok(render.includes(`https://${host}`), `Host ausente da CSP: ${host}`);
}

console.log(`supplier catalog batch 01: ${expectedIds.length} produtos verificados`);
