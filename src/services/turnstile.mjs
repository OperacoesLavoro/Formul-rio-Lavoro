import { HttpError } from '../utils/http.mjs';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 8000;
const ACAO_ESPERADA = 'garantia_judicial_submit';

export function turnstileHabilitado(env) {
  return String(env.TURNSTILE_ENABLED ?? 'true').toLowerCase() !== 'false';
}

export function configuracaoTurnstilePublica(env) {
  if (!turnstileHabilitado(env)) return { enabled: false };
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  return siteKey ? { enabled: true, siteKey } : { enabled: true, configured: false };
}

function erroConfiguracao() {
  return new HttpError(503, 'A proteção de segurança do formulário ainda não foi configurada. Avise o responsável.');
}

export async function validarTurnstile(token, request, env) {
  if (!turnstileHabilitado(env)) return;

  const secret = env.TURNSTILE_SECRET?.trim();
  const siteKey = env.TURNSTILE_SITE_KEY?.trim();
  if (!secret || !siteKey) throw erroConfiguracao();
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) {
    throw new HttpError(403, 'Confirme a verificação de segurança antes de enviar.');
  }

  const corpo = new URLSearchParams({ secret, response: token.trim() });
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (ip) corpo.set('remoteip', ip);

  let response;
  try {
    response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch {
    throw new HttpError(503, 'Não foi possível concluir a verificação de segurança. Tente novamente em instantes.');
  }
  if (!response.ok) {
    throw new HttpError(503, 'Não foi possível concluir a verificação de segurança. Tente novamente em instantes.');
  }

  let resultado;
  try { resultado = await response.json(); }
  catch { throw new HttpError(503, 'A verificação de segurança devolveu uma resposta inesperada. Tente novamente.'); }

  if (!resultado?.success || (resultado.action && resultado.action !== ACAO_ESPERADA)) {
    throw new HttpError(403, 'A verificação de segurança expirou ou não foi aceita. Faça a verificação novamente.');
  }

  const hostnamePermitido = env.TURNSTILE_ALLOWED_HOSTNAME?.trim();
  if (hostnamePermitido && resultado.hostname !== hostnamePermitido) {
    throw new HttpError(403, 'A verificação de segurança não pertence a este formulário.');
  }
}
