import { supabase } from '../assets/js/supabase.js';
import { paymentProductionState, missingProductionChecks } from './mp-production-readiness-core.mjs';

const WEBHOOK_URL = 'https://ajyultndtauabfufrmfr.supabase.co/functions/v1/mercado-pago-webhook?mode=production';
let lastSettings = null;
let checking = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function ensureCard() {
  const settingsView = document.querySelector('#settingsView');
  const settingsGrid = settingsView?.querySelector('.admin-grid');
  if (!settingsView || !settingsGrid || document.querySelector('#mpProductionCard')) return;

  const card = el('article', 'admin-card');
  card.id = 'mpProductionCard';
  card.innerHTML = `
    <span class="eyebrow">Produção segura</span>
    <h2>Mercado Pago produção</h2>
    <p>Valide as credenciais e a assinatura do webhook antes de liberar cobranças reais.</p>
    <ul class="clean-list" id="mpProductionStatus"></ul>
    <div class="admin-main-actions">
      <button class="admin-action primary" id="verifyMpProduction" type="button">Verificar credenciais</button>
      <button class="admin-action" id="copyMpWebhook" type="button">Copiar URL do webhook</button>
    </div>
    <p id="mpProductionMessage" class="admin-login-note"></p>
    <p class="admin-login-note">Webhook de produção: <code id="mpWebhookUrl"></code></p>
  `;
  settingsGrid.before(card);
  const url = card.querySelector('#mpWebhookUrl');
  if (url) url.textContent = WEBHOOK_URL;
}

function formatVerified(value) {
  if (!value) return 'Ainda não verificado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Verificado' : `Verificado em ${date.toLocaleString('pt-BR')}`;
}

function renderStatus() {
  ensureCard();
  const list = document.querySelector('#mpProductionStatus');
  if (!list || !lastSettings) return;

  const state = paymentProductionState({
    credentialsVerifiedAt: lastSettings.payment_production_credentials_verified_at,
    webhookVerifiedAt: lastSettings.payment_webhook_verified_at,
    supplierDocsVerified: lastSettings.supplier_docs_verified,
    supplierDocsExceptionAcknowledged: lastSettings.supplier_docs_unavailable_acknowledged_at,
    selectedPaymentEnvironment: document.querySelector('#settingsForm')?.elements?.payment_environment?.value || lastSettings.payment_environment,
    storedLaunchStatus: lastSettings.launch_status,
  });

  list.replaceChildren();
  const rows = [
    ['Credenciais produtivas', state.credentialsVerified, formatVerified(lastSettings.payment_production_credentials_verified_at)],
    ['Webhook produtivo', state.webhookVerified, formatVerified(lastSettings.payment_webhook_verified_at)],
  ];
  rows.forEach(([label, ok, detail]) => {
    const item = el('li');
    const strong = el('strong', '', `${ok ? '✓' : '•'} ${label}`);
    const small = el('span', '', detail);
    item.append(strong, document.createTextNode(' — '), small);
    list.append(item);
  });

  const message = document.querySelector('#mpProductionMessage');
  if (message) {
    const missing = missingProductionChecks(state);
    message.textContent = state.paymentReady
      ? 'Mercado Pago produtivo verificado. A opção de produção pode ser liberada pelas demais travas da loja.'
      : `Falta verificar: ${missing.join(' e ')}.`;
  }

  applyGuards(state);
}

function applyGuards(state) {
  const form = document.querySelector('#settingsForm');
  if (!form) return;
  const paymentSelect = form.elements.payment_environment;
  const launchSelect = form.elements.launch_status;
  const productionOption = paymentSelect?.querySelector('option[value="production"]');
  const softLaunchOption = launchSelect?.querySelector('option[value="soft_launch"]');
  const liveOption = launchSelect?.querySelector('option[value="live"]');

  if (productionOption) productionOption.disabled = !state.canUseProduction;
  if (!state.canUseProduction && paymentSelect?.value === 'production') paymentSelect.value = 'test';

  const selectedEnvironment = paymentSelect?.value || 'test';
  const currentState = paymentProductionState({
    credentialsVerifiedAt: lastSettings?.payment_production_credentials_verified_at,
    webhookVerifiedAt: lastSettings?.payment_webhook_verified_at,
    supplierDocsVerified: lastSettings?.supplier_docs_verified,
    supplierDocsExceptionAcknowledged: lastSettings?.supplier_docs_unavailable_acknowledged_at,
    selectedPaymentEnvironment: selectedEnvironment,
    storedLaunchStatus: lastSettings?.launch_status,
  });
  if (softLaunchOption) softLaunchOption.disabled = !currentState.canUseSoftLaunch;
  if (liveOption) liveOption.disabled = !currentState.canUseLive;
  if (!currentState.canUseSoftLaunch && launchSelect?.value === 'soft_launch') launchSelect.value = 'preparation';
  if (!currentState.canUseLive && launchSelect?.value === 'live') launchSelect.value = lastSettings?.launch_status === 'soft_launch' ? 'soft_launch' : 'preparation';
}

async function loadSettings() {
  ensureCard();
  const { data, error } = await supabase.from('store_settings')
    .select('payment_environment,launch_status,supplier_docs_verified,supplier_docs_unavailable_acknowledged_at,payment_production_credentials_verified_at,payment_webhook_verified_at')
    .eq('id', 1)
    .single();
  if (error) throw error;
  lastSettings = data;
  renderStatus();
}

function humanizeChecks(checks = {}) {
  const labels = {
    publicKeyPresent: 'Public Key produtiva',
    pixAccessTokenPresent: 'Access Token do Pix',
    cardAccessTokenPresent: 'Access Token do cartão',
    webhookSecretPresent: 'Secret do webhook',
    pixApiAuthenticated: 'Autenticação Pix na API',
    cardApiAuthenticated: 'Autenticação cartão na API',
  };
  return Object.entries(checks)
    .filter(([, ok]) => !ok)
    .map(([key]) => labels[key] || key);
}

async function verifyCredentials() {
  if (checking) return;
  const button = document.querySelector('#verifyMpProduction');
  const message = document.querySelector('#mpProductionMessage');
  checking = true;
  if (button) button.disabled = true;
  if (message) message.textContent = 'Verificando credenciais produtivas sem criar cobrança…';
  try {
    const { data, error } = await supabase.functions.invoke('mp-production-readiness', { body: {} });
    if (error) throw error;
    if (!data?.credentialsReady) {
      const missing = humanizeChecks(data?.checks);
      if (message) message.textContent = missing.length ? `Ainda falta: ${missing.join(', ')}.` : 'As credenciais produtivas ainda não passaram na verificação.';
      return;
    }
    if (message) message.textContent = data?.webhookSecretPresent
      ? 'Credenciais autenticadas. Agora envie uma simulação assinada para o webhook de produção.'
      : 'Credenciais autenticadas. Ainda falta cadastrar o secret do webhook nas Edge Function Secrets.';
    await loadSettings();
  } catch (error) {
    console.error('mp production verification failed', error);
    if (message) message.textContent = 'Não foi possível verificar. Confirme MFA e os Secrets do Supabase.';
  } finally {
    checking = false;
    if (button) button.disabled = false;
  }
}

async function copyWebhookUrl() {
  const message = document.querySelector('#mpProductionMessage');
  try {
    await navigator.clipboard.writeText(WEBHOOK_URL);
    if (message) message.textContent = 'URL do webhook copiada.';
  } catch {
    if (message) message.textContent = `Copie manualmente: ${WEBHOOK_URL}`;
  }
}

document.addEventListener('click', event => {
  if (event.target.closest('#verifyMpProduction')) verifyCredentials();
  if (event.target.closest('#copyMpWebhook')) copyWebhookUrl();
});

document.querySelector('#settingsForm')?.addEventListener('change', () => window.setTimeout(renderStatus, 0));
document.querySelector('#refreshAdmin')?.addEventListener('click', () => window.setTimeout(() => loadSettings().catch(console.error), 600));
supabase.auth.onAuthStateChange(() => window.setTimeout(() => loadSettings().catch(() => {}), 700));

ensureCard();
window.setTimeout(() => loadSettings().catch(() => {}), 900);
