import { getProducts, getFavorites, getCompare, clearCompare, showToast } from './store.js';
import { productCard, emptyState } from './components.js';

const all = getProducts();
const grid = document.querySelector('#catalogGrid');
const form = document.querySelector('#catalogFilters');
const resultCount = document.querySelector('#resultCount');
const compareTray = document.querySelector('#compareTray');
const params = new URLSearchParams(location.search);

function unique(key) { return [...new Set(all.map(p => p[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR')); }
function fillSelect(id, values) { const el = document.querySelector(id); if (!el) return; el.innerHTML += values.map(v => `<option>${v}</option>`).join(''); }
fillSelect('#brandFilter', unique('brand')); fillSelect('#familyFilter', unique('family')); fillSelect('#climateFilter', unique('climate'));
if (params.get('genero')) document.querySelector('#genderFilter').value = params.get('genero');
if (params.get('favoritos')) document.querySelector('#favoriteOnly').checked = true;

function render() {
  const data = new FormData(form); const favorites = getFavorites();
  const query = String(data.get('query') || '').trim().toLowerCase();
  let products = all.filter(p => {
    const searchable = [p.name,p.brand,p.family,p.occasion,p.climate,p.topNotes,p.heartNotes,p.baseNotes].join(' ').toLowerCase();
    return (!query || searchable.includes(query)) && (!data.get('gender') || p.gender === data.get('gender')) && (!data.get('brand') || p.brand === data.get('brand')) && (!data.get('family') || p.family === data.get('family')) && (!data.get('climate') || p.climate === data.get('climate')) && (!data.get('favoriteOnly') || favorites.includes(p.id)) && (!data.get('stockOnly') || Number(p.stock)>0);
  });
  const sort = data.get('sort');
  if (sort === 'name') products.sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
  if (sort === 'brand') products.sort((a,b)=>a.brand.localeCompare(b.brand,'pt-BR'));
  if (sort === 'price-asc') products.sort((a,b)=>(a.price ?? Infinity)-(b.price ?? Infinity));
  if (sort === 'price-desc') products.sort((a,b)=>(b.price ?? -1)-(a.price ?? -1));
  if (sort === 'new') products.sort((a,b)=>b.rank-a.rank);
  if (!sort || sort === 'popular') products.sort((a,b)=>a.rank-b.rank);
  resultCount.textContent = `${products.length} ${products.length === 1 ? 'perfume encontrado' : 'perfumes encontrados'}`;
  grid.innerHTML = products.length ? products.map(p => productCard(p)).join('') : emptyState('Nenhum perfume encontrado','Altere os filtros ou faça uma nova busca.');
  updateCompareTray();
}
function updateCompareTray() {
  const count = getCompare().length; compareTray.hidden = count === 0;
  compareTray.querySelector('[data-compare-count]').textContent = count;
}
form.addEventListener('input', render); form.addEventListener('change', render);
document.querySelector('#clearFilters').addEventListener('click', () => { form.reset(); render(); });
document.querySelector('#clearCompare').addEventListener('click', () => { clearCompare(); document.querySelectorAll('[data-compare]').forEach(el => el.checked=false); updateCompareTray(); showToast('Comparação limpa.'); });
window.addEventListener('zoryvena:state', updateCompareTray);
render();
