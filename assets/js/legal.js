import { getConfig, syncStoreData } from './store.js';

function text(value, fallback = 'Ainda não preenchido no painel administrativo') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function renderLegalData() {
  const config = getConfig();
  const fields = {
    '[data-legal-name]': text(config.legalName),
    '[data-tax-id]': text(config.taxId),
    '[data-business-address]': text(config.businessAddress),
    '[data-service-hours]': text(config.serviceHours, 'Atendimento em horário comercial'),
    '[data-privacy-email]': text(config.privacyContactEmail || config.email),
    '[data-shipping-policy]': text(config.shippingPolicy, 'Retirada gratuita em Macaé. Entregas são cotadas antes do pagamento.'),
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
  });
}

renderLegalData();
window.addEventListener('zoryvena:data', renderLegalData);
syncStoreData().then(renderLegalData);
