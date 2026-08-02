import { supabase } from '../assets/js/supabase.js';

const ADMIN_EMAIL = 'zoryvenaperfumes@gmail.com';
let enrollment = null;
let checking = false;

function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function removeGate() {
  document.querySelector('#adminMfaEnrollmentGate')?.remove();
}

function feedback(message, isError = false) {
  const element = document.querySelector('#adminMfaEnrollmentFeedback');
  if (!element) return;
  element.hidden = false;
  element.textContent = message;
  element.style.color = isError ? 'var(--admin-red)' : 'var(--admin-green)';
}

function buildGate() {
  removeGate();
  document.querySelector('#adminLogin')?.setAttribute('hidden', '');
  document.querySelector('#adminPanel')?.setAttribute('hidden', '');

  const gate = node('section', '', 'admin-login');
  gate.id = 'adminMfaEnrollmentGate';
  gate.setAttribute('aria-labelledby', 'adminMfaEnrollmentTitle');

  const brand = node('div', '', 'brand');
  const logo = document.createElement('img');
  logo.className = 'admin-brand-image';
  logo.src = '/assets/branding/logo-square-clean.png';
  logo.alt = 'Logo Zoryvena Perfumes';
  brand.appendChild(logo);

  const title = node('h1', 'Proteja o painel com duas etapas');
  title.id = 'adminMfaEnrollmentTitle';
  const description = node('p', 'Antes do primeiro acesso, vincule um aplicativo autenticador. Depois da ativação, senha sozinha não libera pedidos, clientes, estoque ou configurações.');

  const start = node('button', 'Gerar QR Code seguro', 'button button-dark');
  start.type = 'button';
  start.id = 'beginMandatoryMfa';

  const setup = node('div', '', 'admin-form');
  setup.id = 'mandatoryMfaSetup';
  setup.hidden = true;

  const logout = node('button', 'Cancelar e sair', 'button button-outline');
  logout.type = 'button';
  logout.addEventListener('click', async () => {
    await supabase.auth.signOut();
    location.replace('/admin/');
  });

  const result = node('p');
  result.id = 'adminMfaEnrollmentFeedback';
  result.hidden = true;

  gate.append(brand, title, description, start, setup, result, logout);
  document.body.appendChild(gate);
  start.focus();

  start.addEventListener('click', beginEnrollment);
}

function otpInput() {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.pattern = '[0-9]{6}';
  input.minLength = 6;
  input.maxLength = 6;
  input.required = true;
  input.placeholder = '000000';
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
  });
  return input;
}

async function removeUnverifiedFactors() {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  const factors = Array.isArray(data?.all) ? data.all : Array.isArray(data?.totp) ? data.totp : [];
  for (const factor of factors) {
    if (factor.status === 'verified') continue;
    try { await supabase.auth.mfa.unenroll({ factorId: factor.id }); } catch { /* novo cadastro substituirá a tentativa */ }
  }
}

async function beginEnrollment() {
  const button = document.querySelector('#beginMandatoryMfa');
  const setup = document.querySelector('#mandatoryMfaSetup');
  if (!button || !setup) return;
  button.disabled = true;
  button.textContent = 'Gerando…';
  feedback('', false);

  try {
    await removeUnverifiedFactors();
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Zoryvena Admin Principal',
    });
    if (error) throw error;
    if (!data?.id || !String(data?.totp?.qr_code || '').startsWith('data:image/')) throw new Error('QR Code indisponível.');
    enrollment = data;

    const instructions = node('p', 'Leia o QR Code com Google Authenticator, Microsoft Authenticator, 2FAS ou outro aplicativo TOTP. Guarde a chave manual em local seguro e separado do computador.');
    const qr = document.createElement('img');
    qr.src = data.totp.qr_code;
    qr.alt = 'QR Code para configurar a autenticação em duas etapas';
    qr.width = 220;
    qr.height = 220;
    qr.style.maxWidth = '100%';
    qr.style.background = '#fff';
    qr.style.padding = '10px';
    qr.style.borderRadius = '12px';

    const secretLabel = node('label', 'Chave manual');
    const secret = document.createElement('input');
    secret.type = 'text';
    secret.readOnly = true;
    secret.autocomplete = 'off';
    secret.value = String(data.totp.secret || '').slice(0, 200);
    secretLabel.appendChild(secret);

    const codeLabel = node('label', 'Código de 6 números');
    const code = otpInput();
    code.id = 'mandatoryMfaCode';
    codeLabel.appendChild(code);

    const verify = node('button', 'Confirmar e proteger o painel', 'button button-dark');
    verify.type = 'button';
    verify.id = 'verifyMandatoryMfa';
    verify.addEventListener('click', verifyEnrollment);

    setup.replaceChildren(instructions, qr, secretLabel, codeLabel, verify);
    setup.hidden = false;
    button.hidden = true;
    code.focus();
  } catch (error) {
    feedback(error?.message || 'Não foi possível iniciar a configuração.', true);
    button.disabled = false;
    button.textContent = 'Gerar QR Code seguro';
  }
}

async function verifyEnrollment() {
  const input = document.querySelector('#mandatoryMfaCode');
  const button = document.querySelector('#verifyMandatoryMfa');
  if (!input || !button || !enrollment?.id) return;
  if (!input.reportValidity()) return;

  button.disabled = true;
  button.textContent = 'Verificando…';
  try {
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.id,
      code: input.value,
    });
    if (error) throw error;
    feedback('Proteção ativada. Abrindo o painel…');
    setTimeout(() => location.reload(), 500);
  } catch {
    feedback('Código inválido ou expirado. Aguarde o próximo código e tente novamente.', true);
    input.select();
    button.disabled = false;
    button.textContent = 'Confirmar e proteger o painel';
  }
}

async function checkMandatoryMfa() {
  if (checking) return;
  checking = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      removeGate();
      return;
    }

    if (String(session.user.email || '').toLowerCase() !== ADMIN_EMAIL) {
      await supabase.auth.signOut();
      location.replace('/admin/');
      return;
    }

    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factors = Array.isArray(data?.totp) ? data.totp : Array.isArray(data?.all) ? data.all : [];
    const verified = factors.some(factor => factor?.factor_type === 'totp' && factor?.status === 'verified');
    if (!verified) buildGate();
    else removeGate();
  } catch {
    buildGate();
    feedback('Não foi possível confirmar a proteção da conta. Saia e tente novamente.', true);
  } finally {
    checking = false;
  }
}

supabase.auth.onAuthStateChange(() => setTimeout(checkMandatoryMfa, 80));
setTimeout(checkMandatoryMfa, 250);
setTimeout(checkMandatoryMfa, 1200);
