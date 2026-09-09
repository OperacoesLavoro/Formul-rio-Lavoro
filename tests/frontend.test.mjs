import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const base = '0000001' + '2025' + '8' + '26' + '0001';
const numero = base.slice(0, 7) + String(98n - BigInt(base + '00') % 97n).padStart(2, '0') + base.slice(7);
function setup(fetch) {
  const elements = { '#btnDataJud': { disabled: false }, '#dataJudStatus': {}, '#processo': { value: numero } };
  const context = vm.createContext({ document: { querySelector: id => elements[id], addEventListener() {} },
    location: { protocol: 'https:' }, fetch, AbortSignal });
  vm.runInContext(source, context);
  vm.runInContext('var filled = null; preencherComDataJud = (sources) => { filled = sources; };', context);
  return { elements, context, run: () => vm.runInContext('consultarDataJud()', context) };
}

test('frontend chama API relativa sem chave e preenche o resultado', async () => {
  const ui = setup(async (url, options) => {
    assert.equal(url, '/api/datajud');
    assert.equal(options.headers.Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body), { numeroProcesso: numero });
    return Response.json({ hits: { hits: [{ _source: { grau: 'G1' } }] } });
  });
  await ui.run();
  assert.equal(ui.context.filled[0].grau, 'G1');
  assert.equal(ui.elements['#btnDataJud'].disabled, false);
});

test('frontend mostra erro e libera botão em erro HTTP, timeout ou resposta HTML', async () => {
  for (const fetch of [
    async () => Response.json({ erro: 'Configuração pendente' }, { status: 503 }),
    async () => { throw new DOMException('timeout', 'TimeoutError'); },
    async () => new Response('<html>not found</html>', { headers: { 'Content-Type': 'text/html' } })
  ]) {
    const ui = setup(fetch);
    await ui.run();
    assert.equal(ui.elements['#btnDataJud'].disabled, false);
    assert.ok(ui.elements['#dataJudStatus'].textContent);
    assert.equal(ui.context.filled, null);
  }
});

test('frontend descarta resultado se o número foi editado durante a consulta', async () => {
  const ui = setup(async () => {
    ui.elements['#processo'].value = 'outro';
    return Response.json({ hits: { hits: [{ _source: { grau: 'G1' } }] } });
  });
  await ui.run();
  assert.equal(ui.context.filled, null);
  assert.match(ui.elements['#dataJudStatus'].textContent, /alterado/);
  assert.equal(ui.elements['#btnDataJud'].disabled, false);
});
