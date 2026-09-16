import { HttpError } from '../utils/http.mjs';

/* O PDF é uma captura em imagem da folha inteira: passa de 1 MB com facilidade.
   Os tetos abaixo são folgados para o uso real e fecham a porta para abuso. */
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 1024 * 1024;
const MAX_CORPO_BYTES = MAX_PDF_BYTES + MAX_PAYLOAD_BYTES + 64 * 1024;
/* O Hub só precisa confirmar que recebeu e persistiu; consulta de mercado é
   assíncrona do lado dele e não pode prender esta requisição. */
const TIMEOUT_MS = 30000;
const ASSINATURA_PDF = '%PDF-';

function falhaEnvio(status, codigo, mensagem, upstreamStatus) {
  // Não registrar token, payload, PDF, nome de arquivo ou mensagem bruta da exceção.
  console.warn(JSON.stringify({ evento: 'hub_error', codigo, upstreamStatus }));
  return new HttpError(status, `${mensagem} Referência: ${codigo}.`);
}

/* Configuração obrigatória, só no servidor. Falta ou formato errado param o
   envio antes de qualquer chamada externa. */
function lerConfiguracao(env) {
  const destino = env.HUB_SUBMIT_URL?.trim();
  const token = env.HUB_WEBHOOK_SECRET?.trim();
  const invalida = () => falhaEnvio(503, 'HUB_CONFIG',
    'O envio da proposta ainda não foi configurado. Avise o responsável pelo formulário.');
  if (!destino || !token) throw invalida();
  let url;
  try { url = new URL(destino); } catch { throw invalida(); }
  if (url.protocol !== 'https:') throw invalida();
  // Mesma convenção do DATAJUD_APIKEY: no Secret vai só o valor, sem prefixo.
  if (!/^[\x21-\x7E]+$/.test(token) || /^Bearer\b/i.test(token)) throw invalida();
  return { destino: url.toString(), token };
}

/* Nome de arquivo vem do navegador: serve só de rótulo no multipart. */
function nomeSeguro(nome) {
  const limpo = String(nome || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  return /\.pdf$/i.test(limpo) ? limpo : 'proposta-garantia.pdf';
}

async function lerEnvio(request) {
  const tipo = request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase();
  if (tipo !== 'multipart/form-data') throw new HttpError(415, 'Envie a proposta em multipart/form-data.');
  const declarado = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(declarado) && declarado > MAX_CORPO_BYTES) throw new HttpError(413, 'Proposta grande demais.');

  let form;
  try { form = await request.formData(); }
  catch { throw new HttpError(400, 'Não foi possível ler os dados enviados.'); }

  const payload = form.get('payload');
  if (typeof payload !== 'string' || !payload.trim()) throw new HttpError(400, 'Os dados do formulário não foram enviados.');
  if (payload.length > MAX_PAYLOAD_BYTES) throw new HttpError(413, 'Os dados do formulário são grandes demais.');
  let dados;
  try { dados = JSON.parse(payload); } catch { throw new HttpError(400, 'Os dados do formulário chegaram em formato inválido.'); }
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
    throw new HttpError(400, 'Os dados do formulário chegaram em formato inválido.');
  }

  const arquivo = form.get('pdf');
  if (typeof arquivo === 'string' || !arquivo || typeof arquivo.arrayBuffer !== 'function') {
    throw new HttpError(400, 'O PDF da proposta não foi enviado.');
  }
  if (arquivo.size > MAX_PDF_BYTES) throw new HttpError(413, 'O PDF da proposta é grande demais.');
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  if (bytes.byteLength === 0) throw new HttpError(400, 'O PDF da proposta não foi enviado.');
  if (bytes.byteLength > MAX_PDF_BYTES) throw new HttpError(413, 'O PDF da proposta é grande demais.');
  // Confere a assinatura do formato em vez de confiar no Content-Type do navegador.
  if (String.fromCharCode(...bytes.slice(0, ASSINATURA_PDF.length)) !== ASSINATURA_PDF) {
    throw new HttpError(400, 'O arquivo enviado não é um PDF.');
  }

  return { payload, pdf: new Blob([bytes], { type: 'application/pdf' }), nome: nomeSeguro(arquivo.name) };
}

/* Referência devolvida pelo Hub, quando houver. Só um identificador curto é
   repassado ao navegador; o resto da resposta é ignorado de propósito. */
async function referenciaDoHub(response) {
  try {
    if (!response.headers.get('Content-Type')?.toLowerCase().includes('application/json')) return '';
    const corpo = await response.json();
    const bruto = corpo?.id ?? corpo?.protocolo ?? corpo?.referencia ?? '';
    return typeof bruto === 'string' || typeof bruto === 'number' ? String(bruto).slice(0, 120) : '';
  } catch { return ''; }
}

export async function encaminharProposta(request, env) {
  const { destino, token } = lerConfiguracao(env);
  const envio = await lerEnvio(request);

  const corpo = new FormData();
  corpo.append('payload', envio.payload);
  corpo.append('pdf', envio.pdf, envio.nome);

  let response;
  try {
    response = await fetch(destino, {
      method: 'POST',
      redirect: 'manual',
      /* Sem Content-Type à mão: o runtime monta o multipart com o boundary. */
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      throw falhaEnvio(504, 'HUB_TIMEOUT', 'O sistema que recebe a proposta demorou para confirmar. Tente novamente em instantes.');
    }
    throw falhaEnvio(502, 'HUB_CONNECTION', 'Não foi possível falar com o sistema que recebe a proposta. Tente novamente em instantes.');
  }

  if (response.status >= 300 && response.status < 400) {
    throw falhaEnvio(502, 'HUB_REDIRECT', 'O sistema que recebe a proposta redirecionou o envio. Avise o responsável pelo formulário.', response.status);
  }
  if (response.status === 401 || response.status === 403) {
    throw falhaEnvio(502, 'HUB_AUTH', 'O sistema que recebe a proposta recusou o acesso deste formulário. Avise o responsável pelo formulário.', response.status);
  }
  if (response.status === 429) {
    throw falhaEnvio(429, 'HUB_RATE_LIMIT', 'O sistema que recebe a proposta está ocupado. Tente novamente em um minuto.', response.status);
  }
  if (response.status >= 500) {
    throw falhaEnvio(502, 'HUB_UPSTREAM', 'O sistema que recebe a proposta respondeu com erro. Tente novamente mais tarde.', response.status);
  }
  // Qualquer 2xx confirma o recebimento: 200, 201 e 202 valem igual.
  if (!response.ok) {
    throw falhaEnvio(502, 'HUB_REJECTED', 'O sistema que recebe a proposta não aceitou o envio. Avise o responsável pelo formulário.', response.status);
  }

  const referencia = await referenciaDoHub(response);
  return referencia ? { recebido: true, referencia } : { recebido: true };
}
