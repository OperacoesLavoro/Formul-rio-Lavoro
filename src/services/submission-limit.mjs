import { HttpError } from '../utils/http.mjs';

export const LIMITE_ENVIOS_POR_DIA = 30;
const FUSO_LIMITE = 'America/Sao_Paulo';
const FORMATO_DIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSO_LIMITE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
const FORMATO_HORA = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_LIMITE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function partes(formatador, data) {
  return Object.fromEntries(
    formatador.formatToParts(data)
      .filter(parte => parte.type !== 'literal')
      .map(parte => [parte.type, parte.value])
  );
}

export function periodoDiario(agora = new Date()) {
  const data = partes(FORMATO_DIA, agora);
  const hora = partes(FORMATO_HORA, agora);
  const segundosDecorridos = Number(hora.hour) * 3600 + Number(hora.minute) * 60 + Number(hora.second);
  return {
    dia: `${data.year}-${data.month}-${data.day}`,
    retryAfter: Math.max(60, 86400 - segundosDecorridos)
  };
}

async function identificadorDoIp(ip, salt) {
  const bytes = new TextEncoder().encode(`${salt}\0${ip}`);
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(resumo, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function consumirLimiteDiario(request, env, agora = new Date()) {
  if (!env.ENVIO_DIARIO_LIMITER || !env.RATE_LIMIT_SALT?.trim()) {
    throw new HttpError(503, 'O controle de envios ainda não foi configurado.');
  }
  const ip = request.headers.get('CF-Connecting-IP')?.trim();
  if (!ip) throw new HttpError(400, 'Não foi possível identificar a origem do envio.');

  const periodo = periodoDiario(agora);
  const chave = await identificadorDoIp(ip, env.RATE_LIMIT_SALT.trim());
  const id = env.ENVIO_DIARIO_LIMITER.idFromName(chave);
  const stub = env.ENVIO_DIARIO_LIMITER.get(id);

  let response;
  try {
    response = await stub.fetch('https://limite-interno/consumir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(periodo)
    });
  } catch {
    throw new HttpError(503, 'Não foi possível verificar o limite diário de envios. Tente novamente.');
  }
  if (!response.ok) throw new HttpError(503, 'Não foi possível verificar o limite diário de envios. Tente novamente.');

  let resultado;
  try { resultado = await response.json(); }
  catch { throw new HttpError(503, 'Não foi possível verificar o limite diário de envios. Tente novamente.'); }
  if (typeof resultado?.permitido !== 'boolean') {
    throw new HttpError(503, 'Não foi possível verificar o limite diário de envios. Tente novamente.');
  }
  return { ...resultado, retryAfter: periodo.retryAfter };
}

/* Um objeto por hash de IP serializa as atualizações e mantém o teto exato,
   inclusive quando chegam requisições simultâneas. */
export class LimiteEnvioDiario {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(request) {
    if (request.method !== 'POST') return new Response('Método não permitido.', { status: 405 });
    let entrada;
    try { entrada = await request.json(); } catch { return new Response('Entrada inválida.', { status: 400 }); }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada?.dia || '')) {
      return new Response('Entrada inválida.', { status: 400 });
    }

    const resultado = await this.ctx.storage.transaction(async storage => {
      const anterior = await storage.get('uso');
      const usados = anterior?.dia === entrada.dia ? Number(anterior.quantidade) || 0 : 0;
      if (usados >= LIMITE_ENVIOS_POR_DIA) {
        return { permitido: false, restantes: 0 };
      }
      const quantidade = usados + 1;
      await storage.put('uso', { dia: entrada.dia, quantidade });
      return { permitido: true, restantes: LIMITE_ENVIOS_POR_DIA - quantidade };
    });

    if (resultado.permitido && typeof this.ctx.storage.setAlarm === 'function') {
      const retryAfter = Math.max(60, Number(entrada.retryAfter) || 86400);
      await this.ctx.storage.setAlarm(Date.now() + (retryAfter + 3600) * 1000);
    }
    return Response.json(resultado, { headers: { 'Cache-Control': 'no-store' } });
  }

  async alarm() {
    await this.ctx.storage.deleteAll();
  }
}
