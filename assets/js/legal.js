import { getConfig, syncStoreData } from './store.js';

function text(value, fallback = 'Ainda não preenchido no painel administrativo') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function applyVirtualStoreLanguage() {
  document.querySelectorAll('[data-business-address]').forEach(element => {
    const label = element.parentElement?.querySelector('span');
    if (label) label.textContent = 'Endereço legal para correspondência';
  });

  document.querySelectorAll('.legal-business-card').forEach(card => {
    if (card.nextElementSibling?.matches('[data-virtual-store-note]')) return;
    const note = document.createElement('p');
    note.dataset.virtualStoreNote = '';
    note.className = 'legal-virtual-store-note';
    note.textContent = 'A Zoryvena funciona exclusivamente pela internet. O endereço informado serve para identificação legal e correspondência; não é loja física nem local de atendimento ao público.';
    card.after(note);
  });
}

function renderLegalData() {
  const config = getConfig();
  const fields = {
    '[data-legal-name]': text(config.legalName),
    '[data-tax-id]': text(config.taxId),
    '[data-business-address]': text(config.businessAddress, 'Endereço legal ainda não preenchido'),
    '[data-service-hours]': text(config.serviceHours, 'Atendimento online em horário comercial'),
    '[data-privacy-email]': text(config.privacyContactEmail || config.email),
    '[data-shipping-policy]': text(
      config.shippingPolicy,
      'Loja exclusivamente virtual, sem atendimento presencial. Entregas são cotadas antes do pagamento; eventual retirada em Macaé é combinada individualmente.'
    ),
    '[data-policy-date]': config.policiesUpdatedAt
      ? new Date(`${config.policiesUpdatedAt}T12:00:00`).toLocaleDateString('pt-BR')
      : 'Data de revisão pendente',
  };

  Object.entries(fields).forEach(([selector, value]) => {
    document.querySelectorAll(selector).forEach(element => { element.textContent = value; });
  });

  const missing = !String(config.legalName || '').trim()
    || !String(config.taxId || '').trim()
    || !String(config.businessAddress || '').trim();

  document.querySelectorAll('[data-legal-warning]').forEach(element => {
    element.hidden = !missing;
    if (missing) {
      element.textContent = 'A Zoryvena é exclusivamente virtual. Antes da abertura oficial, ainda é necessário preencher o nome legal, CPF/CNPJ e um endereço real para identificação e correspondência.';
    }
  });

  applyVirtualStoreLanguage();
}

renderLegalData();
window.addEventListener('zoryvena:data', renderLegalData);
syncStoreData().then(renderLegalData);
