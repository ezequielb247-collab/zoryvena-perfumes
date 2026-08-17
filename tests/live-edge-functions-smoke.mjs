import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../assets/js/supabase.js', import.meta.url), 'utf8');
const url = source.match(/const SUPABASE_URL = '([^']+)'/)?.[1];
const publishableKey = source.match(/const SUPABASE_PUBLISHABLE_KEY = '([^']+)'/)?.[1];
const storeUrl = 'https://zoryvena-perfumes.onrender.com';

assert.match(String(url || ''), /^https:\/\/[a-z0-9-]+\.supabase\.co$/);
assert.match(String(publishableKey || ''), /^sb_publishable_[A-Za-z0-9_-]+$/);

async function invoke(name, body) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(`${url}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${publishableKey}`,
          Origin: storeUrl,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const text = await response.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { /* resposta será validada abaixo */ }
      return { response, data, text };
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1200));
    }
  }
  throw lastError;
}

const cases = [
  { name: 'create-order', body: {}, expectedStatus: 400 },
  { name: 'shipping-quote-status', body: {}, expectedStatus: 400 },
  { name: 'order-status', body: {}, expectedStatus: 400 },
  { name: 'process-card-payment', body: {}, expectedStatus: 400 },
];

for (const entry of cases) {
  const { response, data, text } = await invoke(entry.name, entry.body);
  assert.equal(response.status, entry.expectedStatus, `${entry.name} deveria rejeitar entrada inválida com HTTP ${entry.expectedStatus}; recebeu ${response.status}: ${text.slice(0, 300)}`);
  assert.equal(typeof data?.error, 'string', `${entry.name} deve retornar erro JSON controlado.`);
  assert.ok(data.error.length > 0 && data.error.length <= 400, `${entry.name} retornou erro inválido.`);
}

console.log(`live-edge-functions-smoke: ok (${cases.length} funções disponíveis e rejeitando entrada inválida sem mutação)`);
