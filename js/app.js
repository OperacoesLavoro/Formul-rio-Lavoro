/* ═══════════════════════════════════════════════════════════════
   Formulário Seguro Garantia — Lavoro Seguros
   Assinatura e PDF processados localmente no navegador.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

let assinatura = null;
let protocoloAtual = '';
let pdfAtual = null;
let propostaAtual = null;
let turnstileToken = '';
let turnstileSiteKey = '';
let turnstileWidgetId = null;
let turnstileObrigatorio = true;
let turnstileConfigurado = false;
/* Preenchido pela Tela 1 (gate de identificação), antes de liberar o
   formulário. Segue dentro de coletar().responsavel — ver bloco 13. */
let responsavel = null;

/* ───────────────────────────────────────────────────────────────
   1 · TABELA DE DEPÓSITO RECURSAL
   Atualize somente este bloco quando o TST publicar o novo ATO.
   ─────────────────────────────────────────────────────────────── */

const DEPOSITO_RECURSAL = {
  fonte: {
    ato: 'Ato SEGJUD.GP nº 381, de 16 de julho de 2026',
    vigencia: '1º de agosto de 2026',
    url: 'https://juslaboris.tst.jus.br/bitstream/handle/20.500.12178/267666/2026_ato0381.pdf',
    confirmado: true
  },
  /* valor: em reais. null = depende de outro recurso. 0 = não se exige depósito. */
  recursos: [
    { id: 'ro',  nome: 'Recurso Ordinário',          valor: 14411.57, base: 'art. 1º, a' },
    { id: 'rr',  nome: 'Recurso de Revista',         valor: 28823.14, base: 'art. 1º, b' },
    { id: 'emb', nome: 'Embargos',                   valor: 28823.14, base: 'art. 1º, b' },
    { id: 'ar',  nome: 'Recurso em Ação Rescisória', valor: 28823.14, base: 'art. 1º, c' },
    { id: 'ai',  nome: 'Agravo de Instrumento',      valor: null, derivado: true,
      nota: 'Metade do depósito do recurso que se pretende destrancar (CLT, art. 899, § 7º).' },
    { id: 're',  nome: 'Recurso Extraordinário',     valor: 0,
      nota: 'Depósito recursal não exigido — STF, RE 607.447 (Tema 679).' }
  ]
};

/* Reduções e isenções do art. 899 da CLT e da Súmula 86 do TST */
const ENQUADRAMENTO = {
  integral: { fator: 1,   rotulo: 'Integral — 100%' },
  meio:     { fator: 0.5, rotulo: 'Metade — CLT, art. 899, § 9º' },
  isento10: { fator: 0,   rotulo: 'Isento — CLT, art. 899, § 10' },
  isento86: { fator: 0,   rotulo: 'Isento — Súmula 86 do TST' }
};

/* ───────────────────────────────────────────────────────────────
   2 · TABELAS DE APOIO
   ─────────────────────────────────────────────────────────────── */

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
             'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SE','SP','TO'];

/* Ramos da Justiça — 5º campo do número CNJ (Res. CNJ 65/2008) */
const SEGMENTOS = {
  '1': 'Supremo Tribunal Federal',
  '2': 'Conselho Nacional de Justiça',
  '3': 'Superior Tribunal de Justiça',
  '4': 'Justiça Federal',
  '5': 'Justiça do Trabalho',
  '6': 'Justiça Eleitoral',
  '7': 'Justiça Militar da União',
  '8': 'Justiça Estadual',
  '9': 'Justiça Militar Estadual'
};

/* Regiões da Justiça do Trabalho — 6º campo quando o ramo é 5 */
const TRTS = {
  '01': 'Rio de Janeiro',        '02': 'São Paulo (capital)',
  '03': 'Minas Gerais',          '04': 'Rio Grande do Sul',
  '05': 'Bahia',                 '06': 'Pernambuco',
  '07': 'Ceará',                 '08': 'Pará e Amapá',
  '09': 'Paraná',                '10': 'Distrito Federal e Tocantins',
  '11': 'Amazonas e Roraima',    '12': 'Santa Catarina',
  '13': 'Paraíba',               '14': 'Rondônia e Acre',
  '15': 'Campinas e interior de São Paulo',
  '16': 'Maranhão',              '17': 'Espírito Santo',
  '18': 'Goiás',                 '19': 'Alagoas',
  '20': 'Sergipe',               '21': 'Rio Grande do Norte',
  '22': 'Piauí',                 '23': 'Mato Grosso',
  '24': 'Mato Grosso do Sul'
};

/* Justiça Estadual — 6º campo em ordem alfabética de UF */
const TJS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
             'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SE','SP','TO'];

/* Justiça Federal — 6º campo */
const TRFS = { '01':'TRF 1ª Região', '02':'TRF 2ª Região', '03':'TRF 3ª Região',
               '04':'TRF 4ª Região', '05':'TRF 5ª Região', '06':'TRF 6ª Região' };

/* Natureza da ação sugerida pelo ramo da Justiça */
const NATUREZA_POR_SEGMENTO = { '5': 'trabalhista', '8': 'civel', '4': 'civel' };

/* ───────────────────────────────────────────────────────────────
   3 · UTILITÁRIOS
   ─────────────────────────────────────────────────────────────── */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const digits = (s) => (s || '').replace(/\D/g, '');

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2
});

const money = (cents) => BRL.format((cents || 0) / 100);

function setHint(el, text, state) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'hint' + (state ? ' is-' + state : '');
}

function maskCpf(v) {
  const d = digits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
}

function maskCnpj(v) {
  const d = digits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function atualizarBotaoEnvio() {
  const botao = $('#btnEnviar');
  const confirmacao = $('#confirmCheck');
  const ciencia = $('#cienciaPrazoCheck');
  if (!botao || !confirmacao || !ciencia) return;
  botao.disabled = !confirmacao.checked || !ciencia.checked ||
    (turnstileObrigatorio && !turnstileToken);
}

function informarTurnstile(texto, estado) {
  setHint($('#turnstileStatus'), texto, estado);
}

function renderizarTurnstile() {
  const alvo = $('#turnstileWidget');
  if (!alvo || alvo.closest('[hidden]')) return;
  if (!turnstileObrigatorio) {
    alvo.hidden = true;
    informarTurnstile('');
    atualizarBotaoEnvio();
    return;
  }
  alvo.hidden = false;
  if (!turnstileConfigurado || !turnstileSiteKey) {
    informarTurnstile('A proteção de segurança ainda não foi configurada. Avise o responsável pelo formulário.', 'error');
    atualizarBotaoEnvio();
    return;
  }
  if (!globalThis.turnstile) {
    informarTurnstile('Carregando a verificação de segurança…', 'load');
    return;
  }
  if (turnstileWidgetId !== null) return;

  try {
    turnstileWidgetId = globalThis.turnstile.render(alvo, {
      sitekey: turnstileSiteKey,
      action: 'garantia_judicial_submit',
      theme: 'light',
      callback(token) {
        turnstileToken = token;
        informarTurnstile('Verificação de segurança concluída.', 'ok');
        atualizarBotaoEnvio();
      },
      'expired-callback'() {
        turnstileToken = '';
        informarTurnstile('A verificação expirou. Confirme novamente para enviar.', 'warn');
        atualizarBotaoEnvio();
      },
      'error-callback'() {
        turnstileToken = '';
        informarTurnstile('Não foi possível concluir a verificação. Tente novamente.', 'error');
        atualizarBotaoEnvio();
      }
    });
    informarTurnstile('Conclua a verificação de segurança para enviar.', 'load');
  } catch {
    informarTurnstile('Não foi possível iniciar a verificação de segurança. Recarregue a página.', 'error');
  }
}

function reiniciarTurnstile() {
  turnstileToken = '';
  if (turnstileWidgetId !== null && globalThis.turnstile) {
    try { globalThis.turnstile.reset(turnstileWidgetId); } catch { /* o callback de erro orienta o usuário */ }
  }
  atualizarBotaoEnvio();
}

async function configurarTurnstile() {
  try {
    const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    const dados = await response.json();
    if (!response.ok || !dados?.turnstile) throw new Error('configuração indisponível');
    turnstileObrigatorio = dados.turnstile.enabled !== false;
    turnstileSiteKey = dados.turnstile.siteKey || '';
    turnstileConfigurado = !turnstileObrigatorio || Boolean(turnstileSiteKey);
  } catch {
    turnstileObrigatorio = true;
    turnstileConfigurado = false;
  }
  renderizarTurnstile();
  atualizarBotaoEnvio();
}

globalThis.onTurnstileLoad = renderizarTurnstile;

function digitoCnpj(base, pesos) {
  const soma = pesos.reduce((total, peso, indice) => total + Number(base[indice]) * peso, 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

function cnpjValido(valor) {
  const cnpj = digits(valor);
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const primeiro = digitoCnpj(cnpj, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const segundo = digitoCnpj(cnpj, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return Number(cnpj[12]) === primeiro && Number(cnpj[13]) === segundo;
}

function cpfValido(valor) {
  const cpf = digits(valor);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calcular = tamanho => {
    let soma = 0;
    for (let indice = 0; indice < tamanho; indice += 1) soma += Number(cpf[indice]) * (tamanho + 1 - indice);
    const digito = 11 - (soma % 11);
    return digito >= 10 ? 0 : digito;
  };
  return Number(cpf[9]) === calcular(9) && Number(cpf[10]) === calcular(10);
}

function cnpjsPartesIguais(tipoAutor, documentoAutor, documentoReu) {
  const autor = digits(documentoAutor);
  const reu = digits(documentoReu);
  return tipoAutor === 'PJ' && autor.length === 14 && reu.length === 14 && autor === reu;
}

/* (00) 0000-0000 ou (00) 00000-0000 — cresce para celular a partir do 11º dígito */
function maskTelefone(v) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.replace(/^(\d*)$/, '($1');
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  if (d.length <= 10) return `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4)}`;
  return `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5)}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* 0000000-00.0000.0.00.0000 */
function maskCnj(v) {
  const d = digits(v).slice(0, 20);
  let out = d.slice(0, 7);
  if (d.length > 7)  out += '-' + d.slice(7, 9);
  if (d.length > 9)  out += '.' + d.slice(9, 13);
  if (d.length > 13) out += '.' + d.slice(13, 14);
  if (d.length > 14) out += '.' + d.slice(14, 16);
  if (d.length > 16) out += '.' + d.slice(16, 20);
  return out;
}

function isoDaDataBr(valor) {
  const d = digits(valor);
  if (d.length !== 8) return '';

  const dia = Number(d.slice(0, 2));
  const mes = Number(d.slice(2, 4));
  const ano = Number(d.slice(4, 8));
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  if (data.getUTCFullYear() !== ano || data.getUTCMonth() !== mes - 1 || data.getUTCDate() !== dia) return '';
  return `${String(ano).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

function dataBrDaIso(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function mascararDataBr(campo) {
  const valor = campo.value;
  const d = digits(valor).slice(0, 8);
  campo.value = d
    .replace(/^(\d{2})(\d)/, '$1/$2')
    .replace(/^(\d{2})\/(\d{2})(\d)/, '$1/$2/$3');
  campo.dataset.iso = isoDaDataBr(campo.value);
  campo.setCustomValidity(campo.value && !campo.dataset.iso ? 'Informe uma data vÃ¡lida.' : '');
  return campo.dataset.iso;
}

function isoDoCampoData(id) {
  const campo = $('#' + id);
  const valor = campo?.value || '';
  return campo?.dataset?.iso || (/^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : isoDaDataBr(valor));
}

/* ───────────────────────────────────────────────────────────────
   4 · DECODIFICADOR DO NÚMERO CNJ
   NNNNNNN-DD.AAAA.J.TR.OOOO — cada campo carrega um dado.
   ─────────────────────────────────────────────────────────────── */

function parseCnj(raw) {
  const d = digits(raw);
  return {
    completo:   d.length === 20,
    sequencial: d.slice(0, 7),
    digito:     d.slice(7, 9),
    ano:        d.slice(9, 13),
    segmento:   d.slice(13, 14),
    tribunal:   d.slice(14, 16),
    origem:     d.slice(16, 20)
  };
}

/* Dígito verificador — ISO 7064, módulo 97 base 10 (Res. CNJ 65/2008) */
function digitoCnj(p) {
  const base = p.sequencial + p.ano + p.segmento + p.tribunal + p.origem + '00';
  let resto = 0;
  for (const c of base) resto = (resto * 10 + Number(c)) % 97;
  return String(98 - resto).padStart(2, '0');
}

function nomeTribunal(p) {
  if (p.segmento === '5') {
    const reg = TRTS[p.tribunal];
    return reg ? `TRT ${Number(p.tribunal)}ª Região — ${reg}` : null;
  }
  if (p.segmento === '8') {
    const uf = TJS[Number(p.tribunal) - 1];
    return uf ? `Tribunal de Justiça de ${uf === 'DF' ? 'DF e Territórios' : uf}` : null;
  }
  if (p.segmento === '4') return TRFS[p.tribunal] || null;
  if (p.segmento === '1') return 'Supremo Tribunal Federal';
  if (p.segmento === '3') return 'Superior Tribunal de Justiça';
  return null;
}

/* Alias da API Pública do DataJud para o tribunal do número */
function aliasDataJud(p) {
  if (p.segmento === '5' && TRTS[p.tribunal]) return 'trt' + Number(p.tribunal);
  if (p.segmento === '4' && TRFS[p.tribunal]) return 'trf' + Number(p.tribunal);
  if (p.segmento === '8') {
    const uf = TJS[Number(p.tribunal) - 1];
    if (!uf) return null;
    return 'tj' + (uf === 'DF' ? 'dft' : uf.toLowerCase());
  }
  if (p.segmento === '3') return 'stj';
  return null;
}

function renderDecoder() {
  const p = parseCnj($('#processo').value);
  const resumo = $('#decoder');
  const read = $('#decoderRead');
  const origin = $('#decoderOrigin');
  const pill = $('#decoderPill');
  resumo.hidden = !p.completo;
  if (!p.completo) {
    read.textContent = '';
    origin.textContent = '';
    pill.textContent = '';
    return p;
  }
  read.textContent = nomeTribunal(p) || 'Tribunal não identificado';
  origin.textContent = `${SEGMENTOS[p.segmento] || 'Ramo não identificado'} · ${p.ano} · Unidade de origem ${p.origem}`;
  const ok = digitoCnj(p) === p.digito;
  pill.textContent = ok ? 'Dígito verificador válido' : 'Confira o dígito verificador';
  pill.className = 'process-validation ' + (ok ? 'is-ok' : 'is-warn');
  return p;
}

/* Sugere a natureza da ação a partir do ramo da Justiça */
function sugerirNatureza(p) {
  const hint = $('#naturezaHint');
  const sugerida = NATUREZA_POR_SEGMENTO[p.segmento];

  $$('.choice', $('#naturezaGroup')).forEach(c => c.classList.remove('is-suggested'));

  if (!p.completo || !sugerida) { hint.hidden = true; return; }

  const alvo = $(`input[name="natureza"][value="${sugerida}"]`);
  if (!alvo) { hint.hidden = true; return; }

  alvo.closest('.choice').classList.add('is-suggested');

  const escolhido = $$('input[name="natureza"]').find(r => r.checked);
  if (!escolhido) {
    alvo.checked = true;
    alvo.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (escolhido !== alvo) {
    /* a pessoa já decidiu outra coisa; a sugestão não tem mais o que dizer */
    hint.hidden = true;
    return;
  }

  const rotulo = $('.choice-body b', alvo.closest('.choice')).textContent;
  hint.hidden = false;
  hint.textContent = `O número do processo indica ${SEGMENTOS[p.segmento]}, ` +
                     `então marcamos “${rotulo}”. Troque se a garantia for de outra natureza.`;
}

/* Preenche o Tribunal Regional a partir do número do processo — só quando
   o campo ainda está vazio, pra nunca sobrescrever uma escolha manual */
function sugerirTrt(p) {
  const sel = $('#trt');
  if (sel.value || !p.completo || p.segmento !== '5') return;
  if (TRTS[p.tribunal]) sel.value = p.tribunal;
}

/* ───────────────────────────────────────────────────────────────
   5 · CONSULTA DE CNPJ EM BASE PÚBLICA
   BrasilAPI como primária; CNPJ.ws como reserva.
   ─────────────────────────────────────────────────────────────── */

const CAMPOS_PARTE = {
  autor: { doc: '#autorDoc', nome: '#autorNome', end: '#autorEndereco' },
  reu:   { doc: '#reuDoc',   nome: '#reuNome',   end: '#reuEndereco'   }
};

function tipoAutorAtual() {
  return ($$('input[name="autorTipo"]').find(r => r.checked) || {}).value || '';
}

function erroDocumentoParte(parte) {
  const documento = digits($(CAMPOS_PARTE[parte].doc).value);
  if (parte === 'autor' && tipoAutorAtual() === 'PF') {
    if (documento.length !== 11) return 'Informe um CPF com 11 dígitos.';
    return cpfValido(documento) ? '' : 'Informe um CPF válido. Confira os dígitos informados.';
  }
  if (documento.length !== 14) return 'Informe um CNPJ com 14 dígitos.';
  if (!cnpjValido(documento)) return 'Informe um CNPJ válido. Confira os dígitos informados.';
  if (parte === 'reu' && cnpjsPartesIguais(tipoAutorAtual(), $('#autorDoc').value, documento)) {
    return 'O CNPJ do réu deve ser diferente do CNPJ do autor.';
  }
  return '';
}

function validarDocumentoParte(parte, mostrarMensagem = false) {
  const campo = $(CAMPOS_PARTE[parte].doc);
  const status = $(`[data-status="${parte}"]`);
  const erro = erroDocumentoParte(parte);
  campo.setCustomValidity(erro);
  if (erro && mostrarMensagem) {
    campo.classList.add('is-invalid');
    status.dataset.documentoErro = 'true';
    setHint(status, erro, 'error');
  } else if (!erro) {
    campo.classList.remove('is-invalid');
    if (status.dataset.documentoErro === 'true') {
      delete status.dataset.documentoErro;
      setHint(status, '');
    }
  }
  return !erro;
}

function validarDocumentosPartes(mostrarMensagem = false) {
  const autorValido = validarDocumentoParte('autor', mostrarMensagem);
  const reuValido = validarDocumentoParte('reu', mostrarMensagem);
  return autorValido && reuValido;
}

/* A consulta passa pelo Worker: o navegador não compartilha o IP do cliente
   nem depende de CORS dos provedores públicos. */
async function consultarCnpjNoWorker(cnpj) {
  let response;
  try {
    response = await fetch('/api/cnpj', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ cnpj }),
      signal: AbortSignal.timeout(24000)
    });
  } catch (erro) {
    throw new Error(erro?.name === 'TimeoutError'
      ? 'A consulta do CNPJ demorou mais do que o esperado.'
      : 'Não foi possível consultar o CNPJ agora.');
  }

  let dados;
  try { dados = await response.json(); }
  catch { throw new Error('O serviço de consulta devolveu uma resposta inesperada.'); }
  if (!response.ok) throw new Error(dados.erro || 'Não foi possível consultar o CNPJ agora.');
  return dados;
}

async function buscarCnpj(parte) {
  const map = CAMPOS_PARTE[parte];
  const campoDoc = $(map.doc);
  const status = $(`[data-status="${parte}"]`);
  const botao = $(`[data-lookup="${parte}"]`);
  const cnpj = digits(campoDoc.value);
  if (parte === 'autor' && tipoAutorAtual() !== 'PJ') return;
  if (!validarDocumentoParte(parte, true)) return;

  botao.disabled = true;
  setHint(status, 'Consultando a base pública…', 'load');

  let dados = null, erro = null;
  try { dados = await consultarCnpjNoWorker(cnpj); }
  catch (e) { erro = e; }

  botao.disabled = false;

  if (!dados) {
    setHint(status,
      (erro && erro.message ? erro.message + ' ' : '') + 'Preencha razão social e endereço à mão.',
      'error');
    return;
  }

  if (dados.razao) { $(map.nome).value = dados.razao; marcarPreenchido($(map.nome)); }
  if (map.end && dados.endereco) { $(map.end).value = dados.endereco; marcarPreenchido($(map.end)); }

  const inativa = /baixada|inapta|suspensa|nula/i.test(dados.situacao || '');
  setHint(status,
    dados.razao +
    (dados.situacao ? ` — situação cadastral ${dados.situacao.toLowerCase()}.` : '.') +
    (inativa ? ' Atenção: cadastro não ativo.' : ''),
    inativa ? 'warn' : 'ok');

  atualizarMedidor();
}

/* ───────────────────────────────────────────────────────────────
   6 · CONSULTA DE PROCESSO — API PÚBLICA DO DATAJUD (CNJ)
   Consulta pelo backend do Worker, sem credenciais no navegador.
   ─────────────────────────────────────────────────────────────── */

/* O Worker hospeda o formulário e a API no mesmo domínio.
   A credencial é configurada em DATAJUD_APIKEY no servidor. */
async function consultarDataJud() {
  const botao = $('#btnDataJud');
  const status = $('#dataJudStatus');
  if (botao.disabled) return;
  const numero = digits($('#processo').value);
  const p = parseCnj(numero);

  if (!p.completo || digitoCnj(p) !== p.digito) {
    setHint(status, 'Informe um número de processo completo e com dígito verificador válido.', 'error');
    return;
  }
  const alias = aliasDataJud(p);
  if (!alias) {
    setHint(status, 'Este tribunal não está disponível nesta consulta.', 'warn');
    return;
  }
  if (location.protocol === 'file:') {
    setHint(status, 'Abra o formulário pelo link publicado para buscar os dados.', 'warn');
    return;
  }

  botao.disabled = true;
  setHint(status, 'Buscando dados do processo…', 'load');
  try {
    const response = await fetch('/api/datajud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeroProcesso: numero }),
      signal: AbortSignal.timeout(35000)
    });
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error('O serviço de consulta não está disponível neste endereço. Avise o responsável pelo formulário.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.erro || 'Não foi possível concluir a consulta.');
    if (!Array.isArray(data?.hits?.hits)) throw new Error('O serviço retornou uma resposta inesperada.');
    // Evita preencher um processo com a resposta de outro se o usuário editar durante a consulta.
    if (digits($('#processo').value) !== numero) {
      setHint(status, 'O número foi alterado durante a consulta. Consulte novamente.', 'warn');
      return;
    }
    if (!data.hits.hits.length) {
      setHint(status, 'Processo não encontrado. Confira o número ou preencha os campos manualmente.', 'warn');
      return;
    }
    preencherComDataJud(data.hits.hits.map(hit => hit._source));
  } catch (error) {
    const mensagem = error.name === 'TimeoutError' || error.name === 'AbortError'
      ? 'A consulta demorou para responder. Tente novamente.'
      : error instanceof TypeError
        ? 'Não foi possível conectar ao serviço de consulta. Confira a conexão e tente novamente.'
        : error.message;
    setHint(status, mensagem, 'warn');
  } finally {
    botao.disabled = false;
  }
}

function preencherComDataJud(fontes) {
  const status = $('#dataJudStatus');
  const trazidos = [];

  /* G1 é a vara; G2 é a turma. A garantia é apresentada no juízo de origem,
     então o 1º grau vem primeiro. */
  const porGrau = fontes.slice().sort((a, b) =>
    String(a.grau || 'ZZ').localeCompare(String(b.grau || 'ZZ')));
  const origem = porGrau[0];

  const orgao = origem.orgaoJulgador && origem.orgaoJulgador.nome;
  if (orgao && !$('#juizoNome').value.trim()) {
    $('#juizoNome').value = orgao;
    marcarPreenchido($('#juizoNome'));
    trazidos.push('órgão julgador');
  }

  /* movimentações de todos os graus, do mais recente para o mais antigo */
  const movs = [];
  fontes.forEach(s => {
    (Array.isArray(s.movimentos) ? s.movimentos : []).forEach(m => {
      movs.push({ grau: s.grau, dataHora: m.dataHora, nome: m.nome });
    });
  });

  if (movs.length && !$('#historico').value.trim()) {
    const linhas = movs
      .sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora)))
      .slice(0, 20)
      .map(m => {
        const data = m.dataHora ? new Date(m.dataHora).toLocaleDateString('pt-BR') : '—';
        const grau = m.grau ? ' [' + m.grau + ']' : '';
        return `${data}${grau} — ${m.nome || 'movimento'}`;
      });

    const cabecalho = [
      origem.classe && origem.classe.nome ? 'Classe: ' + origem.classe.nome : '',
      Array.isArray(origem.assuntos) && origem.assuntos.length
        ? 'Assunto: ' + origem.assuntos.map(a => a.nome).filter(Boolean).join('; ') : '',
      origem.dataAjuizamento
        ? 'Ajuizado em: ' + String(origem.dataAjuizamento).replace(
            /^(\d{4})(\d{2})(\d{2}).*/, '$3/$2/$1')
        : '',
      fontes.length > 1
        ? 'Graus consultados: ' + porGrau.map(s => s.grau).filter(Boolean).join(', ')
        : ''
    ].filter(Boolean);

    $('#historico').value = [...cabecalho, '', 'Últimas movimentações:', ...linhas].join('\n');
    marcarPreenchido($('#historico'));
    trazidos.push(`${linhas.length} movimentações`);
  }

  setHint(status,
    trazidos.length
      ? 'Encontramos ' + trazidos.join(' e ') +
        '. Confira antes de enviar — faltam partes e valor da causa, preenchidos à mão.'
      : 'Os campos já estavam preenchidos. Nada foi sobrescrito.',
    'ok');

  atualizarMedidor();
}

/* ───────────────────────────────────────────────────────────────
   7 · RAMOS DO FORMULÁRIO
   ─────────────────────────────────────────────────────────────── */

function naturezaAtual() {
  const r = $$('input[name="natureza"]').find(x => x.checked);
  return r ? r.value : '';
}

function aplicarNatureza() {
  const nat = naturezaAtual();
  const recursal = nat === 'recursal';

  $('#garantiaEmpty').hidden = !!nat;
  $('#blocoComum').hidden = !nat;
  $('#blocoPadrao').hidden = !nat || recursal;
  $('#blocoRecursal').hidden = !recursal;

  $('#garantiaSub').textContent = !nat
    ? 'Escolha a natureza da ação na seção 03 para abrir os campos da garantia.'
    : recursal
      ? 'Depósito recursal trabalhista. O valor vem da tabela do TST conforme o recurso.'
      : 'Importância segurada a partir do valor da causa.';

  /* campos que só existem em certas naturezas */
  $$('[data-only]').forEach(el => {
    const vale = el.dataset.only.split(/\s+/).includes(nat);
    el.hidden = !vale;
    $$('input, textarea, select', el).forEach(c => {
      if (vale) c.setAttribute('data-required', '');
      else { c.removeAttribute('data-required'); c.classList.remove('is-invalid'); }
    });
  });

  /* obrigatoriedade que depende do ramo */
  const alterna = (sel, ligado) => {
    const el = $(sel);
    if (!el) return;
    if (ligado) el.setAttribute('data-required', '');
    else { el.removeAttribute('data-required'); el.classList.remove('is-invalid'); }
  };

  /* tributário/fiscal/administrativo é uma escolha só; o número do processo
     administrativo fica obrigatório aqui e opcional em qualquer outra natureza */
  const fiscal = nat === 'tributario';
  alterna('#numAdministrativo', fiscal);
  $('#numAdministrativoOpt').hidden = fiscal;
  alterna('#numCda', fiscal);
  $('#numCdaOpt').hidden = fiscal;

  alterna('#valorCausa', !!nat && !recursal);
  alterna('#indice', !!nat);
  alterna('#objetivo', !!nat);
  alterna('#enquadramento', recursal);

  /* na garantia recursal o acréscimo de 30% não é opcional (CLT, margem de
     atualização até o julgamento) — trava marcado, sem escolha */
  const add30Recursal = $('#add30Recursal');
  add30Recursal.disabled = recursal;
  if (recursal) add30Recursal.checked = true;
  $('#add30RecursalHint').hidden = !recursal;

  /* Tribunal Regional: obrigatoriedade e visibilidade já vêm do [data-only]
     acima (trabalhista + recursal); só falta destravar o valor herdado
     quando a pessoa sai dessas naturezas, algo que o [data-only] já faz. */
  $$('input[name="tipoRecurso"]').forEach(r => {
    if (recursal) r.setAttribute('data-required', '');
    else r.removeAttribute('data-required');
  });

  if (recursal) {
    aplicarTipoRecurso();
  } else {
    $('#aiSub').hidden = true;
    $('#aiDestranca').removeAttribute('data-required');
  }

  /* a pergunta sobre menor de idade some junto com a natureza; o
     representante precisa sumir junto, mesmo que o “sim” continue marcado */
  aplicarMenorIdade();

  /* vigência mínima: 3 anos, salvo garantia fiscal, que pede 5 */
  const min = fiscal ? 5 : 3;
  $$('#vigAnos option').forEach(o => {
    if (!o.value) return;
    o.disabled = Number(o.value) < min;
  });
  const sel = $('#vigAnos');
  if (sel.value && Number(sel.value) < min) sel.value = '';
  setHint($('#vigHint'),
    fiscal ? 'Garantia fiscal: mínimo de 5 anos.' : 'Mínimo de 3 anos.',
    fiscal ? 'warn' : null);

  calcularVigencia();
  calcularValores();
  atualizarMedidor();
}

function menorDeIdade() {
  const r = $$('input[name="menorIdade"]').find(x => x.checked);
  return r ? r.value : '';
}

/* Autor menor age representado ou assistido (CC, arts. 3º e 4º; CLT, art. 793).
   A pergunta só existe em ação cível e trabalhista; quando a resposta é “sim”,
   nome e CPF do representante legal viram obrigatórios. */
function aplicarMenorIdade() {
  const nat = naturezaAtual();
  const cabe = nat === 'civel' || nat === 'trabalhista';
  const sim = cabe && menorDeIdade() === 'sim';

  $('#representanteSub').hidden = !sim;
  ['#repNome', '#repCpf'].forEach(sel => {
    const el = $(sel);
    if (sim) el.setAttribute('data-required', '');
    else { el.removeAttribute('data-required'); el.classList.remove('is-invalid'); }
  });
}

/* ───────────────────────────────────────────────────────────────
   8 · VALORES — os dois montantes ficam sempre à vista
   ─────────────────────────────────────────────────────────────── */

function centavosDe(input) {
  return Number(input.dataset.cents || 0);
}

function pintarRazao(ledger, dados) {
  const set = (key, texto, mudo) => {
    const el = $(`[data-ledger="${key}"]`, ledger);
    if (!el) return;
    el.textContent = texto;
    el.classList.toggle('is-muted', !!mudo);
  };
  set('base', money(dados.base));
  set('acrescimo', dados.add30 ? '+ ' + money(dados.acrescimo) : '—', !dados.add30);
  set('total', money(dados.total));
  if (dados.enq !== undefined) {
    set('enq', dados.fator === 1 ? '—' : (dados.fator === 0 ? money(0) : money(dados.enq)), dados.fator === 1);
    const k = $('[data-ledger="enqK"]', ledger);
    if (k) k.textContent = dados.enqRotulo || 'Enquadramento';
  }
  $('[data-ledger="foot"]', ledger).textContent = dados.nota;
}

function tipoRecursoAtual() {
  const r = $$('input[name="tipoRecurso"]').find(x => x.checked);
  if (!r) return null;
  return DEPOSITO_RECURSAL.recursos.find(x => x.id === r.value) || null;
}

/* Depósito de tabela em centavos, já resolvida a dependência do agravo */
function depositoDeTabela() {
  const rec = tipoRecursoAtual();
  if (!rec) return { cents: 0, nota: 'Selecione o tipo de recurso para calcular.', rotulo: '' };

  if (rec.valor === 0) {
    return { cents: 0, nota: rec.nota, rotulo: rec.nome };
  }

  if (rec.derivado) {
    if ($('#ai8').checked) {
      return {
        cents: 0,
        nota: 'Agravo contra decisão que contraria jurisprudência uniforme do TST: ' +
              'depósito dispensado (CLT, art. 899, § 8º).',
        rotulo: rec.nome
      };
    }
    const alvoId = $('#aiDestranca').value;
    const alvo = DEPOSITO_RECURSAL.recursos.find(r => r.id === alvoId);
    if (!alvo) {
      return { cents: 0, nota: 'Informe qual recurso o agravo pretende destrancar.', rotulo: rec.nome };
    }
    return {
      cents: Math.round(alvo.valor * 100 * 0.5),
      nota: `Metade do depósito do ${alvo.nome} (CLT, art. 899, § 7º).`,
      rotulo: `${rec.nome} — destrancando ${alvo.nome}`
    };
  }

  return {
    cents: Math.round(rec.valor * 100),
    nota: `${rec.nome} — ${DEPOSITO_RECURSAL.fonte.ato}, ${rec.base}.`,
    rotulo: rec.nome
  };
}

function calcularValores() {
  const recursal = naturezaAtual() === 'recursal';
  let total = 0;

  if (recursal) {
    const enqKey = $('#enquadramento').value || 'integral';
    const enq = ENQUADRAMENTO[enqKey];
    const add30 = $('#add30Recursal').checked;
    const manual = centavosDe($('#valorGarantiaManual'));

    const tab = depositoDeTabela();
    const base = Math.round(tab.cents * enq.fator);
    const acrescimo = Math.round(base * 0.3);
    total = manual > 0 ? manual : base + (add30 ? acrescimo : 0);

    let nota = tab.nota;
    if (manual > 0) {
      nota = 'Importância segurada informada à mão; o cálculo de tabela fica como referência.';
    } else if (enq.fator === 0 && tab.cents > 0) {
      nota = tab.nota + ' ' + enq.rotulo + ': depósito dispensado.';
    } else if (add30 && base > 0) {
      nota = tab.nota + ' Acrescido de 30%.';
    }

    pintarRazao($('#ledgerRecursal'), {
      base: tab.cents, acrescimo, total, add30,
      enq: base, fator: enq.fator, enqRotulo: enq.rotulo, nota
    });
  } else {
    const base = centavosDe($('#valorCausa'));
    const add30 = $('#add30Padrao').checked;
    const acrescimo = Math.round(base * 0.3);
    total = base + (add30 ? acrescimo : 0);

    pintarRazao($('#ledgerPadrao'), {
      base, acrescimo, total, add30,
      nota: add30
        ? 'Importância segurada = valor da causa atualizado + 30%.'
        : 'Sem acréscimo. A importância segurada é igual ao valor da causa.'
    });
  }

  return total;
}

/* ───────────────────────────────────────────────────────────────
   9 · VIGÊNCIA E PRAZO DE ENTREGA
   ─────────────────────────────────────────────────────────────── */

function calcularVigencia() {
  const inicio = isoDoCampoData('vigInicio');
  const anos = Number($('#vigAnos').value);
  const out = $('#vigFim');

  if (!inicio || !anos) {
    out.textContent = '—';
    out.classList.remove('is-set');
    return null;
  }

  const d = new Date(inicio + 'T00:00:00');
  d.setFullYear(d.getFullYear() + anos);
  out.textContent = d.toLocaleDateString('pt-BR');
  out.classList.add('is-set');
  return d;
}

/* Antecedência considerada suficiente para análise do risco, complementação
   documental, aprovação e emissão. Abaixo disso o formulário avisa. */
const ANTECEDENCIA_MINIMA_DIAS = 10;

/* Prazo fatal/processual declarado pelo cliente — não tem relação com a
   vigência. Devolve os dias restantes para quem for avisar. */
function calcularPrazoEntrega() {
  const valor = isoDoCampoData('prazoEntrega');
  const hint = $('#prazoEntregaHint');

  if (!valor) {
    setHint(hint, 'Data limite do processo.');
    return null;
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dias = Math.round((new Date(valor + 'T00:00:00') - hoje) / 86400000);

  if (dias < 0) setHint(hint, 'O prazo informado já passou. Confira com o cliente.', 'error');
  else if (dias === 0) setHint(hint, 'O prazo fatal é hoje — sem tempo hábil para análise, aprovação e emissão.', 'warn');
  else if (dias <= ANTECEDENCIA_MINIMA_DIAS) setHint(hint, `Faltam ${dias} ${dias === 1 ? 'dia' : 'dias'} — abaixo dos ${ANTECEDENCIA_MINIMA_DIAS} dias recomendados para análise, aprovação e emissão.`, 'warn');
  else setHint(hint, `Faltam ${dias} dias para o prazo fatal.`, 'ok');

  return dias;
}

/* ───────────────────────────────────────────────────────────────
   10 · VALIDAÇÃO E MEDIDOR
   ─────────────────────────────────────────────────────────────── */

function campoValido(el) {
  if (el.type === 'radio') {
    return $$(`input[name="${el.name}"]`).some(r => r.checked);
  }
  if (el.classList.contains('input-money')) return centavosDe(el) > 0;
  if (el.dataset.dateBr === 'true') return Boolean(isoDoCampoData(el.id));
  if (el.id === 'autorDoc') return !erroDocumentoParte('autor');
  if (el.id === 'reuDoc') return !erroDocumentoParte('reu');
  return el.value.trim() !== '';
}

function obrigatoriosVisiveis() {
  return $$('[data-required]').filter(el => el.offsetParent !== null || el.type === 'radio')
    .filter(el => {
      const bloco = el.closest('.branch, [data-only]');
      return !bloco || !bloco.hidden;
    });
}

function atualizarMedidor() {
  const campos = obrigatoriosVisiveis();
  const grupos = new Map();

  campos.forEach(el => {
    const chave = el.type === 'radio' ? 'radio:' + el.name : el.id || el.name;
    if (!grupos.has(chave)) grupos.set(chave, el);
  });

  const lista = Array.from(grupos.values());
  const ok = lista.filter(campoValido).length;

  const faltam = lista.length - ok + (assinatura && !assinatura.isEmpty() ? 0 : 1);
  const nota = $('#actionsNote');
  if (!naturezaAtual()) {
    nota.textContent = 'Escolha a natureza da ação na seção 03 para abrir os campos da garantia.';
    nota.className = 'actions-note';
  } else if (faltam > 0) {
    nota.textContent = `Faltam ${faltam} ${faltam === 1 ? 'campo obrigatório' : 'campos obrigatórios'}.`;
    nota.className = 'actions-note';
  } else {
    nota.textContent = 'Tudo preenchido. Revise antes de enviar.';
    nota.className = 'actions-note is-ready';
  }

  marcarIndice();
}

function marcarIndice() {
  ['s1','s2','s3','s4','s5','s6','s7'].forEach(id => {
    const sec = $('#' + id);
    const link = $(`.index a[data-idx="${id}"]`);
    if (!sec || !link) return;
    const req = $$('[data-required]', sec).filter(el => {
      const b = el.closest('.branch, [data-only]');
      return !b || !b.hidden;
    });
    const grupos = new Map();
    req.forEach(el => {
      const k = el.type === 'radio' ? 'radio:' + el.name : el.id || el.name;
      if (!grupos.has(k)) grupos.set(k, el);
    });
    const lista = Array.from(grupos.values());
    const completo = id === 's7'
      ? Boolean(assinatura && !assinatura.isEmpty())
      : lista.length > 0 && lista.every(campoValido);
    link.classList.toggle('is-done', completo);
  });
}

function marcarPreenchido(el) {
  if (!el) return;
  el.classList.toggle('is-filled', el.value.trim() !== '');
}

function primeiroInvalido() {
  const campos = obrigatoriosVisiveis();
  const vistos = new Set();
  for (const el of campos) {
    const k = el.type === 'radio' ? 'radio:' + el.name : el.id;
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (!campoValido(el)) return el;
  }
  return null;
}

function apontarInvalidos() {
  const vistos = new Set();
  obrigatoriosVisiveis().forEach(el => {
    const k = el.type === 'radio' ? 'radio:' + el.name : el.id;
    if (vistos.has(k)) return;
    vistos.add(k);
    if (el.classList.contains('input')) el.classList.toggle('is-invalid', !campoValido(el));
  });
}

/* ───────────────────────────────────────────────────────────────
   11 · COLETA E CONFERÊNCIA
   ─────────────────────────────────────────────────────────────── */

function coletar() {
  const nat = naturezaAtual();
  const recursal = nat === 'recursal';
  const rotuloNat = (() => {
    const r = $$('input[name="natureza"]').find(x => x.checked);
    return r ? $('.choice-body b', r.closest('.choice')).textContent : '';
  })();

  const p = parseCnj($('#processo').value);
  const enqKey = $('#enquadramento').value || 'integral';
  const trtSel = $('#trt');

  const total = calcularValores();
  const fim = calcularVigencia();
  const diasEntrega = calcularPrazoEntrega();

  /* a pergunta não existe fora de cível e trabalhista: ali o campo fica nulo,
     para não afirmar “não” sobre algo que nunca foi perguntado */
  const cabeMenor = nat === 'civel' || nat === 'trabalhista';
  const menor = cabeMenor ? menorDeIdade() : '';

  return {
    /* capturado na Tela 1, antes do formulário — ver ligarGate() no bloco 13.
       Preparado para o payload do Hub; o Hub ainda não lê este campo (ver
       SPEC.md, seção "Envio ao Hub" e src/services/hub.mjs). */
    responsavel: responsavel ? { ...responsavel } : null,
    natureza: nat,
    naturezaRotulo: rotuloNat,
    autor: {
      tipo: ($$('input[name="autorTipo"]').find(r => r.checked) || {}).value === 'PF'
        ? 'Pessoa física' : 'Pessoa jurídica',
      documento: $('#autorDoc').value,
      nome: $('#autorNome').value.trim(),
      endereco: $('#autorEndereco').value.trim()
    },
    menorIdade: cabeMenor ? (menor === 'sim' ? 'sim' : menor === 'nao' ? 'não' : '') : null,
    representante: menor === 'sim'
      ? { nome: $('#repNome').value.trim(), cpf: $('#repCpf').value.trim() }
      : null,
    reu: {
      documento: $('#reuDoc').value,
      nome: $('#reuNome').value.trim(),
      endereco: $('#reuEndereco').value.trim()
    },
    processo: {
      numero: $('#processo').value,
      digitoConfere: p.completo ? digitoCnj(p) === p.digito : null,
      ramo: SEGMENTOS[p.segmento] || '',
      tribunal: nomeTribunal(p) || '',
      ano: p.ano,
      juizo: $('#juizoNome').value.trim(),
      numeroAdministrativo: $('#numAdministrativo').value.trim(),
      numeroCda: $('#numCda').value.trim(),
      tribunalRegional: trtSel.value ? trtSel.options[trtSel.selectedIndex].text : ''
    },
    garantia: recursal ? {
      tipoRecurso: recursal ? depositoDeTabela().rotulo : '',
      depositoTabela: recursal ? depositoDeTabela().cents : null,
      dispensaSumular: $('#ai8').checked,
      enquadramento: ENQUADRAMENTO[enqKey].rotulo,
      vara: $('#juizoNome').value.trim(),
      add30: $('#add30Recursal').checked,
      ajusteManual: centavosDe($('#valorGarantiaManual')) || null,
      importanciaSegurada: total,
      fonte: DEPOSITO_RECURSAL.fonte
    } : {
      valorCausa: centavosDe($('#valorCausa')),
      add30: $('#add30Padrao').checked,
      importanciaSegurada: total,
      autoInfracao: $('#numAutoInfracao').value.trim(),
      linhaDefesa: $('#linhaDefesa').value.trim(),
      historico: $('#historico').value.trim()
    },
    indice: $('#indice').value,
    objetivo: $('#objetivo').value.trim(),
    vigencia: {
      inicio: isoDoCampoData('vigInicio'),
      anos: Number($('#vigAnos').value) || null,
      fim: fim ? fim.toISOString().slice(0, 10) : ''
    },
    entrega: {
      prazo: isoDoCampoData('prazoEntrega'),
      diasRestantes: diasEntrega,
      /* ciência de que o prazo é responsabilidade do cliente e de que o envio
         não garante aprovação nem emissão — marcada na tela de conferência */
      cienciaPrazo: $('#cienciaPrazoCheck').checked
    },
    exito: ($$('input[name="exito"]').find(r => r.checked) || {}).value || '',
    advogado: {
      nome: $('#advNome').value.trim(),
      oab: $('#advOab').value.trim(),
      uf: $('#advUf').value
    },
    assinatura: assinatura && !assinatura.isEmpty() ? assinatura.toDataURL('image/png') : ''
  };
}

function escaparHtml(valor) {
  return String(valor).replace(/[&<>'"]/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[caractere]);
}

function linhaRevisao(k, v, classe) {
  const vazio = v === '' || v === null || v === undefined;
  return `<div class="review-item">
      <span class="review-k">${escaparHtml(k)}</span>
      <span class="review-v ${vazio ? 'is-empty' : (classe || '')}">${vazio ? 'não informado' : escaparHtml(v)}</span>
    </div>`;
}

function montarConferencia(d) {
  const g = (titulo, linhas) =>
    `<div class="review-group"><h3>${titulo}</h3>${linhas.join('')}</div>`;

  const blocos = [];

  if (d.responsavel) {
    blocos.push(g('Responsável pelo envio', [
      linhaRevisao('Empresa', d.responsavel.empresa),
      linhaRevisao('Nome completo', d.responsavel.nome),
      linhaRevisao('E-mail', d.responsavel.email),
      linhaRevisao('Telefone / celular', d.responsavel.telefone, 'mono')
    ]));
  }

  /* menorIdade nulo = a natureza escolhida nem faz a pergunta; nesse caso a
     linha não aparece, em vez de aparecer como “não informado” */
  blocos.push(g('Partes', [
    linhaRevisao('Segurado', d.autor.nome),
    linhaRevisao(d.autor.tipo === 'Pessoa física' ? 'CPF' : 'CNPJ', d.autor.documento, 'mono'),
    linhaRevisao('Endereço', d.autor.endereco),
    ...(d.menorIdade === null ? [] : [linhaRevisao('Envolve menor de idade', d.menorIdade)]),
    ...(d.representante ? [
      linhaRevisao('Representante legal', d.representante.nome),
      linhaRevisao('CPF do representante', d.representante.cpf, 'mono')
    ] : []),
    linhaRevisao('Tomador', d.reu.nome),
    linhaRevisao('CNPJ', d.reu.documento, 'mono'),
    linhaRevisao('Endereço', d.reu.endereco)
  ]));

  blocos.push(g('Processo', [
    linhaRevisao('Número', d.processo.numero, 'mono'),
    linhaRevisao('Ramo da Justiça', d.processo.ramo),
    linhaRevisao('Tribunal', d.processo.tribunal),
    linhaRevisao('Juízo / vara', d.processo.juizo),
    linhaRevisao('Natureza', d.naturezaRotulo),
    linhaRevisao('Número do processo administrativo', d.processo.numeroAdministrativo, 'mono'),
    linhaRevisao('Número da CDA', d.processo.numeroCda, 'mono'),
    linhaRevisao('Tribunal Regional', d.processo.tribunalRegional)
  ]));

  if (d.natureza === 'recursal') {
    blocos.push(g('Garantia recursal', [
      linhaRevisao('Tipo de recurso', d.garantia.tipoRecurso),
      linhaRevisao('Depósito de tabela',
        d.garantia.depositoTabela != null ? money(d.garantia.depositoTabela) : '', 'is-money'),
      linhaRevisao('Enquadramento', d.garantia.enquadramento),
      linhaRevisao('Acréscimo de 30%', d.garantia.add30 ? 'sim' : 'não'),
      linhaRevisao('Importância segurada', money(d.garantia.importanciaSegurada), 'is-money')
    ]));
  } else {
    blocos.push(g('Garantia', [
      linhaRevisao('Valor da causa', money(d.garantia.valorCausa), 'is-money'),
      linhaRevisao('Acréscimo de 30%', d.garantia.add30 ? 'sim' : 'não'),
      linhaRevisao('Importância segurada', money(d.garantia.importanciaSegurada), 'is-money'),
      linhaRevisao('Auto de infração', d.garantia.autoInfracao, 'mono'),
      linhaRevisao('Linha de defesa', d.garantia.linhaDefesa),
      linhaRevisao('Histórico', d.garantia.historico
        ? d.garantia.historico.slice(0, 180) + (d.garantia.historico.length > 180 ? '…' : '') : '')
    ]));
  }

  blocos.push(g('Condições', [
    linhaRevisao('Índice de reajuste', d.indice),
    linhaRevisao('Objetivo da garantia', d.objetivo),
    linhaRevisao('Vigência', d.vigencia.anos
      ? `${d.vigencia.anos} anos — de ${new Date(d.vigencia.inicio + 'T00:00:00').toLocaleDateString('pt-BR')} a ${new Date(d.vigencia.fim + 'T00:00:00').toLocaleDateString('pt-BR')}`
      : ''),
    linhaRevisao('Prazo fatal / processual', d.entrega.prazo
      ? new Date(d.entrega.prazo + 'T00:00:00').toLocaleDateString('pt-BR')
      : ''),
    linhaRevisao('Probabilidade de êxito', d.exito)
  ]));

  blocos.push(g('Advogado', [
    linhaRevisao('Nome', d.advogado.nome),
    linhaRevisao('OAB', `${d.advogado.oab}${d.advogado.uf ? ' / ' + d.advogado.uf : ''}`, 'mono')
  ]));

  blocos.push(`<div class="review-group"><h3>Assinatura</h3>
    <img class="review-signature" src="${d.assinatura}" alt="Assinatura desenhada pelo responsável"></div>`);

  /* pontos que merecem um olhar antes de seguir */
  const avisos = [];
  if (d.processo.digitoConfere === false)
    avisos.push('O dígito verificador do número do processo não confere.');
  if (d.autor.nome && d.reu.nome && d.autor.nome === d.reu.nome)
    avisos.push('Segurado e tomador estão com o mesmo nome.');
  if (d.garantia.importanciaSegurada === 0)
    avisos.push('A importância segurada está em R$ 0,00.');
  if (d.natureza === 'recursal' && d.garantia.ajusteManual)
    avisos.push('A importância segurada foi informada à mão, fora da tabela.');
  if (d.natureza !== 'recursal' && !d.garantia.add30)
    avisos.push('O acréscimo de 30% não foi marcado.');
  if (!DEPOSITO_RECURSAL.fonte.confirmado && d.natureza === 'recursal')
    avisos.push('A tabela de depósito recursal em app.js ainda não foi atualizada.');
  if (d.entrega.diasRestantes !== null && d.entrega.diasRestantes < 0)
    avisos.push('O prazo fatal/processual informado já passou.');
  else if (d.entrega.diasRestantes !== null && d.entrega.diasRestantes <= ANTECEDENCIA_MINIMA_DIAS)
    avisos.push(`Faltam ${d.entrega.diasRestantes} dia(s) para o prazo fatal — abaixo dos ${ANTECEDENCIA_MINIMA_DIAS} dias recomendados para análise do risco, complementação documental, aprovação e emissão.`);
  if (d.menorIdade === 'sim')
    avisos.push('Segurado menor de idade: a apólice precisa qualificar o representante legal.');

  if (avisos.length) {
    blocos.push(`<div class="review-warn"><b>Vale conferir:</b>
      <ul>${avisos.map(a => `<li>${a}</li>`).join('')}</ul></div>`);
  }

  return blocos.join('');
}

/* ───────────────────────────────────────────────────────────────
   12 · JANELAS
   ─────────────────────────────────────────────────────────────── */

let ultimoFoco = null;

function abrirModal(id) {
  ultimoFoco = document.activeElement;
  $('#' + id).hidden = false;
  document.body.style.overflow = 'hidden';
  const alvo = $('#' + id).querySelector('.modal-body, .btn');
  if (alvo) alvo.focus();
}

function fecharModal(id) {
  $('#' + id).hidden = true;
  document.body.style.overflow = '';
  if (ultimoFoco) ultimoFoco.focus();
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#scrim').hidden) fecharModal('scrim');
  else if (!$('#scrimOk').hidden) fecharModal('scrimOk');
});

/* ───────────────────────────────────────────────────────────────
   13 · MONTAGEM
   ─────────────────────────────────────────────────────────────── */

function montarUfs() {
  const sel = $('#advUf');
  UFS.forEach(uf => sel.add(new Option(uf, uf)));
}

function montarTrts() {
  const sel = $('#trt');
  Object.keys(TRTS).forEach(k => {
    sel.add(new Option(`TRT ${Number(k)}ª Região — ${TRTS[k]}`, k));
  });
}

function montarRecursos() {
  const box = $('#recursoGroup');
  const confirmado = DEPOSITO_RECURSAL.fonte.confirmado;

  box.innerHTML = DEPOSITO_RECURSAL.recursos.map(r => {
    let etiqueta;
    if (r.derivado) etiqueta = '<span class="choice-price">metade do recurso destrancado</span>';
    else if (r.valor === 0) etiqueta = '<span class="choice-price is-free">sem depósito</span>';
    else etiqueta = `<span class="choice-price">${BRL.format(r.valor)}</span>`;

    return `<label class="choice">
      <input type="radio" name="tipoRecurso" value="${r.id}">
      <span class="choice-body">
        <b>${r.nome}</b>
        ${etiqueta}
        ${r.nota ? `<em>${r.nota}</em>` : ''}
      </span>
    </label>`;
  }).join('');

  const nota = $('#recursalFonte');
  if (confirmado) {
    nota.innerHTML = `Valores do <b>${DEPOSITO_RECURSAL.fonte.ato}</b>, vigentes desde ` +
      `${DEPOSITO_RECURSAL.fonte.vigencia}. O TST reajusta a tabela em julho de cada ano. ` +
      (DEPOSITO_RECURSAL.fonte.url
        ? `<a href="${DEPOSITO_RECURSAL.fonte.url}" target="_blank" rel="noopener">Ver o ato</a>.` : '');
    nota.classList.add('branch-note-ok');
  } else {
    nota.innerHTML = '<b>Tabela ainda não preenchida.</b> Informe os valores vigentes do ' +
      'depósito recursal na constante <code>DEPOSITO_RECURSAL</code>, no início de app.js.';
  }
}

/* O agravo de instrumento depende do recurso que se pretende destrancar. */
function aplicarTipoRecurso() {
  const rec = tipoRecursoAtual();
  const derivado = !!(rec && rec.derivado);
  const sub = $('#aiSub');

  sub.hidden = !derivado;
  const alvo = $('#aiDestranca');
  if (derivado && !$('#ai8').checked) alvo.setAttribute('data-required', '');
  else { alvo.removeAttribute('data-required'); alvo.classList.remove('is-invalid'); }

  calcularValores();
  atualizarMedidor();
}

/* ── máscaras nos campos ─────────────────────────────────────── */

function ligarMascaras() {
  /* documento do autor troca de máscara com a natureza */
  const aplicarMascaraAutor = () => {
    const pf = tipoAutorAtual() === 'PF';
    const campo = $('#autorDoc');
    const botao = $('#autorBuscar');

    $$('[data-doclabel="autor"]').forEach(el => { el.textContent = pf ? 'CPF' : 'CNPJ'; });
    campo.placeholder = pf ? '000.000.000-00' : '00.000.000/0000-00';
    campo.value = pf ? maskCpf(campo.value) : maskCnpj(campo.value);
    botao.hidden = pf;
    setHint($('[data-status="autor"]'),
      pf ? 'Pessoa física: preencha nome e endereço à mão.' : '', pf ? null : null);
    validarDocumentoParte('autor', false);
    validarDocumentoParte('reu', false);
  };

  $$('input[name="autorTipo"]').forEach(r => r.addEventListener('change', aplicarMascaraAutor));
  aplicarMascaraAutor();

  $('#autorDoc').addEventListener('input', (e) => {
    const pf = tipoAutorAtual() === 'PF';
    e.target.value = pf ? maskCpf(e.target.value) : maskCnpj(e.target.value);
    validarDocumentoParte('autor', false);
    validarDocumentoParte('reu', false);
    if (!pf && digits(e.target.value).length === 14) buscarCnpj('autor');
  });

  [['#reuDoc', 'reu']].forEach(([sel, parte]) => {
    $(sel).addEventListener('input', (e) => {
      e.target.value = maskCnpj(e.target.value);
      validarDocumentoParte(parte, false);
      if (digits(e.target.value).length === 14) buscarCnpj(parte);
    });
  });

  $('#autorDoc').addEventListener('blur', () => {
    validarDocumentoParte('autor', true);
    validarDocumentoParte('reu', Boolean($('#reuDoc').value));
  });
  $('#reuDoc').addEventListener('blur', () => validarDocumentoParte('reu', true));

  $$('[data-lookup]').forEach(b => {
    b.addEventListener('click', () => buscarCnpj(b.dataset.lookup));
  });

  /* número do processo */
  $('#processo').addEventListener('input', (e) => {
    e.target.value = maskCnj(e.target.value);
    const p = renderDecoder();
    sugerirNatureza(p);
    sugerirTrt(p);
  });

  $$('[data-date-br="true"]').forEach(campo => {
    campo.addEventListener('input', () => {
      mascararDataBr(campo);
      if (campo.id === 'vigInicio') calcularVigencia();
      if (campo.id === 'prazoEntrega') calcularPrazoEntrega();
      atualizarMedidor();
    });
    campo.addEventListener('blur', () => {
      mascararDataBr(campo);
      if (campo.value && !campo.dataset.iso) campo.classList.add('is-invalid');
    });
  });

  /* valores em reais */
  $$('.input-money').forEach(el => {
    el.dataset.cents = '0';
    el.addEventListener('input', (e) => {
      const cents = Number(digits(e.target.value).slice(0, 15)) || 0;
      e.target.dataset.cents = String(cents);
      e.target.value = cents ? money(cents) : '';
      calcularValores();
      atualizarMedidor();
    });
  });

  $('#repCpf').addEventListener('input', (e) => {
    e.target.value = maskCpf(e.target.value);
  });

  $('#advOab').addEventListener('input', (e) => {
    e.target.value = digits(e.target.value).slice(0, 8);
  });
}

/* ── índice acompanha a rolagem ──────────────────────────────── */

function ligarIndice() {
  const obs = new IntersectionObserver((entradas) => {
    entradas.forEach(en => {
      if (!en.isIntersecting) return;
      $$('.index a').forEach(a => a.classList.remove('is-active'));
      const link = $(`.index a[data-idx="${en.target.id}"]`);
      if (link) link.classList.add('is-active');
    });
  }, { rootMargin: '-25% 0px -65% 0px' });

  ['s1','s2','s3','s4','s5','s6','s7'].forEach(id => {
    const el = $('#' + id);
    if (el) obs.observe(el);
  });
}

/* ── eventos gerais ──────────────────────────────────────────── */

function iniciarAssinatura() {
  const canvas = $('#signatureCanvas');
  const campo = $('#signatureField');
  if (typeof SignaturePad !== 'function') {
    $('#signatureStatus').textContent = 'Não foi possível carregar a área de assinatura.';
    return;
  }
  /* O bloqueio precisa estar no elemento que recebe o toque. Isso impede que
     Safari/Chrome interpretem a assinatura como rolagem da página. */
  canvas.style.touchAction = 'none';
  canvas.style.overscrollBehavior = 'contain';
  canvas.style.webkitUserSelect = 'none';
  assinatura = new SignaturePad(canvas, { minWidth: 0.8, maxWidth: 2.4, penColor: '#0e2c40' });

  let larguraAnterior = 0;
  let alturaAnterior = 0;
  const redimensionar = () => {
    const largura = canvas.offsetWidth;
    const altura = canvas.offsetHeight;
    /* A área nasce dentro da segunda tela, inicialmente oculta. Não transforme
       o canvas em 0x0: aguarde até o navegador concluir o layout visível. */
    if (!largura || !altura || (largura === larguraAnterior && altura === alturaAnterior)) return;
    const dados = assinatura.isEmpty() ? null : assinatura.toData();
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(largura * ratio);
    canvas.height = Math.round(altura * ratio);
    canvas.getContext('2d').scale(ratio, ratio);
    larguraAnterior = largura;
    alturaAnterior = altura;
    assinatura.clear();
    if (dados) assinatura.fromData(dados);
  };
  redimensionar();
  window.addEventListener('resize', redimensionar);
  if (typeof ResizeObserver === 'function') new ResizeObserver(redimensionar).observe(campo);

  /* Compatibilidade adicional para navegadores móveis antigos que ainda
     promovem eventos touch mesmo quando Pointer Events estão disponíveis. */
  const bloquearRolagem = evento => {
    if (evento.cancelable) evento.preventDefault();
  };
  canvas.addEventListener('touchstart', bloquearRolagem, { passive: false });
  canvas.addEventListener('touchmove', bloquearRolagem, { passive: false });
  assinatura.addEventListener('endStroke', () => {
    campo.classList.remove('is-invalid');
    $('#signaturePlaceholder').hidden = true;
    $('#signatureStatus').textContent = 'Assinatura registrada neste dispositivo.';
    atualizarMedidor();
  });
  $('#btnLimparAssinatura').addEventListener('click', () => {
    assinatura.clear();
    $('#signaturePlaceholder').hidden = false;
    $('#signatureStatus').textContent = 'A assinatura é obrigatória para enviar.';
    atualizarMedidor();
  });
}

function dataPdf(valor) {
  const partes = String(valor || '').split('-');
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : (valor || '');
}

async function logoParaPdf() {
  const logo = document.querySelector('#formSheet .masthead-logo') || document.querySelector('.masthead-logo');
  if (!logo) return null;
  if (!logo.complete && typeof logo.decode === 'function') {
    try { await logo.decode(); } catch { return null; }
  }
  return logo.naturalWidth === 0 ? null : logo;
}

/* Documento vetorial e independente do tamanho da tela. O Hub recebe
   exatamente o mesmo Blob disponibilizado posteriormente para download. */
async function gerarPdf(d, protocolo, { baixar = true } = {}) {
  if (!window.jspdf?.jsPDF) throw new Error('Gerador de PDF indisponível.');

  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const logo = await logoParaPdf();
  const margem = 16;
  const larguraUtil = 178;
  const limiteInferior = 280;
  const azul = [20, 64, 92];
  const ciano = [0, 183, 240];
  const grafite = [30, 41, 59];
  const cinza = [92, 113, 131];
  const gelo = [246, 249, 251];
  const borda = [218, 229, 236];
  let y = 0;

  pdf.setProperties?.({
    title: `Seguro Garantia Judicial — ${protocolo}`,
    subject: 'Solicitação de cotação de seguro garantia judicial',
    author: 'Lavoro Seguros',
    creator: 'Formulário corporativo Lavoro Seguros'
  });

  const cabecalho = primeira => {
    const altura = primeira ? 32 : 25;
    pdf.setFillColor(...azul);
    pdf.rect(0, 0, 210, altura, 'F');
    if (logo) pdf.addImage(logo, 'PNG', margem, primeira ? 7 : 5.5, primeira ? 40 : 31, primeira ? 13.4 : 10.4, undefined, 'FAST');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(primeira ? 13 : 10);
    pdf.text('SEGURO GARANTIA JUDICIAL', 194, primeira ? 14 : 11, { align: 'right' });
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(primeira ? 'SOLICITAÇÃO PARA ANÁLISE E COTAÇÃO' : `PROTOCOLO ${protocolo}`, 194, primeira ? 21 : 17, { align: 'right' });
    y = altura + 8;
  };

  const novaPagina = () => {
    pdf.addPage();
    cabecalho(false);
  };

  const garantirEspaco = altura => {
    if (y + altura > limiteInferior) novaPagina();
  };

  const textoSeguro = valor => {
    if (valor === null || valor === undefined || valor === '') return 'Não informado';
    return String(valor);
  };

  const prepararCampo = (rotulo, valor, largura) => {
    const texto = textoSeguro(valor);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    const linhas = pdf.splitTextToSize(texto, largura - 7);
    return { rotulo, linhas, vazio: texto === 'Não informado' };
  };

  const linhaCampos = campos => {
    const gap = 4;
    const largura = campos.length === 1 ? larguraUtil : (larguraUtil - gap) / 2;
    const preparados = campos.map(campo => prepararCampo(campo[0], campo[1], largura));
    const altura = Math.max(16, ...preparados.map(campo => 10 + campo.linhas.length * 4.1));
    garantirEspaco(altura + 4);

    preparados.forEach((campo, indice) => {
      const x = margem + indice * (largura + gap);
      pdf.setFillColor(...gelo);
      pdf.setDrawColor(...borda);
      pdf.roundedRect(x, y, largura, altura, 1.3, 1.3, 'FD');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...cinza);
      pdf.text(campo.rotulo.toUpperCase(), x + 3.5, y + 5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.setTextColor(...(campo.vazio ? cinza : grafite));
      pdf.text(campo.linhas, x + 3.5, y + 10.2);
    });
    y += altura + 4;
  };

  const secao = titulo => {
    /* Mantém o título junto de pelo menos uma linha de conteúdo. */
    garantirEspaco(34);
    y += 3;
    pdf.setFillColor(...ciano);
    pdf.rect(margem, y, 1.4, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(...azul);
    pdf.text(titulo, margem + 4.5, y + 5.2);
    pdf.setDrawColor(...borda);
    pdf.line(margem, y + 8.5, margem + larguraUtil, y + 8.5);
    y += 13;
  };

  cabecalho(true);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(...azul);
  pdf.text(`PROTOCOLO  ${protocolo}`, margem, y);
  pdf.setFont('helvetica', 'normal');
  pdf.setTextColor(...cinza);
  pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margem + larguraUtil, y, { align: 'right' });
  y += 7;

  secao('Resumo da solicitação');
  linhaCampos([['Número do processo', d.processo.numero], ['Natureza', d.naturezaRotulo]]);
  linhaCampos([['Importância segurada', money(d.garantia.importanciaSegurada)], ['Prazo fatal declarado pelo solicitante', dataPdf(d.entrega.prazo)]]);

  secao('Partes do processo');
  linhaCampos([['Segurado', d.autor.nome], ['Tipo e documento', `${d.autor.tipo} — ${textoSeguro(d.autor.documento)}`]]);
  linhaCampos([['Endereço do segurado', d.autor.endereco]]);
  if (d.menorIdade !== null) linhaCampos([['Envolve menor de idade', d.menorIdade], ['Representante legal', d.representante?.nome]]);
  if (d.representante) linhaCampos([['CPF do representante', d.representante.cpf]]);
  linhaCampos([['Tomador', d.reu.nome], ['CNPJ', d.reu.documento]]);
  linhaCampos([['Endereço do tomador', d.reu.endereco]]);

  secao('Dados do processo');
  linhaCampos([['Número CNJ', d.processo.numero], ['Ramo da Justiça', d.processo.ramo]]);
  linhaCampos([['Tribunal', d.processo.tribunal], ['Juízo / vara', d.processo.juizo]]);
  linhaCampos([['Ano', d.processo.ano], ['Tribunal Regional', d.processo.tribunalRegional]]);
  if (d.processo.numeroAdministrativo) linhaCampos([['Processo administrativo', d.processo.numeroAdministrativo]]);
  if (d.processo.numeroCda) linhaCampos([['Número da CDA', d.processo.numeroCda]]);

  secao('Garantia solicitada');
  if (d.natureza === 'recursal') {
    linhaCampos([['Tipo de recurso', d.garantia.tipoRecurso], ['Enquadramento', d.garantia.enquadramento]]);
    linhaCampos([['Depósito de tabela', money(d.garantia.depositoTabela)], ['Dispensa sumular', d.garantia.dispensaSumular ? 'Sim' : 'Não']]);
    linhaCampos([['Ajuste manual', d.garantia.ajusteManual ? money(d.garantia.ajusteManual) : 'Não aplicado'], ['Acréscimo de 30%', d.garantia.add30 ? 'Sim' : 'Não']]);
    linhaCampos([['Referência normativa', `${d.garantia.fonte?.ato || ''} — vigência ${d.garantia.fonte?.vigencia || ''}`]]);
  } else {
    linhaCampos([['Valor da causa', money(d.garantia.valorCausa)], ['Acréscimo de 30%', d.garantia.add30 ? 'Sim' : 'Não']]);
    linhaCampos([['Auto de infração', d.garantia.autoInfracao]]);
    linhaCampos([['Linha de defesa', d.garantia.linhaDefesa]]);
    linhaCampos([['Histórico do processo', d.garantia.historico]]);
  }
  linhaCampos([['Importância segurada', money(d.garantia.importanciaSegurada)]]);

  secao('Condições da garantia');
  linhaCampos([['Índice de atualização', d.indice], ['Probabilidade de êxito', d.exito]]);
  linhaCampos([['Objetivo da garantia', d.objetivo]]);
  linhaCampos([['Início da vigência', dataPdf(d.vigencia.inicio)], ['Fim da vigência', dataPdf(d.vigencia.fim)]]);
  linhaCampos([['Período', d.vigencia.anos ? `${d.vigencia.anos} ano(s)` : ''], ['Prazo fatal / processual', dataPdf(d.entrega.prazo)]]);

  secao('Advogado responsável');
  linhaCampos([['Nome', d.advogado.nome], ['OAB', `${d.advogado.oab || 'Não informada'} / ${d.advogado.uf || 'UF'}`]]);

  /* Fica antes da assinatura de propósito: é o texto que a assinatura logo
     abaixo endossa, e o PDF é o documento que o Hub arquiva. */
  secao('Prazo processual e responsabilidade');
  const declaracao = [
    'O controle e a observância do prazo processual/fatal são de responsabilidade do cliente e/ou de seus representantes legais.',
    'A solicitação deve ser encaminhada com antecedência suficiente para análise do risco, eventual complementação documental, aprovação e emissão da apólice.',
    'O preenchimento e o envio deste formulário não representam garantia de aprovação do risco nem de emissão da apólice dentro do prazo informado.'
  ];
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  const linhasDeclaracao = declaracao.flatMap(texto => pdf.splitTextToSize('•  ' + texto, larguraUtil - 7));
  const alturaDeclaracao = 8 + linhasDeclaracao.length * 4.1;
  garantirEspaco(alturaDeclaracao + 4);
  pdf.setFillColor(...gelo);
  pdf.setDrawColor(...borda);
  pdf.roundedRect(margem, y, larguraUtil, alturaDeclaracao, 1.3, 1.3, 'FD');
  pdf.setTextColor(...grafite);
  pdf.text(linhasDeclaracao, margem + 3.5, y + 6);
  y += alturaDeclaracao + 4;
  linhaCampos([['Ciência declarada pelo solicitante',
    d.entrega.cienciaPrazo ? 'Sim — aceite registrado no envio' : 'Não registrada']]);

  secao('Assinatura do responsável');
  garantirEspaco(38);
  pdf.setFillColor(255, 255, 255);
  pdf.setDrawColor(...borda);
  pdf.roundedRect(margem, y, larguraUtil, 31, 1.3, 1.3, 'FD');
  if (d.assinatura) pdf.addImage(d.assinatura, 'PNG', margem + 4, y + 2, 67, 23, undefined, 'FAST');
  pdf.setDrawColor(...cinza);
  pdf.line(margem + 4, y + 25, margem + 79, y + 25);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(...cinza);
  pdf.text('Assinatura fornecida eletronicamente no formulário', margem + 4, y + 29);

  const paginas = pdf.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina += 1) {
    pdf.setPage(pagina);
    pdf.setDrawColor(...borda);
    pdf.line(margem, 287, margem + larguraUtil, 287);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...cinza);
    pdf.text(`Lavoro Seguros  •  ${protocolo}`, margem, 292);
    pdf.text(`Página ${pagina} de ${paginas}`, margem + larguraUtil, 292, { align: 'right' });
  }

  const identificador = (d.processo.numero || protocolo).replace(/\D/g, '') || protocolo.replace(/[^a-z0-9-]/gi, '');
  const nomeArquivo = `proposta-garantia-${identificador}.pdf`;
  const resultado = { blob: pdf.output('blob'), nome: nomeArquivo, salvar: () => pdf.save(nomeArquivo) };
  if (baixar) resultado.salvar();
  return resultado;
}

/* Envio da proposta — sempre pelo Worker deste mesmo domínio. O navegador
   não conhece o endereço do Hub nem o token da autenticação servidor a
   servidor: daqui só existe /api/garantia-judicial/submit. */
async function enviarProposta(dados, protocolo, pdf, tokenSeguranca = '') {
  const corpo = new FormData();
  corpo.append('payload', JSON.stringify({
    protocolo,
    geradoEm: new Date().toISOString(),
    formulario: dados
  }));
  corpo.append('pdf', pdf.blob, pdf.nome);

  let response;
  try {
    /* Sem Content-Type à mão: o navegador monta o multipart e o boundary. */
    response = await fetch('/api/garantia-judicial/submit', {
      method: 'POST',
      ...(tokenSeguranca ? { headers: { 'X-Turnstile-Token': tokenSeguranca } } : {}),
      body: corpo,
      signal: AbortSignal.timeout(60000)
    });
  } catch (erro) {
    throw new Error(erro && erro.name === 'TimeoutError'
      ? 'O envio demorou mais do que o esperado. Tente novamente em instantes.'
      : 'Não foi possível enviar a proposta. Verifique a conexão e tente novamente.');
  }

  if (!(response.headers.get('Content-Type') || '').includes('application/json')) {
    throw new Error('O serviço de envio não está disponível neste endereço. Avise o responsável pelo formulário.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('O serviço de envio devolveu uma resposta inesperada. Tente novamente.'); }
  if (response.status === 429 && data.codigo === 'ENVIO_LIMITE_DIARIO') {
    const limite = Number.isInteger(data.limite) && data.limite > 0 ? data.limite : null;
    throw new Error(limite
      ? `Você atingiu o limite máximo de ${limite} envios por dia para esta rede. Tente novamente amanhã.`
      : (data.erro || 'Você atingiu o limite diário de envios. Tente novamente amanhã.'));
  }
  if (!response.ok) throw new Error(data.erro || 'Não foi possível enviar a proposta. Tente novamente.');
  return data;
}

function ligarEventos() {
  $$('input[name="natureza"]').forEach(r => r.addEventListener('change', () => {
    aplicarNatureza();
    sugerirNatureza(parseCnj($('#processo').value));
  }));
  $('#enquadramento').addEventListener('change', () => { calcularValores(); atualizarMedidor(); });
  $('#trt').addEventListener('change', atualizarMedidor);
  $('#add30Padrao').addEventListener('change', calcularValores);
  $('#add30Recursal').addEventListener('change', calcularValores);
  $('#recursoGroup').addEventListener('change', aplicarTipoRecurso);
  $('#aiDestranca').addEventListener('change', () => { calcularValores(); atualizarMedidor(); });
  $('#ai8').addEventListener('change', aplicarTipoRecurso);
  $('#vigInicio').addEventListener('change', () => { calcularVigencia(); atualizarMedidor(); });
  $('#vigAnos').addEventListener('change', () => { calcularVigencia(); atualizarMedidor(); });
  $('#prazoEntrega').addEventListener('change', () => { calcularPrazoEntrega(); atualizarMedidor(); });
  $('#menorIdadeGroup').addEventListener('change', () => { aplicarMenorIdade(); atualizarMedidor(); });
  $('#btnDataJud').addEventListener('click', consultarDataJud);

  $('#form').addEventListener('input', (e) => {
    if (e.target.classList.contains('input')) {
      marcarPreenchido(e.target);
      if (campoValido(e.target)) e.target.classList.remove('is-invalid');
    }
    atualizarMedidor();
  });

  $('#form').addEventListener('change', atualizarMedidor);

  /* revisar antes de enviar — sempre passa pela conferência */
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();

    validarDocumentosPartes(true);
    const falta = primeiroInvalido();
    if (falta) {
      apontarInvalidos();
      const bloco = falta.closest('.block');
      if (bloco) bloco.scrollIntoView({ block: 'start' });
      (falta.type === 'radio' ? falta : falta).focus({ preventScroll: true });
      const nota = $('#actionsNote');
      nota.textContent = 'Há campos obrigatórios em branco ou inválidos. Eles estão destacados.';
      nota.className = 'actions-note';
      return;
    }

    if (!assinatura || assinatura.isEmpty()) {
      $('#signatureField').classList.add('is-invalid');
      $('#signatureStatus').textContent = 'Faça sua assinatura antes de revisar.';
      $('#s7').scrollIntoView({ block: 'start' });
      $('#signatureCanvas').focus({ preventScroll: true });
      return;
    }

    $('#modalBody').innerHTML = montarConferencia(coletar());
    $('#confirmCheck').checked = false;
    $('#cienciaPrazoCheck').checked = false;
    $('#btnEnviar').disabled = true;
    abrirModal('scrim');
    renderizarTurnstile();
  });

  $('#confirmCheck').addEventListener('change', atualizarBotaoEnvio);
  $('#cienciaPrazoCheck').addEventListener('change', atualizarBotaoEnvio);

  $('#btnVoltar').addEventListener('click', () => fecharModal('scrim'));

  $('#scrim').addEventListener('mousedown', (e) => {
    if (e.target === $('#scrim')) fecharModal('scrim');
  });

  $('#btnEnviar').addEventListener('click', async () => {
    const botao = $('#btnEnviar');
    if (botao.disabled) return;          /* clique repetido não envia de novo */
    const voltar = $('#btnVoltar');
    const status = $('#envioStatus');
    const rotulo = botao.textContent;

    const d = coletar();
    propostaAtual = d;
    pdfAtual = null;

    const protocolo = 'LV-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') +
                      '-' + String(Math.floor(Math.random() * 9000) + 1000);
    protocoloAtual = protocolo;

    /* O recibo só aparece depois que o Worker confirma o recebimento. Em
       qualquer falha o formulário continua preenchido e o botão volta. */
    const liberar = (mensagem) => {
      setHint(status, mensagem || '', mensagem ? 'error' : undefined);
      botao.textContent = rotulo;
      voltar.disabled = false;
      atualizarBotaoEnvio();
    };

    botao.disabled = true;
    voltar.disabled = true;
    botao.textContent = 'Enviando…';
    setHint(status, 'Gerando o PDF e enviando a proposta…', 'load');

    let pdf;
    try {
      /* Gera em memória: enviar nunca deve iniciar um download no dispositivo. */
      pdf = await gerarPdf(d, protocolo, { baixar: false });
    } catch (erro) {
      console.error(erro);
      liberar('Não foi possível gerar o PDF da proposta. Tente novamente; se continuar, avise o responsável pelo formulário.');
      return;
    }

    try {
      await enviarProposta(d, protocolo, pdf, turnstileToken);
    } catch (erro) {
      console.error(erro);
      reiniciarTurnstile();
      liberar((erro && erro.message) || 'Não foi possível enviar a proposta. Tente novamente.');
      return;
    }

    /* O botão de download reutiliza exatamente o documento aceito pelo Hub. */
    pdfAtual = pdf;

    liberar('');
    $('#okProtocolo').textContent = protocolo;
    $('#okProcesso').textContent = d.processo.numero || '—';
    $('#okValor').textContent = money(d.garantia.importanciaSegurada);

    fecharModal('scrim');
    abrirModal('scrimOk');
    reiniciarTurnstile();
  });

  $('#btnFechar').addEventListener('click', () => fecharModal('scrimOk'));

  $('#btnBaixar').addEventListener('click', async () => {
    try {
      if (pdfAtual) pdfAtual.salvar();
      else await gerarPdf(propostaAtual || coletar(), protocoloAtual);
    } catch (erro) {
      console.error(erro);
      alert('Não foi possível gerar o PDF. Recarregue a página e tente novamente.');
    }
  });

  $('#btnLimpar').addEventListener('click', () => {
    if (!confirm('Limpar todos os campos do formulário?')) return;
    $('#form').reset();
    $$('[data-date-br="true"]').forEach(campo => {
      campo.value = '';
      delete campo.dataset.iso;
      campo.setCustomValidity('');
    });
    $$('.input-money').forEach(el => { el.dataset.cents = '0'; });
    $$('.input').forEach(el => el.classList.remove('is-filled', 'is-invalid'));
    $$('.hint[data-status], #dataJudStatus').forEach(el => setHint(el, ''));
    if (assinatura) assinatura.clear();
    pdfAtual = null;
    propostaAtual = null;
    protocoloAtual = '';
    reiniciarTurnstile();
    $('#signaturePlaceholder').hidden = false;
    $('#signatureField').classList.remove('is-invalid');
    $('#signatureStatus').textContent = 'A assinatura é obrigatória para enviar.';
    definirDataHoje();
    renderDecoder();
    aplicarNatureza();
    calcularPrazoEntrega();
    window.scrollTo({ top: 0 });
  });
}

/* ── Tela 1 · identificação do responsável ───────────────────── */

function campoValidoGate(el) {
  if (el.id === 'respEmail') return EMAIL_RE.test(el.value.trim());
  if (el.id === 'respTelefone') return digits(el.value).length >= 10;
  return el.value.trim() !== '';
}

function ligarGate() {
  const form = $('#gateForm');
  const nota = $('#gateNote');

  $('#respTelefone').addEventListener('input', (e) => {
    e.target.value = maskTelefone(e.target.value);
  });

  form.addEventListener('input', (e) => {
    if (!e.target.classList.contains('input')) return;
    marcarPreenchido(e.target);
    if (campoValidoGate(e.target)) e.target.classList.remove('is-invalid');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const campos = $$('[data-required]', form);
    campos.forEach(el => el.classList.toggle('is-invalid', !campoValidoGate(el)));
    const invalido = campos.find(el => !campoValidoGate(el));

    if (invalido) {
      invalido.focus();
      nota.textContent = invalido.id === 'respEmail' ? 'Informe um e-mail válido.'
        : invalido.id === 'respTelefone' ? 'Informe um telefone com DDD.'
        : 'Preencha os campos para continuar.';
      return;
    }

    responsavel = {
      empresa: $('#respEmpresa').value.trim(),
      nome: $('#respNome').value.trim(),
      email: $('#respEmail').value.trim(),
      telefone: $('#respTelefone').value.trim()
    };

    $('#gateSheet').hidden = true;
    $('#formSheet').hidden = false;
    /* A área de assinatura foi criada com a folha oculta. No próximo quadro,
       o layout já tem dimensões reais e o canvas pode ser ajustado com segurança. */
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    window.scrollTo({ top: 0 });
  });
}

function definirDataHoje() {
  const hoje = new Date();
  const iso = hoje.toISOString().slice(0, 10);
  const campo = $('#vigInicio');
  campo.value = dataBrDaIso(iso);
  campo.dataset.iso = iso;
}

/* ── partida ─────────────────────────────────────────────────── */

function iniciar() {
  configurarTurnstile();
  ligarGate();
  montarUfs();
  montarTrts();
  montarRecursos();
  iniciarAssinatura();
  ligarMascaras();
  ligarEventos();
  ligarIndice();
  definirDataHoje();
  renderDecoder();
  aplicarNatureza();
  calcularPrazoEntrega();
  $('.index a[data-idx="s1"]').classList.add('is-active');
}

document.addEventListener('DOMContentLoaded', iniciar);
