import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';

// O Hub roda em Lovable, que exige o prefixo /api/public/ nas rotas abertas.
const DESTINO = 'https://hub.example/api/public/garantia-judicial-submit';
const TOKEN = 'hub-token-only-for-tests';
const ROTA = 'https://formulario.example/api/garantia-judicial/submit';

// Payload sintético: os testes não usam dados nem processos reais.
const formularioValido = () => ({
  autor: { tipo: 'Pessoa jurídica', documento: '11.222.333/0001-81' },
  reu: { documento: '11.444.777/0001-61' },
  processo: { numero: '0001' }
});
const payload = (formulario = formularioValido()) => JSON.stringify({ protocolo: 'LV-260915-1234', formulario });
const pdf = (conteudo = '%PDF-1.4 conteudo de teste') => new Blob([conteudo], { type: 'application/pdf' });

const env = () => ({
  HUB_SUBMIT_URL: DESTINO,
  HUB_WEBHOOK_SECRET: TOKEN,
  RATE_LIMIT_SALT: 'salt-only-for-tests',
  DATAJUD_APIKEY: 'test-only-placeholder',
  DATAJUD_RATE_LIMITER: { limit: async () => ({ success: true }) },
  ENVIO_DIARIO_LIMITER: {
    idFromName: chave => chave,
    get: () => ({ fetch: async () => Response.json({ permitido: true, restantes: 29 }) })
  },
  ASSETS: { fetch: async () => new Response('formulario') }
});

function request({ comPayload = true, comPdf = true, arquivo = pdf(), corpo = null, headers = {}, method = 'POST' } = {}) {
  let body = corpo;
  if (body === null) {
    body = new FormData();
    if (comPayload) body.append('payload', payload());
    if (comPdf) body.append('pdf', arquivo, 'proposta-garantia-0001.pdf');
  }
  return new Request(ROTA, {
    method,
    headers: { Origin: 'https://formulario.example', 'CF-Connecting-IP': '203.0.113.10', ...headers },
    body
  });
}

function corpoComFormulario(formulario) {
  const corpo = new FormData();
  corpo.append('payload', payload(formulario));
  corpo.append('pdf', pdf(), 'proposta-garantia-0001.pdf');
  return corpo;
}

test('encaminha proposta e PDF ao Hub com token apenas no servidor', async t => {
  let recebido = null;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, DESTINO);
    assert.equal(options.method, 'POST');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, 'Bearer ' + TOKEN);
    // Content-Type e boundary são do runtime: defini-los à mão quebraria o multipart.
    assert.equal(options.headers['Content-Type'], undefined);
    assert.ok(options.body instanceof FormData);
    recebido = { payload: options.body.get('payload'), arquivo: options.body.get('pdf') };
    return Response.json({ id: 'hub-123' }, { status: 201 });
  });

  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { recebido: true, referencia: 'hub-123' });
  assert.equal(fetchMock.mock.callCount(), 1);
  // O Hub exige payload como campo de texto: como arquivo ele responde 400 payload_ausente.
  assert.equal(typeof recebido.payload, 'string');
  assert.equal(recebido.payload, payload());
  assert.equal(await recebido.arquivo.text(), '%PDF-1.4 conteudo de teste');
  assert.equal(recebido.arquivo.name, 'proposta-garantia-0001.pdf');
});

/* O caminho do Hub vive só em HUB_SUBMIT_URL: trocá-lo é mexer na variável do
   painel, nunca no código. O Worker usa a URL como veio, com prefixo e tudo. */
test('usa o caminho de HUB_SUBMIT_URL como veio, sem reescrever nem completar', async t => {
  const caminhos = [
    'https://hub.example/api/public/garantia-judicial-submit',
    'https://hub.example/api/garantia-judicial-submit',
    'https://hub.example/funcoes/v2/proposta?origem=formulario'
  ];
  for (const destino of caminhos) {
    const mock = t.mock.method(globalThis, 'fetch', async url => {
      assert.equal(url, destino);
      return Response.json({ id: 'ok' }, { status: 200 });
    });
    const response = await worker.fetch(request(), { ...env(), HUB_SUBMIT_URL: destino });
    assert.equal(response.status, 200);
    assert.equal(mock.mock.callCount(), 1);
    mock.mock.restore();
  }
});

test('aceita qualquer 2xx do Hub como recebimento confirmado', async t => {
  for (const status of [200, 201, 202, 204]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status }));
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { recebido: true });
    mock.mock.restore();
  }
});

test('rejeita envio inválido do navegador antes de falar com o Hub', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });

  // payload anexado como arquivo vira File, não string: recusado antes de sair daqui.
  const payloadArquivo = new FormData();
  payloadArquivo.append('payload', new Blob([payload()], { type: 'application/json' }), 'payload.json');
  payloadArquivo.append('pdf', pdf(), 'p.pdf');

  const semJson = new FormData();
  semJson.append('payload', 'isto não é json');
  semJson.append('pdf', pdf(), 'p.pdf');

  const cases = [
    [new Request(ROTA, { headers: { Origin: 'https://formulario.example' } }), 405],
    [request({ comPdf: false }), 400],
    [request({ comPayload: false }), 400],
    [request({ corpo: new FormData() }), 400],
    [request({ corpo: semJson }), 400],
    [request({ corpo: payloadArquivo }), 400],
    [request({ arquivo: new Blob(['GIF89a nao e pdf'], { type: 'application/pdf' }) }), 400],
    [request({ arquivo: new Blob([], { type: 'application/pdf' }) }), 400],
    [request({ corpo: '{"payload":1}', headers: { 'Content-Type': 'application/json' } }), 415],
    [request({ headers: { Origin: 'https://other.example' } }), 403]
  ];
  for (const [req, status] of cases) assert.equal((await worker.fetch(req, env())).status, status);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('responde 405 com Allow em método diferente de POST', async () => {
  const response = await worker.fetch(new Request(ROTA, { headers: { Origin: 'https://formulario.example' } }), env());
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('para o envio quando falta configuração, sem expor o token', async t => {
  const logs = t.mock.method(console, 'warn', () => {});
  const nunca = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });
  const configuracoes = [
    {},
    { HUB_SUBMIT_URL: DESTINO },
    { HUB_WEBHOOK_SECRET: TOKEN },
    { HUB_SUBMIT_URL: 'http://hub.example/entrada', HUB_WEBHOOK_SECRET: TOKEN },
    { HUB_SUBMIT_URL: 'nao-e-url', HUB_WEBHOOK_SECRET: TOKEN },
    { HUB_SUBMIT_URL: DESTINO, HUB_WEBHOOK_SECRET: 'Bearer ' + TOKEN }
  ];
  for (const parcial of configuracoes) {
    const config = { ...env(), HUB_SUBMIT_URL: undefined, HUB_WEBHOOK_SECRET: undefined, ...parcial };
    const response = await worker.fetch(request(), config);
    assert.equal(response.status, 503);
    const texto = await response.text();
    assert.ok(texto.includes('HUB_CONFIG'));
    assert.ok(!texto.includes(TOKEN));
  }
  assert.equal(nunca.mock.callCount(), 0);
  assert.ok(!JSON.stringify(logs.mock.calls.map(call => call.arguments)).includes(TOKEN));
});

test('traduz falhas do Hub sem repassar detalhes internos nem segredos', async t => {
  const logs = t.mock.method(console, 'warn', () => {});
  const cases = [
    [async () => new Response('detalhe-interno', { status: 400 }), 502, 'HUB_REJECTED'],
    [async () => new Response('detalhe-interno', { status: 401 }), 502, 'HUB_AUTH'],
    [async () => new Response('detalhe-interno', { status: 403 }), 502, 'HUB_AUTH'],
    [async () => new Response('detalhe-interno', { status: 429 }), 429, 'HUB_RATE_LIMIT'],
    [async () => new Response('detalhe-interno', { status: 500 }), 502, 'HUB_UPSTREAM'],
    [async () => new Response('detalhe-interno', { status: 503 }), 502, 'HUB_UPSTREAM'],
    [async () => new Response(null, { status: 302, headers: { Location: 'https://outro.example/' } }), 502, 'HUB_REDIRECT'],
    [async () => { throw new TypeError('detalhe-interno'); }, 502, 'HUB_CONNECTION'],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504, 'HUB_TIMEOUT']
  ];
  for (const [fetch, status, codigo] of cases) {
    const mock = t.mock.method(globalThis, 'fetch', fetch);
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, status);
    const mensagem = (await response.json()).erro;
    assert.ok(mensagem.includes(codigo));
    assert.ok(!mensagem.includes('detalhe-interno'));
    assert.ok(!mensagem.includes(TOKEN));
    mock.mock.restore();
  }
  const registrado = JSON.stringify(logs.mock.calls.map(call => call.arguments));
  for (const valor of [TOKEN, 'detalhe-interno', 'LV-260915-1234', DESTINO]) {
    assert.ok(!registrado.includes(valor), 'não pode registrar ' + valor);
  }
});

test('aplica o limite de chamadas ao envio sem encaminhar nada', async t => {
  const nunca = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });
  const chaves = [];
  const config = env();
  config.DATAJUD_RATE_LIMITER = { limit: async ({ key }) => { chaves.push(key); return { success: false }; } };
  const response = await worker.fetch(request(), config);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '60');
  assert.ok(chaves[0].startsWith('envio:'));
  assert.equal(nunca.mock.callCount(), 0);
});

test('falha de forma fechada e legível quando os limitadores ficam indisponíveis', async t => {
  const nunca = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });

  const rajada = env();
  rajada.DATAJUD_RATE_LIMITER.limit = async () => { throw new Error('detalhe-interno'); };
  const respostaRajada = await worker.fetch(request(), rajada);
  assert.equal(respostaRajada.status, 503);
  assert.match((await respostaRajada.json()).erro, /controle de requisições/i);

  const diario = env();
  diario.ENVIO_DIARIO_LIMITER.get = () => ({ fetch: async () => new Response('resposta inválida') });
  const respostaDiaria = await worker.fetch(request(), diario);
  assert.equal(respostaDiaria.status, 503);
  assert.match((await respostaDiaria.json()).erro, /limite diário/i);

  assert.equal(nunca.mock.callCount(), 0);
});

test('erro inesperado no envio não vaza detalhes nem usa mensagem de consulta', async t => {
  const logs = t.mock.method(console, 'error', () => {});
  const config = env();
  config.ENVIO_DIARIO_LIMITER.idFromName = () => { throw new Error('detalhe-secreto'); };

  const response = await worker.fetch(request(), config);
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { erro: 'Não foi possível concluir o envio.' });
  const registrado = JSON.stringify(logs.mock.calls.map(call => call.arguments));
  assert.ok(registrado.includes('worker_error'));
  assert.ok(!registrado.includes('detalhe-secreto'));
});

test('backend impede CNPJ inválido e CNPJ repetido mesmo sem a interface', async t => {
  const nunca = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });
  const casos = [
    [{ ...formularioValido(), autor: { tipo: 'Pessoa jurídica', documento: '11.222.333/0001-82' } }, /CNPJ válido para o autor/],
    [{ ...formularioValido(), reu: { documento: '11.444.777/0001-62' } }, /CNPJ válido para o réu/],
    [{ ...formularioValido(), reu: { documento: '11.222.333/0001-81' } }, /diferente do CNPJ do autor/],
    [{ ...formularioValido(), autor: { tipo: 'Pessoa física', documento: '111.111.111-11' } }, /CPF válido para o autor/],
    [{ ...formularioValido(), autor: { tipo: 'desconhecido', documento: '11.222.333/0001-81' } }, /pessoa física ou jurídica/]
  ];

  for (const [formulario, mensagem] of casos) {
    const response = await worker.fetch(request({ corpo: corpoComFormulario(formulario) }), env());
    assert.equal(response.status, 400);
    assert.match((await response.json()).erro, mensagem);
  }
  assert.equal(nunca.mock.callCount(), 0);
});

test('bloqueia o trigésimo primeiro envio diário do IP sem expor o endereço', async t => {
  const nunca = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria encaminhar'); });
  let chave = '';
  const config = env();
  config.ENVIO_DIARIO_LIMITER = {
    idFromName: valor => { chave = valor; return valor; },
    get: () => ({ fetch: async () => Response.json({ permitido: false, restantes: 0 }) })
  };

  const response = await worker.fetch(request(), config);
  assert.equal(response.status, 429);
  const corpo = await response.json();
  assert.equal(corpo.codigo, 'ENVIO_LIMITE_DIARIO');
  assert.equal(corpo.limite, 30);
  assert.equal(corpo.erro, 'Você atingiu o limite máximo de 30 envios por dia para esta rede. Tente novamente amanhã.');
  assert.ok(Number(response.headers.get('Retry-After')) >= 60);
  assert.equal(chave.length, 64);
  assert.ok(!chave.includes('203.0.113.10'));
  assert.equal(nunca.mock.callCount(), 0);
});

test('publica o formulário em /judicial, normaliza a raiz e preserva API e assets', async () => {
  const caminhos = [];
  const config = env();
  config.ASSETS.fetch = async request => {
    caminhos.push(new URL(request.url).pathname);
    return new Response('formulario');
  };

  const status = await worker.fetch(new Request('https://formulario.example/api/status'), config);
  assert.deepEqual(await status.json(), { service: 'datajud', configured: true });
  const raiz = await worker.fetch(new Request('https://formulario.example/'), config);
  assert.equal(raiz.status, 302);
  assert.equal(raiz.headers.get('Location'), 'https://formulario.example/judicial');
  assert.equal(raiz.headers.get('Cache-Control'), 'no-store');

  const barraFinal = await worker.fetch(new Request('https://formulario.example/judicial/'), config);
  assert.equal(barraFinal.status, 302);
  assert.equal(barraFinal.headers.get('Location'), 'https://formulario.example/judicial');

  const formulario = await worker.fetch(new Request('https://formulario.example/judicial'), config);
  assert.equal(await formulario.text(), 'formulario');
  const asset = await worker.fetch(new Request('https://formulario.example/app.js'), config);
  assert.equal(await asset.text(), 'formulario');
  assert.deepEqual(caminhos, ['/', '/app.js']);

  const desconhecida = await worker.fetch(new Request('https://formulario.example/api/garantia-judicial'), config);
  assert.equal(desconhecida.status, 404);
});
