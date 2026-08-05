import { getProducts } from './store.js';
import { productCard } from './components.js';

function renderHomeProducts() {
  const products = getProducts();
  const featured = document.querySelector('#featuredProducts');
  if (featured) featured.innerHTML = products.slice(0, 4).map(product => productCard(product)).join('');
  const feminine = document.querySelector('#feminineProducts');
  if (feminine) feminine.innerHTML = products.filter(product => product.gender === 'Feminino').slice(0, 4).map(product => productCard(product)).join('');
}

window.addEventListener('zoryvena:data', renderHomeProducts);
renderHomeProducts();
