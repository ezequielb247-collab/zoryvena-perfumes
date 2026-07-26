import { getProducts } from './store.js';
import { productCard } from './components.js';
const products = getProducts();
const featured = document.querySelector('#featuredProducts');
if (featured) featured.innerHTML = products.slice(0, 4).map(p => productCard(p)).join('');
const feminine = document.querySelector('#feminineProducts');
if (feminine) feminine.innerHTML = products.filter(p => p.gender === 'Feminino').slice(0, 4).map(p => productCard(p)).join('');
