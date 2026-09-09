import { consultarProcesso, parseProcesso } from './services/datajud.mjs';
import { HttpError, json, readJson } from './utils/http.mjs';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      // Verificação de origem reduz chamadas entre sites; não substitui login.
      const origin = request.headers.get('Origin');
      if ((origin && origin !== url.origin) || request.headers.get('Sec-Fetch-Site') === 'cross-site') {
        throw new HttpError(403, 'Origem não autorizada.');
      }
      if (url.pathname === '/api/status' && request.method === 'GET') {
        return json({ service: 'datajud', configured: Boolean(env.DATAJUD_APIKEY?.trim()) });
      }
      if (url.pathname !== '/api/datajud') throw new HttpError(404, 'Rota não encontrada.');
      if (request.method !== 'POST') return json({ erro: 'Use POST.' }, 405, { Allow: 'POST' });
      if (!env.DATAJUD_RATE_LIMITER) throw new HttpError(503, 'O serviço de consulta ainda não foi configurado.');
      // Limite agregado por IP: pessoas na mesma rede compartilham o limite.
      const { success } = await env.DATAJUD_RATE_LIMITER.limit({
        key: 'datajud:' + (request.headers.get('CF-Connecting-IP') || 'local')
      });
      if (!success) return json({ erro: 'Muitas consultas. Aguarde um minuto e tente novamente.' }, 429, { 'Retry-After': '60' });
      const processo = parseProcesso(await readJson(request));
      return json(await consultarProcesso(processo, env.DATAJUD_APIKEY));
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ erro: error instanceof HttpError ? error.message : 'Não foi possível concluir a consulta.' }, status,
        status === 429 ? { 'Retry-After': '60' } : {});
    }
  }
};
