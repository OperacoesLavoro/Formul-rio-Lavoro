import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configuracaoTurnstilePublica,
  validarTurnstile
} from '../src/services/turnstile.mjs';

const request = () => new Request('https://formulario.lavoroseguros.com.br/api/garantia-judicial/submit', {
  headers: { 'CF-Connecting-IP': '203.0.113.20' }
});

const env = () => ({
  TURNSTILE_ENABLED: 'true',
  TURNSTILE_SITE_KEY: 'site-key-publica',
  TURNSTILE_SECRET: 'secret-somente-servidor',
  TURNSTILE_ALLOWED_HOSTNAME: 'formulario.lavoroseguros.com.br'
});

test('publica somente a site key e mantém o secret no Worker', () => {
  const configuracao = configuracaoTurnstilePublica(env());
  assert.deepEqual(configuracao, { enabled: true, siteKey: 'site-key-publica' });
  assert.ok(!JSON.stringify(configuracao).includes('secret-somente-servidor'));
});

test('valida token, ação, hostname e IP no endpoint oficial', async t => {
  let chamada;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    chamada = { url, options };
    return Response.json({
      success: true,
      action: 'garantia_judicial_submit',
      hostname: 'formulario.lavoroseguros.com.br'
    });
  });

  await validarTurnstile('token-unico', request(), env());
  assert.equal(chamada.url, 'https://challenges.cloudflare.com/turnstile/v0/siteverify');
  assert.equal(chamada.options.method, 'POST');
  assert.equal(chamada.options.body.get('secret'), 'secret-somente-servidor');
  assert.equal(chamada.options.body.get('response'), 'token-unico');
  assert.equal(chamada.options.body.get('remoteip'), '203.0.113.20');
});

test('falha fechada para token ausente, resposta inválida e configuração incompleta', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json({
    success: false,
    'error-codes': ['timeout-or-duplicate']
  }));

  await assert.rejects(validarTurnstile('', request(), env()), { status: 403 });
  assert.equal(fetchMock.mock.callCount(), 0);
  await assert.rejects(validarTurnstile('token-repetido', request(), env()), { status: 403 });
  await assert.rejects(validarTurnstile('token', request(), { TURNSTILE_ENABLED: 'true' }), { status: 503 });
});

test('permite desligar explicitamente apenas no ambiente local ou de teste', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('não deveria chamar'); });
  await validarTurnstile('', request(), { TURNSTILE_ENABLED: 'false' });
  assert.deepEqual(configuracaoTurnstilePublica({ TURNSTILE_ENABLED: 'false' }), { enabled: false });
  assert.equal(fetchMock.mock.callCount(), 0);
});
