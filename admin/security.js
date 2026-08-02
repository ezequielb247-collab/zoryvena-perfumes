import { supabase } from '../assets/js/supabase.js';
import { showToast } from '../assets/js/store.js';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const WARNING_BEFORE_MS = 2 * 60 * 1000;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 1800;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

let idleTimer;
let warningTimer;
let lastActivityWrite = 0;
let mfaCheckRunning = false;
let enrollmentFactorId = '';

async function logoutForInactivity() {
  try { await supabase.auth.signOut(); } catch { /* sessão local será eliminada ao recarregar */ }
  sessionStorage.clear();
  location.replace('/admin/?sessao=expirada');
}

function resetIdleTimers() {
  const now = Date.now();
  if (now - lastActivityWrite < 1000) return;
  lastActivityWrite = now;
  clearTimeout(idleTimer);
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => {
    if (!document.querySelector('#adminPanel')?.hidden) {
      showToast('A sessão administrativa será encerrada em 2 minutos por inatividade.');
    }
  }, IDLE_TIMEOUT_MS - WARNING_BEFORE_MS);
  idleTimer = setTimeout(logoutForInactivity, IDLE_TIMEOUT_MS);
}

['pointerdown', 'keydown', 'touchstart', 'scroll'].forEach(eventName => {
  window.addEventListener(eventName, resetIdleTimers, { passive: true, capture: true });
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) resetIdleTimers();
});
resetIdleTimers();

function validateStrongPassword(password) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

const passwordForm = document.querySelector('#passwordForm');
if (passwordForm) {
  const fields = passwordForm.querySelectorAll('input[type="password"]');
  fields.forEach(field => {
    field.minLength = 12;
    field.autocomplete = 'new-password';
  });
  passwordForm.addEventListener('submit', event => {
    const data = new FormData(passwordForm);
    const password = String(data.get('newPassword') || '');
    if (validateStrongPassword(password)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast('Use pelo menos 12 caracteres, com maiúscula, minúscula, número e símbolo.');
  }, { capture: true });
}

function element(tag, options = {}) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text) node.textContent = options.text;
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  return node;
}

function verifiedTotpFactors(data) {
  const factors = Array.isArray(data?.totp) ? data.totp : Array.isArray(data?.all) ? data.all : [];
  return factors.filter(factor => factor?.factor_type === 'totp' && factor?.status === 'verified');
}

function removeMfaGate() {
  document.querySelector('#adminMfaGate')?.remove();
}

function createOtpInput() {
  const input = element('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.pattern = '[0-9]{6}';
  input.maxLength = 6;
  input.required = true;
  input.placeholder = '000000';
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  });
  return input;
}

function showMfaChallenge(factor) {
  removeMfaGate();
  const login = document.querySelector('#adminLogin');
  const panel = document.querySelector('#adminPanel');
  if (login) login.hidden = true;
  if (panel) panel.hidden = true;

  const gate = element('section', { className: 'admin-login', id: 'adminMfaGate' });
  const brand = element('div', { className: 'brand' });
  const logo = document.createElement('img');
  logo.className = 'admin-brand-image';
  logo.src = '/assets/branding/logo-square-clean.png';
  logo.alt = 'Logo Zoryvena Perfumes';
  brand.appendChild(logo);

  const title = element('h1', { text: 'Verificação em duas etapas' });
  const description = element('p', { text: 'Digite o código de 6 números gerado pelo aplicativo autenticador.' });
  const form = element('form', { className: 'admin-form' });
  const label = element('label', { text: 'Código temporário' });
  const input = createOtpInput();
  label.appendChild(input);
  const submit = element('button', { className: 'button button-dark', text: 'Verificar e entrar', type: 'submit' });
  const logout = element('button', { className: 'button button-outline', text: 'Cancelar e sair', type: 'button' });
  const feedback = element('p');
  feedback.hidden = true;

  form.append(label, submit, logout, feedback);
  gate.append(brand, title, description, form);
  document.body.appendChild(gate);
  input.focus();

  logout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace('/admin/');
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    submit.disabled = true;
    feedback.hidden = true;
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: factor.id,
        code: input.value,
      });
      if (error) throw error;
      location.reload();
    } catch {
      feedback.hidden = false;
      feedback.textContent = 'Código inválido ou expirado. Aguarde o próximo código e tente novamente.';
      feedback.style.color = 'var(--admin-red)';
      input.select();
    } finally {
      submit.disabled = false;
    }
  });
}

function ensureMfaSettingsCard() {
  const grid = document.querySelector('#settingsView .admin-grid');
  if (!grid || grid.querySelector('[data-mfa-card]')) return grid?.querySelector('[data-mfa-card]') || null;

  const card = element('article', { className: 'admin-card' });
  card.dataset.mfaCard = '';
  const title = element('h2', { text: 'Autenticação em duas etapas' });
  const status = element('p', { id: 'adminMfaStatus', text: 'Verificando proteção…' });
  const action = element('button', { className: 'button button-dark', text: 'Ativar com aplicativo autenticador', type: 'button' });
  action.id = 'startMfaEnrollment';
  const setup = element('div', { className: 'admin-form' });
  setup.id = 'mfaEnrollmentSetup';
  setup.hidden = true;

  card.append(title, status, action, setup);
  grid.appendChild(card);
  action.addEventListener('click', startMfaEnrollment);
  return card;
}

async function removeUnverifiedFactors() {
  const { data } = await supabase.auth.mfa.listFactors();
  const factors = Array.isArray(data?.all) ? data.all : [];
  for (const factor of factors) {
    if (factor.status !== 'verified') {
      try { await supabase.auth.mfa.unenroll({ factorId: factor.id }); } catch { /* segue com novo cadastro */ }
    }
  }
}

async function startMfaEnrollment() {
  const button = document.querySelector('#startMfaEnrollment');
  const setup = document.querySelector('#mfaEnrollmentSetup');
  if (!button || !setup) return;
  button.disabled = true;
  setup.hidden = true;
  setup.replaceChildren();

  try {
    await removeUnverifiedFactors();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Zoryvena Admin',
    });
    if (error) throw error;
    const qrCode = String(data?.totp?.qr_code || '');
    const secret = String(data?.totp?.secret || '');
    if (!data?.id || !qrCode.startsWith('data:image/')) throw new Error('qr_unavailable');
    enrollmentFactorId = data.id;

    const instructions = element('p', { text: 'Abra Google Authenticator, Microsoft Authenticator ou outro aplicativo TOTP e escaneie o QR Code. Depois, informe o código gerado.' });
    const qr = document.createElement('img');
    qr.src = qrCode;
    qr.alt = 'QR Code para ativar a autenticação em duas etapas';
    qr.width = 220;
    qr.height = 220;
    qr.style.maxWidth = '100%';
    qr.style.background = '#fff';
    qr.style.padding = '10px';
    qr.style.borderRadius = '12px';

    const secretLabel = element('label', { text: 'Chave manual — guarde em local seguro' });
    const secretField = element('input');
    secretField.type = 'text';
    secretField.readOnly = true;
    secretField.value = secret.slice(0, 200);
    secretField.autocomplete = 'off';
    secretLabel.appendChild(secretField);

    const codeLabel = element('label', { text: 'Código de 6 números' });
    const codeInput = createOtpInput();
    codeInput.id = 'mfaEnrollmentCode';
    codeLabel.appendChild(codeInput);
    const verify = element('button', { className: 'button button-dark', text: 'Confirmar e ativar', type: 'button' });
    verify.id = 'verifyMfaEnrollment';
    verify.addEventListener('click', verifyMfaEnrollment);

    setup.append(instructions, qr, secretLabel, codeLabel, verify);
    setup.hidden = false;
    codeInput.focus();
  } catch {
    showToast('Não foi possível iniciar a configuração do autenticador. Confira se MFA está habilitado no Supabase Auth.');
  } finally {
    button.disabled = false;
  }
}

async function verifyMfaEnrollment() {
  const input = document.querySelector('#mfaEnrollmentCode');
  const button = document.querySelector('#verifyMfaEnrollment');
  if (!input || !button || !enrollmentFactorId) return;
  if (!input.reportValidity()) return;
  button.disabled = true;
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollmentFactorId,
      code: input.value,
    });
    if (error) throw error;
    showToast('Autenticação em duas etapas ativada.');
    location.reload();
  } catch {
    showToast('Código inválido ou expirado. Aguarde o próximo código e tente novamente.');
    input.select();
  } finally {
    button.disabled = false;
  }
}

async function ensureAdminMfa() {
  if (mfaCheckRunning) return;
  mfaCheckRunning = true;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData?.session?.user) {
      removeMfaGate();
      return;
    }

    const [{ data: factorData, error: factorError }, { data: aalData, error: aalError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorError || aalError) throw factorError || aalError;

    const verified = verifiedTotpFactors(factorData);
    if (verified.length && aalData?.currentLevel !== 'aal2') {
      showMfaChallenge(verified[0]);
      return;
    }

    removeMfaGate();
    const card = ensureMfaSettingsCard();
    const status = card?.querySelector('#adminMfaStatus');
    const action = card?.querySelector('#startMfaEnrollment');
    if (verified.length) {
      if (status) status.textContent = 'Ativa. Esta sessão foi confirmada com senha e código temporário.';
      if (action) action.hidden = true;
    } else {
      if (status) status.textContent = 'Ainda não ativada. A produção permanecerá bloqueada até a verificação de um aplicativo autenticador.';
      if (action) action.hidden = false;
    }
  } catch {
    const card = ensureMfaSettingsCard();
    const status = card?.querySelector('#adminMfaStatus');
    if (status) status.textContent = 'Não foi possível verificar o segundo fator agora. Atualize a página antes de fazer alterações administrativas.';
  } finally {
    mfaCheckRunning = false;
  }
}

supabase.auth.onAuthStateChange(() => {
  window.setTimeout(ensureAdminMfa, 100);
});
window.setTimeout(ensureAdminMfa, 300);
window.setTimeout(ensureAdminMfa, 1600);

async function decodeImage(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file);
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível converter a imagem.')), type, quality);
  });
}

async function sanitizeImage(file) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('Use somente imagem JPEG, PNG ou WebP.');
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error('A imagem original deve ter no máximo 10 MB.');

  const source = await decodeImage(file);
  const width = Number(source.width || source.naturalWidth || 0);
  const height = Number(source.height || source.naturalHeight || 0);
  if (!width || !height || width > 12000 || height > 12000 || width * height > 50_000_000) {
    source.close?.();
    throw new Error('A resolução da imagem é inválida ou excessiva.');
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: false });
  if (!context) throw new Error('O navegador não conseguiu processar a imagem.');
  context.drawImage(source, 0, 0, outputWidth, outputHeight);
  source.close?.();

  let blob = await canvasToBlob(canvas, 'image/webp', 0.88);
  if (blob.size > MAX_OUTPUT_BYTES) blob = await canvasToBlob(canvas, 'image/webp', 0.72);
  if (blob.size > MAX_OUTPUT_BYTES) throw new Error('A imagem processada ainda ficou muito grande. Escolha outra foto.');

  const safeName = `${String(file.name || 'produto').replace(/\.[^.]+$/, '').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'produto'}.webp`;
  return new File([blob], safeName, { type: 'image/webp', lastModified: Date.now() });
}

function replaceInputFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
}

document.addEventListener('change', async event => {
  const input = event.target.closest('[data-file-product]');
  if (!input?.files?.[0]) return;
  input.dataset.processing = 'true';
  input.disabled = true;
  try {
    const safeFile = await sanitizeImage(input.files[0]);
    replaceInputFile(input, safeFile);
    input.dataset.sanitized = 'true';
    showToast('Imagem protegida, redimensionada e pronta para envio.');
  } catch (error) {
    input.value = '';
    delete input.dataset.sanitized;
    showToast(error?.message || 'Não foi possível validar a imagem.');
  } finally {
    delete input.dataset.processing;
    input.disabled = false;
  }
}, { capture: true });

document.addEventListener('click', event => {
  const button = event.target.closest('[data-save-product]');
  if (!button) return;
  const input = document.querySelector(`[data-file-product="${CSS.escape(button.dataset.saveProduct || '')}"]`);
  if (input?.dataset.processing === 'true') {
    event.preventDefault();
    event.stopImmediatePropagation();
    showToast('Aguarde o processamento seguro da imagem terminar.');
  }
}, { capture: true });

// Remove tokens antigos que versões anteriores podiam ter deixado no localStorage.
Object.keys(localStorage).forEach(key => {
  if (/supabase.*auth|sb-.*-auth-token|zoryvena\.admin-session/i.test(key)) localStorage.removeItem(key);
});
