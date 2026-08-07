import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/js/supabase.js', import.meta.url), 'utf8');
const url = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const publishableKey = source.match(/const SUPABASE_PUBLISHABLE_KEY = '([^']+)'/)?.[1];

assert.match(String(url || ''), /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
assert.match(String(publishableKey || ''), /^sb_publishable_[A-Za-z0-9_-]+$/);

async function rpc(name) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: '{}',
        signal: AbortSignal.timeout(15_000),
      });
      const body = await response.text();
      assert.equal(response.ok, true, `${name} retornou HTTP ${response.status}: ${body.slice(0, 300)}`);
      return JSON.parse(body);
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  throw lastError;
}

const products = await rpc('get_storefront_products');
assert.equal(Array.isArray(products), true, 'O RPC público de produtos deve retornar uma lista.');
assert.ok(products.length > 0, 'O catálogo público não pode ficar vazio durante o soft launch atual.');

for (const product of products) {
  assert.equal(product.active, true, `Produto público inativo encontrado: ${product.id}`);
  assert.ok(Number(product.price) > 0, `Produto sem preço válido: ${product.id}`);
  const sellable = Number(product.stock) > 0
    || (product.preorder_enabled === true && Number(product.preorder_limit) > 0);
  assert.equal(sellable, true, `Produto público sem disponibilidade: ${product.id}`);
  for (const forbidden of ['cost', 'minimum_stock', 'admin_notes', 'supplier_docs_verified']) {
    assert.equal(Object.hasOwn(product, forbidden), false, `Campo privado exposto em produto: ${forbidden}`);
  }
}

const settingsRows = await rpc('get_storefront_settings');
assert.equal(Array.isArray(settingsRows), true, 'O RPC público de configurações deve retornar uma lista.');
assert.equal(settingsRows.length, 1, 'A configuração pública deve retornar exatamente uma loja.');
const settings = settingsRows[0];

assert.match(String(settings.site_url || ''), /^https:\/\//, 'A URL pública da loja precisa usar HTTPS.');
assert.ok(['test', 'production'].includes(settings.payment_environment), 'Ambiente de pagamento público inválido.');
assert.ok(['preparation', 'soft_launch', 'live'].includes(settings.launch_status), 'Status público da loja inválido.');
for (const forbidden of ['supplier_docs_verified', 'email_notifications_enabled']) {
  assert.equal(Object.hasOwn(settings, forbidden), false, `Campo operacional privado exposto nas configurações: ${forbidden}`);
}

console.log(`live-storefront-smoke: ok (${products.length} produtos públicos)`);
