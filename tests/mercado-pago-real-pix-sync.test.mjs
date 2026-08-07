import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const webhook = await readFile(new URL('../supabase/functions/mercado-pago-webhook/index.ts', import.meta.url), 'utf8');
const orderStatus = await readFile(new URL('../supabase/functions/order-status/index.ts', import.meta.url), 'utf8');

assert.match(webhook, /const isOrderNotification=/);
assert.match(webhook, /if\(!isOrderNotification\)/);
assert.match(webhook, /fetchMP\(`\/v1\/orders\/\$\{encodeURIComponent\(resourceId\)\}`/);
assert.match(webhook, /verifiedBy:"mercado_pago_api"/);
assert.match(webhook, /amountMatches/);
assert.match(webhook, /methodMatches/);
assert.match(webhook, /Identificador de cobrança divergente/);
assert.match(webhook, /if\(!signatureValid\)return json\(\{error:"Assinatura inválida ou expirada\."\},401\)/);

assert.match(orderStatus, /mercado_pago_order_id/);
assert.match(orderStatus, /fetchMPOrder/);
assert.match(orderStatus, /external===order\.id/);
assert.match(orderStatus, /sync_order_payment_status/);
assert.match(orderStatus, /Pagamento aprovado/);

console.log('mercado pago real pix sync regression tests: ok');
