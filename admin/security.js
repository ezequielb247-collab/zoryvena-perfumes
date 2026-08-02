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
