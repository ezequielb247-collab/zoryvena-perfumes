import { getProducts, isAvailable } from './store.js';
import { productCard, emptyState } from './components.js';

const form = document.querySelector('#quizForm');
const result = document.querySelector('#quizResult');

form.addEventListener('submit', event => {
  event.preventDefault();
  const answers = Object.fromEntries(new FormData(form));
  const available = getProducts().filter(product => isAvailable(product));
  const scored = available.map(product => {
    let score = 0;
    if (answers.gender === 'Qualquer' || product.gender === answers.gender || product.gender === 'Unissex') score += 3;
    if (product.family.toLowerCase().includes(answers.profile.toLowerCase())) score += 4;
    if (product.occasion.toLowerCase().includes(answers.occasion.toLowerCase()) || answers.occasion === 'Qualquer') score += 3;
    if (product.climate.toLowerCase().includes(answers.climate.toLowerCase()) || answers.climate === 'Qualquer') score += 2;
    if (answers.intensity === 'Marcante' && /intenso|marcante|persistente/i.test(`${product.fixation} ${product.projection}`)) score += 2;
    if (answers.intensity === 'Equilibrado' && /equilibrado|média|versátil/i.test(`${product.fixation} ${product.projection}`)) score += 2;
    return { product, score };
  }).sort((left, right) => right.score - left.score).slice(0, 3).map(entry => entry.product);

  result.hidden = false;
  result.innerHTML = scored.length
    ? `<div class="section-heading"><span class="eyebrow">Sua seleção</span><h2>Perfumes disponíveis para começar</h2><p>As recomendações consideram o perfil informado e a disponibilidade atual. A experiência na pele pode variar.</p></div><div class="product-grid">${scored.map(product => productCard(product)).join('')}</div>`
    : emptyState('Nenhuma recomendação disponível agora', 'O estoque atual não possui uma opção disponível para esse resultado. Consulte o catálogo ou fale com a equipe.');
  result.scrollIntoView({ behavior: 'smooth' });
});
