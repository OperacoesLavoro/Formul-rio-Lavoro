import { HttpError } from '../utils/http.mjs';

const UPSTREAM = 'https://api-publica.datajud.cnj.jus.br';
const TJS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'dft', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to'];

function falhaConsulta(status, codigo, mensagem, upstreamStatus) {
  // Não registrar chave, headers, corpo, número do processo ou mensagem bruta da exceção.
  console.warn(JSON.stringify({ evento: 'datajud_error', codigo, upstreamStatus }));
  return new HttpError(status, `${mensagem} Referência: ${codigo}.`);
}

export function parseProcesso(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 1 || typeof body.numeroProcesso !== 'string' ||
      !/^\d{20}$/.test(body.numeroProcesso)) {
    throw new HttpError(400, 'Informe numeroProcesso com exatamente 20 dígitos.');
  }
  const numero = body.numeroProcesso;
  const base = numero.slice(0, 7) + numero.slice(9) + '00';
  let remainder = 0;
  for (const digit of base) remainder = (remainder * 10 + Number(digit)) % 97;
  if (Number(numero.slice(7, 9)) !== 98 - remainder) {
    throw new HttpError(400, 'O dígito verificador do processo é inválido. Confira o número.');
  }
  const ramo = numero[13];
  const tribunal = Number(numero.slice(14, 16));
  let alias;
  if (ramo === '5' && tribunal >= 1 && tribunal <= 24) alias = 'trt' + tribunal;
  if (ramo === '4' && tribunal >= 1 && tribunal <= 6) alias = 'trf' + tribunal;
  if (ramo === '8' && TJS[tribunal - 1]) alias = 'tj' + TJS[tribunal - 1];
  if (ramo === '3' && tribunal === 0) alias = 'stj';
  if (!alias) throw new HttpError(422, 'Este tribunal não está disponível nesta consulta.');
  return { numero, alias };
}

export async function consultarProcesso({ numero, alias }, apiKey) {
  if (!apiKey?.trim()) throw new HttpError(503, 'A consulta ao CNJ ainda não foi configurada. Avise o responsável pelo formulário.');
  const key = apiKey.trim();
  if (!/^[\x21-\x7E]+$/.test(key) || /^(?:Authorization:|APIKey\b)/i.test(key)) {
    throw falhaConsulta(503, 'CNJ_CONFIG', 'O formato da credencial do serviço é inválido. Configure somente o valor da chave no Secret.');
  }
  let response;
  let data;
  try {
    response = await fetch(`${UPSTREAM}/api_publica_${alias}/_search`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: 'APIKey ' + key },
      body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: numero } },
        _source: ['grau', 'orgaoJulgador.nome', 'classe.nome', 'assuntos.nome',
          'dataAjuizamento', 'movimentos.grau', 'movimentos.dataHora', 'movimentos.nome'] }),
      signal: AbortSignal.timeout(15000)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw falhaConsulta(504, 'CNJ_TIMEOUT', 'O CNJ demorou para responder. Tente novamente.');
    }
    throw falhaConsulta(502, 'CNJ_CONNECTION', 'O servidor não conseguiu estabelecer a consulta ao CNJ. Avise o responsável pelo formulário.');
  }
  if (response.status >= 300 && response.status < 400) {
    throw falhaConsulta(502, 'CNJ_REDIRECT', 'O CNJ redirecionou a consulta para outro endereço. Avise o responsável pelo formulário.', response.status);
  }
  if (response.status === 401 || response.status === 403) {
    throw falhaConsulta(502, 'CNJ_ACCESS', 'O CNJ recusou o acesso do serviço. É necessário verificar a credencial e eventuais restrições de acesso.', response.status);
  }
  if (response.status === 429) throw falhaConsulta(429, 'CNJ_RATE_LIMIT', 'O CNJ está recebendo muitas consultas. Tente novamente em um minuto.', response.status);
  if (!response.ok) throw falhaConsulta(502, 'CNJ_HTTP', 'O CNJ respondeu com erro. Tente novamente mais tarde.', response.status);
  if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) {
    throw falhaConsulta(502, 'CNJ_FORMAT', 'O serviço do CNJ devolveu uma resposta diferente dos dados esperados. Avise o responsável pelo formulário.', response.status);
  }
  try {
    data = await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw falhaConsulta(504, 'CNJ_TIMEOUT', 'O CNJ demorou para enviar a resposta. Tente novamente.');
    }
    throw falhaConsulta(502, 'CNJ_RESPONSE', 'Não foi possível ler os dados retornados pelo CNJ. Tente novamente mais tarde.', response.status);
  }
  if (!Array.isArray(data?.hits?.hits) ||
      data.hits.hits.some(hit => !hit?._source || typeof hit._source !== 'object' || Array.isArray(hit._source))) {
    throw falhaConsulta(502, 'CNJ_SCHEMA', 'O CNJ retornou dados em formato inesperado. Tente novamente mais tarde.', response.status);
  }
  return { hits: { hits: data.hits.hits.map(hit => ({ _source: hit._source })) } };
}
