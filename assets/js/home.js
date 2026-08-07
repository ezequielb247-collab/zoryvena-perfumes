import { getProducts, getConfig } from './store.js';
import { productCard } from './components.js';

function renderHomeProducts() {
  const products = getProducts();
  const featured = document.querySelector('#featuredProducts');
  if (featured) featured.innerHTML = products.slice(0, 4).map(product => productCard(product)).join('');
  const feminine = document.querySelector('#feminineProducts');
  if (feminine) feminine.innerHTML = products.filter(product => product.gender === 'Feminino').slice(0, 4).map(product => productCard(product)).join('');
}

function applyOriginCopy() {
  const verified = Boolean(getConfig().supplierDocsVerified);

  const firstAssurance = document.querySelector('.hero-assurances span:first-child');
  if (firstAssurance) firstAssurance.textContent = verified ? 'Originais' : 'Seleção criteriosa';

  const originCard = [...document.querySelectorAll('.trust-strip article')]
    .find(card => card.querySelector('strong')?.textContent?.trim() === 'Origem como prioridade');
  const originDetail = originCard?.querySelector('p');
  if (originDetail) {
    originDetail.textContent = verified
      ? 'Conferência de fornecedor, lote e procedência antes da venda.'
      : 'A venda real só é liberada após a conferência de fornecedor, lote e procedência.';
  }

  const originFaq = [...document.querySelectorAll('.faq details')]
    .find(detail => detail.querySelector('summary')?.textContent?.trim() === 'Os perfumes são originais?');
  const originAnswer = originFaq?.querySelector('p');
  if (originAnswer) {
    originAnswer.textContent = verified
      ? 'A Zoryvena seleciona produtos com procedência verificada e mantém controle interno de fornecedor, lote e origem.'
      : 'A Zoryvena só libera vendas reais após conferir fornecedor, lote e procedência de cada produto.';
  }
}

function refreshHome() {
  renderHomeProducts();
  applyOriginCopy();
}

window.addEventListener('zoryvena:data', refreshHome);
refreshHome();
