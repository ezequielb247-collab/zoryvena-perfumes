import { getProducts, getFavorites, getCompare, clearCompare, showToast } from './store.js';
import { productCard, emptyState } from './components.js';

const all = getProducts();
const grid = document.querySelector('#catalogGrid');
const form = document.querySelector('#catalogFilters');
const resultCount = document.querySelector('#resultCount');
const compareTray = document.querySelector('#compareTray');
const params = new URLSearchParams(location.search);

function unique(key) {
  return [...new Set(all.map(product => String(product[key] || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function fillSelect(selector, values) {
  const element = document.querySelector(selector);
  if (!element) return;
  const fragment = document.createDocumentFragment();
  values.forEach(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    fragment.appendChild(option);
  });
  element.appendChild(fragment);
}

fillSelect('#brandFilter', unique('brand'));
fillSelect('#familyFilter', unique('family'));
fillSelect('#climateFilter', unique('climate'));

const requestedGender = params.get('genero');
const genderFilter = document.querySelector('#genderFilter');
if (genderFilter && ['Masculino', 'Feminino', 'Unissex'].includes(requestedGender)) genderFilter.value = requestedGender;
if (params.get('favoritos') === '1') document.querySelector('#favoriteOnly').checked = true;

function render() {
  const data = new FormData(form);
  const favorites = getFavorites();
  const query = String(data.get('query') || '').trim().toLocaleLowerCase('pt-BR').slice(0, 120);
  let products = all.filter(product => {
    const searchable = [product.name, product.brand, product.family, product.occasion, product.climate, product.topNotes, product.heartNotes, product.baseNotes]
      .map(value => String(value || ''))
      .join(' ')
      .toLocaleLowerCase('pt-BR');
    return (!query || searchable.includes(query))
      && (!data.get('gender') || product.gender === data.get('gender'))
      && (!data.get('brand') || product.brand === data.get('brand'))
      && (!data.get('family') || product.family === data.get('family'))
      && (!data.get('climate') || product.climate === data.get('climate'))
      && (!data.get('favoriteOnly') || favorites.includes(product.id))
      && (!data.get('stockOnly') || Number(product.stock) > 0);
  });

  const sort = data.get('sort');
  if (sort === 'name') products.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  else if (sort === 'brand') products.sort((a, b) => a.brand.localeCompare(b.brand, 'pt-BR'));
  else if (sort === 'price-asc') products.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  else if (sort === 'price-desc') products.sort((a, b) => (b.price ?? -1) - (a.price ?? -1));
  else if (sort === 'new') products.sort((a, b) => b.rank - a.rank);
  else products.sort((a, b) => a.rank - b.rank);

  resultCount.textContent = `${products.length} ${products.length === 1 ? 'perfume encontrado' : 'perfumes encontrados'}`;
  grid.innerHTML = products.length
    ? products.map(product => productCard(product)).join('')
    : emptyState('Nenhum perfume encontrado', 'Altere os filtros ou faça uma nova busca.');
  updateCompareTray();
}

function updateCompareTray() {
  const count = getCompare().length;
  compareTray.hidden = count === 0;
  compareTray.querySelector('[data-compare-count]').textContent = String(count);
}

form.addEventListener('input', render);
form.addEventListener('change', render);
document.querySelector('#clearFilters').addEventListener('click', () => { form.reset(); render(); });
document.querySelector('#clearCompare').addEventListener('click', () => {
  clearCompare();
  document.querySelectorAll('[data-compare]').forEach(element => { element.checked = false; });
  updateCompareTray();
  showToast('Comparação limpa.');
});
window.addEventListener('zoryvena:state', updateCompareTray);
render();
