import { getProduct, addToCart, isAvailable, priceText, productWhatsapp, getProducts, showToast } from './store.js';
import { media, productCard, escapeHtml } from './components.js';
const id = document.body.dataset.productId;
const product = getProduct(id);
const container = document.querySelector('#productPage');
if (!product) container.innerHTML = '<div class="empty-state"><h1>Perfume não encontrado</h1><a class="button button-dark" href="/catalogo.html">Voltar ao catálogo</a></div>';
else {
  document.title = `${product.name} ${product.brand} | Velmora Perfumes`;
  container.innerHTML = `<div class="product-detail-grid">
    <section class="product-gallery">${media(product,'large')}<p class="image-note">A imagem oficial será adicionada após autorização do fornecedor.</p></section>
    <section class="product-detail-copy">
      <span class="eyebrow">${escapeHtml(product.brand)} · ${escapeHtml(product.gender)}</span>
      <h1>${escapeHtml(product.name)}</h1><p class="lead">${escapeHtml(product.description)}</p>
      <div class="price-block"><strong>${escapeHtml(priceText(product))}</strong><small>${isAvailable(product) ? `${product.stock} unidades disponíveis` : 'Valor e estoque sob consulta'}</small></div>
      <div class="detail-actions">
        ${isAvailable(product) ? '<button class="button button-gold" id="addProduct">Adicionar ao carrinho</button>' : `<a class="button button-gold" target="_blank" rel="noopener" href="${productWhatsapp(product)}">Consultar pelo WhatsApp</a>`}
        <button class="button button-outline" data-favorite="${product.id}">♡ Favoritar</button>
        <label class="button button-outline compare-label"><input type="checkbox" data-compare="${product.id}"> Comparar</label>
      </div>
      <dl class="product-facts"><div><dt>Volume</dt><dd>${escapeHtml(product.volume)}</dd></div><div><dt>Família</dt><dd>${escapeHtml(product.family)}</dd></div><div><dt>Ocasião</dt><dd>${escapeHtml(product.occasion)}</dd></div><div><dt>Clima</dt><dd>${escapeHtml(product.climate)}</dd></div><div><dt>Fixação</dt><dd>${escapeHtml(product.fixation)}</dd></div><div><dt>Projeção</dt><dd>${escapeHtml(product.projection)}</dd></div></dl>
    </section>
  </div>
  <section class="section notes-section"><div class="section-heading"><span class="eyebrow">Pirâmide olfativa</span><h2>Como a fragrância evolui</h2></div><div class="notes-grid"><article><span>01</span><h3>Notas de saída</h3><p>${escapeHtml(product.topNotes)}</p></article><article><span>02</span><h3>Notas de coração</h3><p>${escapeHtml(product.heartNotes)}</p></article><article><span>03</span><h3>Notas de fundo</h3><p>${escapeHtml(product.baseNotes)}</p></article></div></section>
  <section class="section"><div class="section-heading"><span class="eyebrow">Continue explorando</span><h2>Perfumes relacionados</h2></div><div class="product-grid" id="relatedProducts"></div></section>`;
  document.querySelector('#addProduct')?.addEventListener('click',()=>{ if(addToCart(product)) showToast('Perfume adicionado ao carrinho.'); });
  const related = getProducts().filter(p=>p.id!==product.id && (p.gender===product.gender || p.family===product.family)).slice(0,4);
  document.querySelector('#relatedProducts').innerHTML = related.map(p=>productCard(p)).join('');
}
