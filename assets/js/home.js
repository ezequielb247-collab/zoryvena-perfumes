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
      : 'A loja não anuncia procedência documental comprovada enquanto essa documentação não estiver disponível.';
  }

  const originFaq = [...document.querySelectorAll('.faq details')]
    .find(detail => detail.querySelector('summary')?.textContent?.trim() === 'Os perfumes são originais?');
  const originAnswer = originFaq?.querySelector('p');
  if (originAnswer) {
    originAnswer.textContent = verified
      ? 'A Zoryvena seleciona produtos com procedência verificada e mantém controle interno de fornecedor, lote e origem.'
      : 'A Zoryvena ainda não possui documentação suficiente do fornecedor para afirmar procedência documental comprovada. Por isso, não usamos essa promessa no site e controlamos cada item pelo catálogo e estoque interno.';
  }
}

function refreshHome() {
  renderHomeProducts();
  applyOriginCopy();
}

window.addEventListener('zoryvena:data', refreshHome);
refreshHome();
