import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.mjs';
import { confirmarCnpjsDoFormulario, consultarCnpj } from '../src/services/cnpj.mjs';

const CNPJ = '11.222.333/0001-81';
const respostaPublica = {
  razao_social: 'Empresa de Teste S.A.',
  descricao_situacao_cadastral: 'ATIVA',
  descricao_tipo_de_logradouro: 'Avenida',
  logradouro: 'Paulista',
  numero: '1000',
  bairro: 'Bela Vista',
  municipio: 'São Paulo',
  uf: 'SP',
  cep: '01310100'
};

test('normaliza a consulta de CNPJ no servidor sem expor os provedores ao navegador', async t => {
  const chamadas = [];
  t.mock.method(globalThis, 'fetch', async url => {
    chamadas.push(String(url));
    return Response.json(respostaPublica);
  });

  const dados = await consultarCnpj(CNPJ);
  assert.deepEqual(dados, {
    razao: 'Empresa de Teste S.A.',
    fantasia: '',
    situacao: 'ATIVA',
    endereco: 'Avenida Paulista, 1000 — Bela Vista — São Paulo/SP — CEP 01310-100'
  });
  assert.deepEqual(chamadas, ['https://brasilapi.com.br/api/cnpj/v1/11222333000181']);
});

test('distingue CNPJ inexistente de indisponibilidade dos provedores', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  await assert.rejects(consultarCnpj(CNPJ), { status: 404 });
  assert.equal(fetchMock.mock.callCount(), 3);
  fetchMock.mock.restore();

  const indisponivel = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await assert.rejects(consultarCnpj(CNPJ), { status: 503 });
  assert.equal(indisponivel.mock.callCount(), 3);
});

test('rejeita dígitos inválidos antes de chamar serviços externos', async t => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('não deveria chamar'); });
  await assert.rejects(consultarCnpj('11.222.333/0001-82'), { status: 400 });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test('confirma inexistência no envio, mas não bloqueia quando as bases estão fora do ar', async t => {
  const logs = t.mock.method(console, 'warn', () => {});
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 404 }));
  const formulario = {
    autor: { tipo: 'Pessoa física', documento: '529.982.247-25' },
    reu: { documento: CNPJ }
  };
  await assert.rejects(confirmarCnpjsDoFormulario(formulario), { status: 400 });
  fetchMock.mock.restore();

  const indisponivel = t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 503 }));
  await confirmarCnpjsDoFormulario(formulario);
  assert.equal(indisponivel.mock.callCount(), 3);
  assert.equal(logs.mock.callCount(), 1);
  assert.ok(!JSON.stringify(logs.mock.calls).includes('11222333000181'));
});

test('rota /api/cnpj aplica origem, limite e contrato JSON', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json(respostaPublica));
  const chaves = [];
  const env = {
    DATAJUD_RATE_LIMITER: {
      limit: async ({ key }) => { chaves.push(key); return { success: true }; }
    },
    ASSETS: { fetch: async () => new Response('asset') }
  };
  const response = await worker.fetch(new Request('https://formulario.example/api/cnpj', {
    method: 'POST',
    headers: {
      Origin: 'https://formulario.example',
      'CF-Connecting-IP': '203.0.113.9',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ cnpj: CNPJ })
  }), env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).razao, 'Empresa de Teste S.A.');
  assert.deepEqual(chaves, ['cnpj:203.0.113.9']);
});
