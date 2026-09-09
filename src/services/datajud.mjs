import { HttpError } from '../utils/http.mjs';

const UPSTREAM = 'https://api-publica.datajud.cnj.jus.br';
const TJS = ['ac', 'al', 'ap', 'am', 'ba', 'ce', 'dft', 'es', 'go', 'ma', 'mt', 'ms',
  'mg', 'pa', 'pb', 'pr', 'pe', 'pi', 'rj', 'rn', 'rs', 'ro', 'rr', 'sc', 'se', 'sp', 'to'];

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
  let response;
  let data;
  try {
    response = await fetch(`${UPSTREAM}/api_publica_${alias}/_search`, {
      method: 'POST',
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: 'APIKey ' + apiKey.trim() },
      body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: numero } },
        _source: ['grau', 'orgaoJulgador.nome', 'classe.nome', 'assuntos.nome',
          'dataAjuizamento', 'movimentos.grau', 'movimentos.dataHora', 'movimentos.nome'] }),
      signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401 || response.status === 403) {
      throw new HttpError(502, 'O CNJ recusou a credencial do serviço. Avise o responsável pelo formulário.');
    }
    if (response.status === 429) throw new HttpError(429, 'O CNJ está recebendo muitas consultas. Tente novamente em um minuto.');
    if (!response.ok) throw new HttpError(502, 'O CNJ está indisponível no momento. Tente novamente mais tarde.');
    data = await response.json();
  } catch (error) {
    if (error instanceof HttpError) throw error;
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw new HttpError(504, 'O CNJ demorou para responder. Tente novamente.');
    }
    throw new HttpError(502, 'Não foi possível consultar o CNJ. Tente novamente mais tarde.');
  }
  if (!Array.isArray(data?.hits?.hits) ||
      data.hits.hits.some(hit => !hit?._source || typeof hit._source !== 'object' || Array.isArray(hit._source))) {
    throw new HttpError(502, 'O CNJ retornou uma resposta inesperada. Tente novamente mais tarde.');
  }
  return { hits: { hits: data.hits.hits.map(hit => ({ _source: hit._source })) } };
}
