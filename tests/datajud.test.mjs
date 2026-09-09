import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { parseProcesso } from '../src/services/datajud.mjs';

// Número sintético: os testes não consultam processos reais.
function numero(ramo = '8', tribunal = '26') {
  const base = '0000001' + '2025' + ramo + tribunal + '0001';
  const dv = String(98n - BigInt(base + '00') % 97n).padStart(2, '0');
  return base.slice(0, 7) + dv + base.slice(7);
}
const env = () => ({ DATAJUD_APIKEY: 'test-only-placeholder',
  DATAJUD_RATE_LIMITER: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response('formulario') } });
function request(body = { numeroProcesso: numero() }, options = {}) {
  return new Request('https://formulario.example/api/datajud', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://formulario.example' },
    body: JSON.stringify(body), ...options
  });
}

test('deriva tribunais cobertos e valida o dígito verificador', () => {
  for (const [ramo, tribunal, alias] of [['8', '26', 'tjsp'], ['8', '07', 'tjdft'],
    ['5', '02', 'trt2'], ['4', '06', 'trf6'], ['3', '00', 'stj']]) {
    assert.equal(parseProcesso({ numeroProcesso: numero(ramo, tribunal) }).alias, alias);
  }
  assert.throws(() => parseProcesso({ numeroProcesso: '0'.repeat(20) }), { status: 400 });
  assert.throws(() => parseProcesso({ numeroProcesso: numero('1', '00') }), { status: 422 });
});

test('consulta fixa no CNJ, credencial apenas no servidor e resposta sem cache', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search');
    assert.equal(options.headers.Authorization, 'APIKey test-only-placeholder');
    assert.equal(options.redirect, 'error');
    assert.equal(JSON.parse(options.body).query.match.numeroProcesso, numero());
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ hits: { hits: [{ _source: { grau: 'G1', orgaoJulgador: { nome: 'Vara de teste' } } }] } });
  });
  const response = await worker.fetch(request(), env());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).hits.hits[0]._source.orgaoJulgador.nome, 'Vara de teste');
  assert.equal(fetchMock.mock.callCount(), 1);
});

test('bloqueia JSON inválido, payload grande, DSL, origem externa e método inadequado antes do CNJ', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('Não deveria consultar'); });
  const cases = [
    [request({ numeroProcesso: numero(), query: { match_all: {} } }), 400],
    [request({}, { body: '{' }), 400],
    [request({}, { body: ' '.repeat(1025) }), 413],
    [request({}, { headers: { 'Content-Type': 'text/plain' } }), 415],
    [request({}, { headers: { Origin: 'https://other.example' } }), 403],
    [new Request('https://formulario.example/api/datajud'), 405],
    [new Request('https://formulario.example/api/unknown'), 404]
  ];
  for (const [req, status] of cases) assert.equal((await worker.fetch(req, env())).status, status);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('distingue ausência de configuração e limite de chamadas sem expor chave', async () => {
  const config = env();
  delete config.DATAJUD_APIKEY;
  assert.equal((await worker.fetch(request(), config)).status, 503);
  const status = await worker.fetch(new Request('https://formulario.example/api/status'), env());
  assert.deepEqual(await status.json(), { service: 'datajud', configured: true });
  config.DATAJUD_RATE_LIMITER.limit = async () => ({ success: false });
  const limited = await worker.fetch(request(), config);
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get('Retry-After'), '60');
});

test('traduz erros e respostas inesperadas do CNJ sem repassar detalhes internos', async t => {
  for (const [upstream, expected] of [[401, 502], [403, 502], [429, 429], [500, 502]]) {
    const mock = t.mock.method(globalThis, 'fetch', async () => new Response('internal detail', { status: upstream }));
    const response = await worker.fetch(request(), env());
    assert.equal(response.status, expected);
    assert.ok(!(await response.text()).includes('internal detail'));
    mock.mock.restore();
  }
  const invalid = t.mock.method(globalThis, 'fetch', async () => Response.json({ unexpected: true }));
  assert.equal((await worker.fetch(request(), env())).status, 502);
  invalid.mock.restore();
  const timeout = t.mock.method(globalThis, 'fetch', async () => { throw new DOMException('timeout', 'TimeoutError'); });
  assert.equal((await worker.fetch(request(), env())).status, 504);
  timeout.mock.restore();
  t.mock.method(globalThis, 'fetch', async () => Response.json({ hits: { hits: [] } }));
  assert.deepEqual(await (await worker.fetch(request(), env())).json(), { hits: { hits: [] } });
});

test('entrega assets pelo binding, preservando a página inicial', async () => {
  const response = await worker.fetch(new Request('https://formulario.example/'), env());
  assert.equal(await response.text(), 'formulario');
});
