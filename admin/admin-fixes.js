import './security.js';
import { supabase } from '../assets/js/supabase.js';
import { showToast } from '../assets/js/store.js';

const modal = document.querySelector('#orderModal');
const saveButton = document.querySelector('#saveOrderManagement');
const settingsForm = document.querySelector('#settingsForm');

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

settingsForm?.addEventListener('submit', async event => {
  event.preventDefault();
  event.stopImmediatePropagation();

  const data = Object.fromEntries(new FormData(settingsForm));
  data.id = 1;
  data.free_shipping_from = data.free_shipping_from === '' ? null : Number(data.free_shipping_from);
  data.email_notifications_enabled = data.email_notifications_enabled === 'true';
  data.supplier_docs_verified = data.supplier_docs_verified === 'true';
  data.shipping_origin_cep = String(data.shipping_origin_cep || '').replace(/\D/g, '') || null;
  data.policies_updated_at = data.policies_updated_at || null;

  const legalReady = String(data.legal_name || '').trim()
    && String(data.tax_id || '').trim()
    && String(data.business_address || '').trim();

  if (data.payment_environment === 'production' && !legalReady) {
    showToast('Preencha nome legal, CPF/CNPJ e endereço legal para correspondência antes de preparar o ambiente produtivo.');
    return;
  }

  if (data.launch_status === 'live') {
    if (!legalReady || !data.supplier_docs_verified || data.payment_environment !== 'production' || !data.policies_updated_at) {
      showToast('A loja ainda possui bloqueadores. Confira o checklist de lançamento no Dashboard.');
      return;
    }
  }

  const button = settingsForm.querySelector('button[type="submit"]');
  if (button) {
    button.disabled = true;
    button.textContent = 'Salvando...';
  }

  try {
    const { error } = await supabase.from('store_settings').upsert(data, { onConflict: 'id' });
    if (error) throw error;
    const saved = document.querySelector('#settingsSaved');
    if (saved) {
      saved.hidden = false;
      setTimeout(() => { saved.hidden = true; }, 2200);
    }
    showToast('Configurações salvas e checklist atualizado.');
    document.querySelector('#refreshAdmin')?.click();
  } catch (error) {
    console.error(error);
    showToast(error?.message || 'Não foi possível salvar as configurações.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Salvar configurações';
    }
  }
}, { capture: true });

const readinessList = document.querySelector('#launchReadinessList');
if (readinessList) {
  new MutationObserver(applyVirtualStoreLabels).observe(readinessList, { childList: true, subtree: true });
}

applyVirtualStoreLabels();
