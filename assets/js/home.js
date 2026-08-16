import { getProducts, getConfig, isAvailable } from './store.js';
import { productCard } from './components.js';

function renderHomeProducts() {
  const products = getProducts();
  const available = products.filter(product => isAvailable(product));
  const featured = document.querySelector('#featuredProducts');
  if (featured) featured.innerHTML = available.slice(0, 4).map(product => productCard(product)).join('');
  const feminine = document.querySelector('#feminineProducts');
  if (feminine) feminine.innerHTML = available.filter(product => product.gender === 'Feminino').slice(0, 4).map(product => productCard(product)).join('');
}

function applyOriginCopy() {
  const verified = Boolean(getConfig().supplierDocsVerified);
  const originFaq = [...document.querySelectorAll('.faq details')]
    .find(detail => detail.querySelector('summary')?.textContent?.trim() === 'Como a Zoryvena trata a procedência?');
  const originAnswer = originFaq?.querySelector('p');
  if (!originAnswer) return;

  originAnswer.textContent = verified
    ? 'A documentação disponível do fornecedor foi conferida internamente. Se quiser informações adicionais sobre um produto, fale com a equipe antes da compra.'
    : 'A documentação de procedência do fornecedor ainda não está disponível para verificação. Por isso, a Zoryvena não apresenta origem ou procedência documental como comprovada. Em caso de dúvida sobre um produto, fale com a equipe antes da compra.';
}

function refreshHome() {
  renderHomeProducts();
  applyOriginCopy();
}

window.addEventListener('zoryvena:data', refreshHome);
refreshHome();
