import './mfa-bootstrap.js';
import './security.js';
import { supabase } from '../assets/js/supabase.js';
import { showToast } from '../assets/js/store.js';

const modal = document.querySelector('#orderModal');
const saveButton = document.querySelector('#saveOrderManagement');
const settingsForm = document.querySelector('#settingsForm');
const PRODUCT_BUCKET = 'product-images';

function numberOrNull(value) {
  if (value === '' || value == null) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error('Informe somente valores numéricos válidos.');
  return number;
}

function applyVirtualStoreLabels() {
  const addressField = settingsForm?.elements?.business_address;
  const addressLabel = addressField?.closest('label');

  if (addressLabel) {
    const firstTextNode = [...addressLabel.childNodes].find(node => node.nodeType === Node.TEXT_NODE);
    if (firstTextNode) firstTextNode.textContent = 'Endereço legal para correspondência';
    addressField.placeholder = 'Endereço real do responsável ou da empresa para identificação legal e correspondência';

    if (!addressLabel.querySelector('[data-virtual-address-note]')) {
      const note = document.createElement('small');
      note.dataset.virtualAddressNote = '';
      note.textContent = 'A Zoryvena é exclusivamente virtual. Este endereço não será divulgado como loja física nem como local de atendimento ao público.';
      addressField.after(note);
    }
  }

  document.querySelectorAll('.readiness-item').forEach(card => {
    const title = card.querySelector('strong');
    const detail = card.querySelector('p');
    if (title?.textContent === 'Endereço e canais oficiais') title.textContent = 'Endereço legal e canais online';
    if (detail?.textContent === 'Endereço, e-mail e WhatsApp disponíveis.') {
      detail.textContent = 'Endereço de identificação legal, e-mail e WhatsApp disponíveis. A loja não possui atendimento presencial.';
    }
    if (detail?.textContent === 'Falta endereço comercial ou canal oficial.') {
      detail.textContent = 'Falta o endereço legal para correspondência ou algum canal online.';
    }
  });
}

saveButton?.addEventListener('click', () => {
  if (modal?.open) modal.close();
}, { capture: true });

async function uploadSafeProductImage(productId, input) {
  const file = input?.files?.[0];
  if (!file) return { url: null, path: null };
  if (input.dataset.processing === 'true') throw new Error('Aguarde o processamento seguro da imagem terminar.');
  if (input.dataset.sanitized !== 'true' || file.type !== 'image/webp' || file.size > 4 * 1024 * 1024) {
    throw new Error('A imagem precisa ser validada e convertida para WebP antes do envio.');
  }

  const path = `${productId}/${Date.now()}-${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(PRODUCT_BUCKET).upload(path, file, {
    cacheControl: '31536000',
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(PRODUCT_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, path };
}

async function saveProductSecurely(button) {
  const productId = String(button.dataset.saveProduct || '');
  if (!/^[a-z0-9-]{1,120}$/i.test(productId)) throw new Error('Identificador de produto inválido.');

  const patch = {};
  document.querySelectorAll(`[data-product="${CSS.escape(productId)}"]`).forEach(input => {
    const field = input.dataset.field;
    if (!field) return;
    if (field === 'active') patch.active = Boolean(input.checked);
    else if (field === 'image') patch.image = String(input.value || '').trim() || null;
    else if (['cost', 'price', 'pix_price', 'stock', 'minimum_stock'].includes(field)) patch[field] = numberOrNull(input.value);
  });

  const fileInput = document.querySelector(`[data-file-product="${CSS.escape(productId)}"]`);
  let uploadedPath = null;
  try {
    const uploaded = await uploadSafeProductImage(productId, fileInput);
    uploadedPath = uploaded.path;
    if (uploaded.url) patch.image = uploaded.url;

    const { error } = await supabase.rpc('admin_update_product', {
      p_product_id: productId,
      p_patch: patch,
    });
    if (error) throw error;
    showToast('Produto atualizado por operação administrativa protegida.');
  } catch (error) {
    if (uploadedPath) {
      try { await supabase.storage.from(PRODUCT_BUCKET).remove([uploadedPath]); } catch { /* limpeza posterior */ }
    }
    throw error;
  }
}

document.addEventListener('click', async event => {
  const productButton = event.target.closest('[data-save-product]');
  if (productButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    productButton.disabled = true;
    const original = productButton.textContent;
    productButton.textContent = 'Salvando…';
    try {
      await saveProductSecurely(productButton);
      document.querySelector('#refreshAdmin')?.click();
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Não foi possível atualizar o produto.');
    } finally {
      productButton.disabled = false;
      productButton.textContent = original;
    }
    return;
  }

  const deleteCoupon = event.target.closest('[data-delete-coupon]');
  if (deleteCoupon) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm('Excluir este cupom? A ação ficará registrada na auditoria.')) return;
    deleteCoupon.disabled = true;
    try {
      const { error } = await supabase.rpc('admin_delete_coupon', {
        p_coupon_id: deleteCoupon.dataset.deleteCoupon,
      });
      if (error) throw error;
      showToast('Cupom excluído.');
      document.querySelector('#refreshAdmin')?.click();
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Não foi possível excluir o cupom.');
    } finally {
      deleteCoupon.disabled = false;
    }
    return;
  }

  const archiveButton = event.target.closest('#archiveUnpaidOrders');
  if (archiveButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!confirm('Arquivar todas as tentativas não pagas? Nenhum registro será apagado.')) return;
    archiveButton.disabled = true;
    try {
      const { data, error } = await supabase.rpc('admin_archive_unpaid_orders');
      if (error) throw error;
      showToast(`${Number(data || 0)} tentativa(s) arquivada(s).`);
      document.querySelector('#refreshAdmin')?.click();
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Não foi possível arquivar as tentativas.');
    } finally {
      archiveButton.disabled = false;
    }
  }
}, { capture: true });

const couponForm = document.querySelector('#couponForm');
couponForm?.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!couponForm.reportValidity()) return;

  const data = Object.fromEntries(new FormData(couponForm));
  const button = couponForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const { error } = await supabase.rpc('admin_create_coupon', {
      p_code: String(data.code || '').trim().toUpperCase(),
      p_type: String(data.type || ''),
      p_value: Number(data.value),
    });
    if (error) throw error;
    couponForm.reset();
    showToast('Cupom criado com validação do servidor.');
    document.querySelector('#refreshAdmin')?.click();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível criar o cupom.');
  } finally {
    button.disabled = false;
  }
}, { capture: true });

settingsForm?.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!settingsForm.reportValidity()) return;

  const data = Object.fromEntries(new FormData(settingsForm));
  const payload = {
    name: String(data.name || '').trim(),
    short_name: String(data.short_name || '').trim(),
    slogan: String(data.slogan || '').trim(),
    whatsapp: String(data.whatsapp || '').trim(),
    instagram: String(data.instagram || '').trim(),
    email: String(data.email || '').trim().toLowerCase(),
    legal_name: String(data.legal_name || '').trim(),
    tax_id: String(data.tax_id || '').trim(),
    business_address: String(data.business_address || '').trim(),
    service_hours: String(data.service_hours || '').trim(),
    privacy_contact_email: String(data.privacy_contact_email || '').trim().toLowerCase(),
    shipping_policy: String(data.shipping_policy || '').trim(),
    shipping_origin_cep: String(data.shipping_origin_cep || '').replace(/\D/g, '') || null,
    shipping_mode: String(data.shipping_mode || ''),
    payment_environment: String(data.payment_environment || ''),
    email_notifications_enabled: data.email_notifications_enabled === 'true',
    supplier_docs_verified: data.supplier_docs_verified === 'true',
    policies_updated_at: data.policies_updated_at || null,
    launch_status: String(data.launch_status || ''),
    free_shipping_from: numberOrNull(data.free_shipping_from),
    site_url: String(data.site_url || '').trim(),
  };

  const button = settingsForm.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Salvando…';
  try {
    const { error } = await supabase.rpc('admin_update_store_settings', { p_data: payload });
    if (error) throw error;
    const saved = document.querySelector('#settingsSaved');
    if (saved) {
      saved.hidden = false;
      setTimeout(() => { saved.hidden = true; }, 2200);
    }
    showToast('Configurações salvas com validação e auditoria.');
    document.querySelector('#refreshAdmin')?.click();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível salvar as configurações.');
  } finally {
    button.disabled = false;
    button.textContent = 'Salvar configurações';
  }
}, { capture: true });

const readinessList = document.querySelector('#launchReadinessList');
if (readinessList) {
  new MutationObserver(applyVirtualStoreLabels).observe(readinessList, { childList: true, subtree: true });
}

applyVirtualStoreLabels();
