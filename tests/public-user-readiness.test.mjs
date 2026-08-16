import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

const publicPages = [
  'index.html',
  'catalogo.html',
  'carrinho.html',
  'checkout.html',
  'comparar.html',
  'contato.html',
  'quiz.html',
  'sobre.html',
];

const pageSources = await Promise.all(publicPages.map(text));
for (let index = 0; index < publicPages.length; index += 1) {
  const source = pageSources[index];
  const path = publicPages[index];
  assert.equal(source.includes('Frete grátis para todo o Brasil'), false, `${path} não pode prometer frete grátis enquanto o modo é cotação manual.`);
  assert.equal(source.includes('Informações comerciais e empresariais serão preenchidas antes do lançamento'), false, `${path} não pode manter texto de pré-lançamento.`);
}

const homeHtml = await text('index.html');
assert.equal(homeHtml.includes('<span>Originais</span>'), false, 'A home não pode declarar originalidade sem documentação suficiente.');
assert.equal(homeHtml.includes('Conferência de fornecedor, lote e procedência antes da venda.'), false, 'A home não pode declarar procedência documental conferida no estado atual.');
assert.match(homeHtml, /Como a Zoryvena trata a procedência\?/);
assert.match(homeHtml, /documentação de procedência do fornecedor ainda não está disponível para verificação/i);
assert.match(homeHtml, /Al Wataniah/);
assert.match(homeHtml, /Lattafa/);
assert.match(homeHtml, /Maison Alhambra/);
assert.equal(homeHtml.includes('<span>Armaf</span>'), false, 'A home não deve listar marca fora do catálogo ativo atual como marca disponível agora.');

const common = await text('assets/js/common.js');
assert.equal(common.includes('A Zoryvena seleciona produtos com procedência verificada'), false, 'A cópia dinâmica não pode contradizer supplier_docs_verified=false.');
assert.match(common, /não apresenta origem ou procedência documental como comprovada/i);

const home = await text('assets/js/home.js');
assert.match(home, /filter\(product => isAvailable\(product\)\)/, 'A home deve priorizar somente itens compráveis nos destaques.');

const quiz = await text('assets/js/quiz.js');
assert.match(quiz, /getProducts\(\)\.filter\(product => isAvailable\(product\)\)/, 'O quiz deve recomendar apenas produtos disponíveis.');

const paymentHtml = await text('pagamento.html');
assert.match(paymentHtml, /id="environmentNote" hidden/, 'O aviso de ambiente de teste deve começar oculto por segurança em produção.');
const paymentReturn = await text('assets/js/payment-return.js');
assert.match(paymentReturn, /environmentNote\.hidden = !isTestEnvironment/, 'A página de pagamento deve mostrar o aviso somente em sandbox.');

const components = await text('assets/js/components.js');
assert.match(components, /favoriteActive/);
assert.match(components, /aria-label="\$\{escapeHtml\(favoriteLabel\)\}"/, 'Cards devem expor ação correta de favorito para leitores de tela.');

console.log('public-user-readiness: ok');
