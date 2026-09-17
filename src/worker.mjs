import { consultarProcesso, parseProcesso } from './services/datajud.mjs';
import { encaminharProposta } from './services/hub.mjs';
import { consumirLimiteDiario, LIMITE_ENVIOS_POR_DIA } from './services/submission-limit.mjs';
import { HttpError, json, readJson } from './utils/http.mjs';

export { LimiteEnvioDiario } from './services/submission-limit.mjs';

// Limite agregado por IP: pessoas na mesma rede compartilham o limite.
// O escopo separa as contagens de consulta e de envio no mesmo limitador.
async function dentroDoLimite(request, env, escopo) {
  try {
    const { success } = await env.DATAJUD_RATE_LIMITER.limit({
      key: escopo + ':' + (request.headers.get('CF-Connecting-IP') || 'local')
    });
    return success;
  } catch {
    throw new HttpError(503, 'O controle de requisições está temporariamente indisponível. Tente novamente.');
  }
}

function servirSite(request, env, url) {
  const pagina = request.method === 'GET' || request.method === 'HEAD';
  if (pagina && ['/', '/index.html', '/judicial/'].includes(url.pathname)) {
    const destino = new URL(url);
    destino.pathname = '/judicial';
    return new Response(null, {
      status: 302,
      headers: { Location: destino.toString(), 'Cache-Control': 'no-store' }
    });
  }
  if (pagina && url.pathname === '/judicial') {
    const index = new URL(url);
    index.pathname = '/';
    return env.ASSETS.fetch(new Request(index, request));
  }
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return servirSite(request, env, url);
    try {
      // Verificação de origem reduz chamadas entre sites; não substitui login.
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
        throw new HttpError(403, 'Origem não autorizada.');
      }
      if (url.pathname === '/api/status' && request.method === 'GET') {
        return json({ service: 'datajud', configured: Boolean(env.DATAJUD_APIKEY?.trim()) });
      }
      if (url.pathname === '/api/garantia-judicial/submit') {
        if (request.method !== 'POST') return json({ erro: 'Use POST.' }, 405, { Allow: 'POST' });
        if (!env.DATAJUD_RATE_LIMITER) throw new HttpError(503, 'O serviço de envio ainda não foi configurado.');
        if (!await dentroDoLimite(request, env, 'envio')) {
          return json({ erro: 'Muitos envios. Aguarde um minuto e tente novamente.' }, 429, { 'Retry-After': '60' });
        }
        const limiteDiario = await consumirLimiteDiario(request, env);
        if (!limiteDiario.permitido) {
          return json({
            codigo: 'ENVIO_LIMITE_DIARIO',
            limite: LIMITE_ENVIOS_POR_DIA,
            erro: `Você atingiu o limite máximo de ${LIMITE_ENVIOS_POR_DIA} envios por dia para esta rede. Tente novamente amanhã.`
          }, 429, { 'Retry-After': String(limiteDiario.retryAfter) });
        }
        // O token do Hub existe apenas aqui; nada dele chega ao navegador.
        return json(await encaminharProposta(request, env));
      }
      if (url.pathname !== '/api/datajud') throw new HttpError(404, 'Rota não encontrada.');
      if (request.method !== 'POST') return json({ erro: 'Use POST.' }, 405, { Allow: 'POST' });
      if (!env.DATAJUD_RATE_LIMITER) throw new HttpError(503, 'O serviço de consulta ainda não foi configurado.');
      if (!await dentroDoLimite(request, env, 'datajud')) {
        return json({ erro: 'Muitas consultas. Aguarde um minuto e tente novamente.' }, 429, { 'Retry-After': '60' });
      }
      const processo = parseProcesso(await readJson(request));
      return json(await consultarProcesso(processo, env.DATAJUD_APIKEY));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      if (!(error instanceof HttpError)) {
        console.error(JSON.stringify({ evento: 'worker_error', rota: url.pathname }));
      }
      const mensagemInterna = url.pathname === '/api/garantia-judicial/submit'
        ? 'Não foi possível concluir o envio.'
        : 'Não foi possível concluir a consulta.';
      return json({ erro: error instanceof HttpError ? error.message : mensagemInterna }, status,
        status === 429 ? { 'Retry-After': '60' } : {});
    }
  }
};
