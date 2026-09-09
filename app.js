/* ═══════════════════════════════════════════════════════════════
   Formulário Seguro Garantia — Lavoro Seguros
   Sem dependências. Tudo roda no navegador.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

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

/* ───────────────────────────────────────────────────────────────
   5 · CONSULTA DE CNPJ EM BASE PÚBLICA
   BrasilAPI como primária; CNPJ.ws como reserva.
   ─────────────────────────────────────────────────────────────── */

const CAMPOS_PARTE = {
  autor: { doc: '#autorDoc', nome: '#autorNome', end: '#autorEndereco' },
  reu:   { doc: '#reuDoc',   nome: '#reuNome',   end: '#reuEndereco'   }
};

const limpar = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/* A base da Receita traz três armadilhas neste trecho:
   o número repetido dentro do logradouro ("PAULISTA 37" com numero "37"),
   o "SN" no lugar de sem número, e o tipo de via já embutido no logradouro
   ("QUADRA" + "SAUN QUADRA 5 BLOCO B"). */
function comporLogradouro(tipo, via, numero) {
  let nome = limpar(via);
  const num = limpar(numero);
  const semNumero = /^S\/?N$/i.test(num);

  if (num && !semNumero) {
    const escapado = num.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    nome = nome.replace(new RegExp('[,\\s]+' + escapado + '$'), '').trim();
  }

  let via1 = limpar(tipo);
  if (via1 && new RegExp('(^|\\s)' + via1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)', 'i').test(nome)) {
    via1 = '';
  }

  const cabeca = [via1, nome].filter(Boolean).join(' ').trim();
  const cauda = !num ? '' : (semNumero ? 's/n' : num);
  return [cabeca, cauda].filter(Boolean).join(', ');
}

function montarEndereco(o) {
  const via = comporLogradouro(o.tipo, o.logradouro, o.numero);
  const cep = digits(o.cep);
  return [
    [via, limpar(o.complemento)].filter(Boolean).join(' — '),
    limpar(o.bairro),
    [limpar(o.municipio), limpar(o.uf)].filter(Boolean).join('/'),
    cep.length === 8 ? 'CEP ' + cep.replace(/^(\d{5})(\d{3})$/, '$1-$2') : ''
  ].filter(Boolean).join(' — ');
}

/* BrasilAPI e minhareceita.org devolvem o mesmo esquema: um parser serve às duas. */
function lerEsquemaPlano(d, fonte) {
  return {
    razao: limpar(d.razao_social) || limpar(d.nome_fantasia),
    fantasia: limpar(d.nome_fantasia),
    situacao: limpar(d.descricao_situacao_cadastral),
    endereco: montarEndereco({
      tipo: d.descricao_tipo_de_logradouro, logradouro: d.logradouro, numero: d.numero,
      complemento: d.complemento, bairro: d.bairro,
      municipio: d.municipio, uf: d.uf, cep: d.cep
    }),
    fonte
  };
}

async function pedir(url, fonte) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (r.status === 404) throw new Error('CNPJ não encontrado na Receita.');
  if (r.status === 429) throw new Error(fonte + ' recusou por excesso de consultas.');
  if (!r.ok) throw new Error(fonte + ' respondeu ' + r.status + '.');
  return r.json();
}

async function viaBrasilApi(cnpj) {
  return lerEsquemaPlano(
    await pedir(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, 'BrasilAPI'), 'BrasilAPI');
}

async function viaMinhaReceita(cnpj) {
  return lerEsquemaPlano(
    await pedir(`https://minhareceita.org/${cnpj}`, 'Minha Receita'), 'Minha Receita');
}

/* Reserva de último recurso: 3 consultas por minuto por IP. */
async function viaCnpjWs(cnpj) {
  const d = await pedir(`https://publica.cnpj.ws/cnpj/${cnpj}`, 'CNPJ.ws');
  const e = d.estabelecimento || {};
  return {
    razao: limpar(d.razao_social),
    fantasia: limpar(e.nome_fantasia),
    situacao: limpar(e.situacao_cadastral),
    endereco: montarEndereco({
      tipo: e.tipo_logradouro, logradouro: e.logradouro, numero: e.numero,
      complemento: e.complemento, bairro: e.bairro,
      municipio: e.cidade && e.cidade.nome,
      uf: e.estado && e.estado.sigla, cep: e.cep
    }),
    fonte: 'CNPJ.ws'
  };
}

async function buscarCnpj(parte) {
  const map = CAMPOS_PARTE[parte];
  const campoDoc = $(map.doc);
  const status = $(`[data-status="${parte}"]`);
  const botao = $(`[data-lookup="${parte}"]`);
  const cnpj = digits(campoDoc.value);

  if (cnpj.length !== 14) {
    setHint(status, 'Informe os 14 dígitos do CNPJ.', 'error');
    return;
  }

  botao.disabled = true;
  setHint(status, 'Consultando a base pública…', 'load');

  let dados = null, erro = null;
  for (const consulta of [viaBrasilApi, viaMinhaReceita, viaCnpjWs]) {
    try { dados = await consulta(cnpj); break; }
    catch (e) { erro = e; if (/não encontrado/i.test(e.message)) break; }
  }

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
    `${dados.fonte}: ${dados.razao}` +
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
    setHint(status, 'Abra o formulário pelo link publicado para consultar o CNJ.', 'warn');
    return;
  }

  botao.disabled = true;
  setHint(status, 'Consultando ' + alias.toUpperCase() + ' na base do CNJ…', 'load');
  try {
    const response = await fetch('/api/datajud', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numeroProcesso: numero }),
      signal: AbortSignal.timeout(20000)
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
      setHint(status, 'Processo não encontrado na base do CNJ. Confira o número ou preencha os campos manualmente.', 'warn');
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

function preencherComDataJud(fontes, via) {
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
        ? 'Graus na base do CNJ: ' + porGrau.map(s => s.grau).filter(Boolean).join(', ')
        : ''
    ].filter(Boolean);

    $('#historico').value = [...cabecalho, '', 'Últimas movimentações:', ...linhas].join('\n');
    marcarPreenchido($('#historico'));
    trazidos.push(`${linhas.length} movimentações`);
  }

  const rota = via && via.rotulo ? ' (via ' + via.rotulo + ')' : '';
  setHint(status,
    trazidos.length
      ? 'Trazido do CNJ' + rota + ': ' + trazidos.join(' e ') +
        '. Confira antes de enviar — a base não traz partes nem valor da causa.'
      : 'O CNJ respondeu' + rota + ', mas os campos já estavam preenchidos. Nada foi sobrescrito.',
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

  alterna('#valorCausa', !!nat && !recursal);
  alterna('#indice', !!nat);
  alterna('#objetivo', !!nat);
  ['#enquadramento', '#trt'].forEach(s => alterna(s, recursal));
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

  /* vigência mínima: 3 anos, salvo garantia fiscal, que pede 5 */
  const fiscal = nat === 'tributario';
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
   9 · VIGÊNCIA
   ─────────────────────────────────────────────────────────────── */

function calcularVigencia() {
  const inicio = $('#vigInicio').value;
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

/* ───────────────────────────────────────────────────────────────
   10 · VALIDAÇÃO E MEDIDOR
   ─────────────────────────────────────────────────────────────── */

function campoValido(el) {
  if (el.type === 'radio') {
    return $$(`input[name="${el.name}"]`).some(r => r.checked);
  }
  if (el.classList.contains('input-money')) return centavosDe(el) > 0;
  /* a confirmação só vale quando repete o número; digitado errado, barra o envio */
  if (el.id === 'processoConf') {
    const b = digits(el.value);
    return b !== '' && b === digits($('#processo').value);
  }
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

  const faltam = lista.length - ok;
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
  ['s1','s2','s3','s4','s5','s6'].forEach(id => {
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
    link.classList.toggle('is-done', lista.length > 0 && lista.every(campoValido));
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

  return {
    natureza: nat,
    naturezaRotulo: rotuloNat,
    autor: {
      tipo: ($$('input[name="autorTipo"]').find(r => r.checked) || {}).value === 'PF'
        ? 'Pessoa física' : 'Pessoa jurídica',
      documento: $('#autorDoc').value,
      nome: $('#autorNome').value.trim(),
      endereco: $('#autorEndereco').value.trim()
    },
    reu: {
      documento: $('#reuDoc').value,
      nome: $('#reuNome').value.trim(),
      endereco: $('#reuEndereco').value.trim()
    },
    processo: {
      numero: $('#processo').value,
      confirmacao: $('#processoConf').value,
      digitoConfere: p.completo ? digitoCnj(p) === p.digito : null,
      ramo: SEGMENTOS[p.segmento] || '',
      tribunal: nomeTribunal(p) || '',
      ano: p.ano,
      juizo: $('#juizoNome').value.trim()
    },
    garantia: recursal ? {
      tipoRecurso: recursal ? depositoDeTabela().rotulo : '',
      depositoTabela: recursal ? depositoDeTabela().cents : null,
      dispensaSumular: $('#ai8').checked,
      enquadramento: ENQUADRAMENTO[enqKey].rotulo,
      trt: trtSel.value ? trtSel.options[trtSel.selectedIndex].text : '',
      vara: $('#juizoNome').value.trim(),
      add30: $('#add30Recursal').checked,
      ajusteManual: centavosDe($('#valorGarantiaManual')) || null,
      importanciaSegurada: total,
      fonte: DEPOSITO_RECURSAL.fonte
    } : {
      valorCausa: centavosDe($('#valorCausa')),
      add30: $('#add30Padrao').checked,
      importanciaSegurada: total,
      procedimentoAdministrativo: $('#numAdministrativo').value.trim(),
      autoInfracao: $('#numAutoInfracao').value.trim(),
      linhaDefesa: $('#linhaDefesa').value.trim(),
      historico: $('#historico').value.trim()
    },
    indice: $('#indice').value,
    objetivo: $('#objetivo').value.trim(),
    vigencia: {
      inicio: $('#vigInicio').value,
      anos: Number($('#vigAnos').value) || null,
      fim: fim ? fim.toISOString().slice(0, 10) : ''
    },
    exito: ($$('input[name="exito"]').find(r => r.checked) || {}).value || '',
    advogado: {
      nome: $('#advNome').value.trim(),
      oab: $('#advOab').value.trim(),
      uf: $('#advUf').value
    }
  };
}

function linhaRevisao(k, v, classe) {
  const vazio = v === '' || v === null || v === undefined;
  return `<div class="review-item">
      <span class="review-k">${k}</span>
      <span class="review-v ${vazio ? 'is-empty' : (classe || '')}">${vazio ? 'não informado' : v}</span>
    </div>`;
}

function montarConferencia(d) {
  const g = (titulo, linhas) =>
    `<div class="review-group"><h3>${titulo}</h3>${linhas.join('')}</div>`;

  const blocos = [];

  blocos.push(g('Partes', [
    linhaRevisao('Autor / segurado', d.autor.nome),
    linhaRevisao(d.autor.tipo === 'Pessoa física' ? 'CPF' : 'CNPJ', d.autor.documento, 'mono'),
    linhaRevisao('Endereço', d.autor.endereco),
    linhaRevisao('Réu / tomador', d.reu.nome),
    linhaRevisao('CNPJ', d.reu.documento, 'mono'),
    linhaRevisao('Endereço', d.reu.endereco)
  ]));

  blocos.push(g('Processo', [
    linhaRevisao('Número', d.processo.numero, 'mono'),
    linhaRevisao('Ramo da Justiça', d.processo.ramo),
    linhaRevisao('Tribunal', d.processo.tribunal),
    linhaRevisao('Juízo / vara', d.processo.juizo),
    linhaRevisao('Natureza', d.naturezaRotulo)
  ]));

  if (d.natureza === 'recursal') {
    blocos.push(g('Garantia recursal', [
      linhaRevisao('Tipo de recurso', d.garantia.tipoRecurso),
      linhaRevisao('Depósito de tabela',
        d.garantia.depositoTabela != null ? money(d.garantia.depositoTabela) : '', 'is-money'),
      linhaRevisao('Enquadramento', d.garantia.enquadramento),
      linhaRevisao('Acréscimo de 30%', d.garantia.add30 ? 'sim' : 'não'),
      linhaRevisao('Tribunal Regional', d.garantia.trt),
      linhaRevisao('Importância segurada', money(d.garantia.importanciaSegurada), 'is-money')
    ]));
  } else {
    blocos.push(g('Garantia', [
      linhaRevisao('Valor da causa', money(d.garantia.valorCausa), 'is-money'),
      linhaRevisao('Acréscimo de 30%', d.garantia.add30 ? 'sim' : 'não'),
      linhaRevisao('Importância segurada', money(d.garantia.importanciaSegurada), 'is-money'),
      linhaRevisao('Procedimento administrativo', d.garantia.procedimentoAdministrativo, 'mono'),
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
    linhaRevisao('Probabilidade de êxito', d.exito)
  ]));

  blocos.push(g('Advogado', [
    linhaRevisao('Nome', d.advogado.nome),
    linhaRevisao('OAB', `${d.advogado.oab}${d.advogado.uf ? ' / ' + d.advogado.uf : ''}`, 'mono')
  ]));

  /* pontos que merecem um olhar antes de seguir */
  const avisos = [];
  if (d.processo.digitoConfere === false)
    avisos.push('O dígito verificador do número do processo não confere.');
  if (digits(d.processo.numero) !== digits(d.processo.confirmacao))
    avisos.push('Número do processo e confirmação estão diferentes.');
  if (d.autor.nome && d.reu.nome && d.autor.nome === d.reu.nome)
    avisos.push('Autor e réu estão com o mesmo nome.');
  if (d.garantia.importanciaSegurada === 0)
    avisos.push('A importância segurada está em R$ 0,00.');
  if (d.natureza === 'recursal' && d.garantia.ajusteManual)
    avisos.push('A importância segurada foi informada à mão, fora da tabela.');
  if (d.natureza !== 'recursal' && !d.garantia.add30)
    avisos.push('O acréscimo de 30% não foi marcado.');
  if (!DEPOSITO_RECURSAL.fonte.confirmado && d.natureza === 'recursal')
    avisos.push('A tabela de depósito recursal em app.js ainda não foi atualizada.');

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
    const pf = ($$('input[name="autorTipo"]').find(r => r.checked) || {}).value === 'PF';
    const campo = $('#autorDoc');
    const botao = $('#autorBuscar');

    $$('[data-doclabel="autor"]').forEach(el => { el.textContent = pf ? 'CPF' : 'CNPJ'; });
    campo.placeholder = pf ? '000.000.000-00' : '00.000.000/0000-00';
    campo.value = pf ? maskCpf(campo.value) : maskCnpj(campo.value);
    botao.hidden = pf;
    setHint($('[data-status="autor"]'),
      pf ? 'Pessoa física: preencha nome e endereço à mão.' : '', pf ? null : null);
  };

  $$('input[name="autorTipo"]').forEach(r => r.addEventListener('change', aplicarMascaraAutor));
  aplicarMascaraAutor();

  $('#autorDoc').addEventListener('input', (e) => {
    const pf = ($$('input[name="autorTipo"]').find(r => r.checked) || {}).value === 'PF';
    e.target.value = pf ? maskCpf(e.target.value) : maskCnpj(e.target.value);
    if (!pf && digits(e.target.value).length === 14) buscarCnpj('autor');
  });

  [['#reuDoc', 'reu']].forEach(([sel, parte]) => {
    $(sel).addEventListener('input', (e) => {
      e.target.value = maskCnpj(e.target.value);
      if (digits(e.target.value).length === 14) buscarCnpj(parte);
    });
  });

  $$('[data-lookup]').forEach(b => {
    b.addEventListener('click', () => buscarCnpj(b.dataset.lookup));
  });

  /* número do processo */
  $$('.input-cnj').forEach(el => {
    el.addEventListener('input', (e) => {
      e.target.value = maskCnj(e.target.value);
      if (e.target.id === 'processo') {
        sugerirNatureza(renderDecoder());
      }
      conferirNumero();
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

  $('#advOab').addEventListener('input', (e) => {
    e.target.value = digits(e.target.value).slice(0, 8);
  });
}

function conferirNumero() {
  const a = digits($('#processo').value);
  const b = digits($('#processoConf').value);
  const st = $('#confStatus');

  if (!b) { setHint(st, ''); }
  else if (a === b) { setHint(st, 'Os números coincidem.', 'ok'); }
  else if (a.startsWith(b)) { setHint(st, 'Continue digitando.', 'load'); }
  else { setHint(st, 'Diferente do número informado acima.', 'error'); }

  $('#processoConf').classList.toggle('is-invalid', !!b && !a.startsWith(b));
  atualizarMedidor();
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

  ['s1','s2','s3','s4','s5','s6'].forEach(id => {
    const el = $('#' + id);
    if (el) obs.observe(el);
  });
}

/* ── eventos gerais ──────────────────────────────────────────── */

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
  $('#btnDataJud').addEventListener('click', consultarDataJud);

  $('#form').addEventListener('input', (e) => {
    if (e.target.classList.contains('input')) {
      marcarPreenchido(e.target);
      /* campos com validação própria (a confirmação do número) cuidam do
         próprio alerta; estar preenchido não basta para limpá-lo */
      if (campoValido(e.target) && !e.target.hasAttribute('data-selfcheck')) {
        e.target.classList.remove('is-invalid');
      }
    }
    atualizarMedidor();
  });

  $('#form').addEventListener('change', atualizarMedidor);

  /* revisar antes de enviar — sempre passa pela conferência */
  $('#form').addEventListener('submit', (e) => {
    e.preventDefault();

    const falta = primeiroInvalido();
    if (falta) {
      apontarInvalidos();
      const bloco = falta.closest('.block');
      if (bloco) bloco.scrollIntoView({ block: 'start' });
      (falta.type === 'radio' ? falta : falta).focus({ preventScroll: true });
      const nota = $('#actionsNote');
      nota.textContent = 'Há campos obrigatórios em branco. Eles estão destacados.';
      nota.className = 'actions-note';
      return;
    }

    $('#modalBody').innerHTML = montarConferencia(coletar());
    $('#confirmCheck').checked = false;
    $('#btnEnviar').disabled = true;
    abrirModal('scrim');
  });

  $('#confirmCheck').addEventListener('change', (e) => {
    $('#btnEnviar').disabled = !e.target.checked;
  });

  $('#btnVoltar').addEventListener('click', () => fecharModal('scrim'));

  $('#scrim').addEventListener('mousedown', (e) => {
    if (e.target === $('#scrim')) fecharModal('scrim');
  });

  $('#btnEnviar').addEventListener('click', () => {
    const d = coletar();
    window.__proposta = d;

    const protocolo = 'LV-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') +
                      '-' + String(Math.floor(Math.random() * 9000) + 1000);

    $('#okProtocolo').textContent = protocolo;
    $('#okProcesso').textContent = d.processo.numero || '—';
    $('#okValor').textContent = money(d.garantia.importanciaSegurada);

    fecharModal('scrim');
    abrirModal('scrimOk');
  });

  $('#btnFechar').addEventListener('click', () => fecharModal('scrimOk'));

  $('#btnBaixar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(coletar(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'proposta-seguro-garantia.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#btnLimpar').addEventListener('click', () => {
    if (!confirm('Limpar todos os campos do formulário?')) return;
    $('#form').reset();
    $$('.input-money').forEach(el => { el.dataset.cents = '0'; });
    $$('.input').forEach(el => el.classList.remove('is-filled', 'is-invalid'));
    $$('.hint[data-status], #confStatus').forEach(el => setHint(el, ''));
    definirDataHoje();
    renderDecoder();
    aplicarNatureza();
    window.scrollTo({ top: 0 });
  });
}

function definirDataHoje() {
  const hoje = new Date();
  $('#vigInicio').value = hoje.toISOString().slice(0, 10);
}

/* ── partida ─────────────────────────────────────────────────── */

function iniciar() {
  montarUfs();
  montarTrts();
  montarRecursos();
  ligarMascaras();
  ligarEventos();
  ligarIndice();
  definirDataHoje();
  renderDecoder();
  aplicarNatureza();
  $('.index a[data-idx="s1"]').classList.add('is-active');
}

document.addEventListener('DOMContentLoaded', iniciar);
