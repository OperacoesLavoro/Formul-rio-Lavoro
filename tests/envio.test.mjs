import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Mesma técnica de frontend.test.mjs: js/app.js roda em node:vm com um
   document falso, para exercitar o envio sem navegador. */
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

function montar(fetch) {
  const salvos = [];
  const blobDoGerador = new Blob(['%PDF-1.4 gerado pelo formulario'], { type: 'application/pdf' });

  const folha = { querySelector: () => null, querySelectorAll: () => [] };
  const canvasFalso = { width: 800, height: 400 };
  const contexto2d = { drawImage() {} };

  const documento = {
    querySelector: seletor => (seletor === '#formSheet' ? folha : null),
    createElement: () => ({ width: 0, height: 0, getContext: () => contexto2d, toDataURL: () => 'data:image/png;base64,x' }),
    addEventListener() {}
  };

  const janela = {
    html2canvas: async () => canvasFalso,
    jspdf: {
      jsPDF: function () {
        this.addPage = () => {};
        this.addImage = () => {};
        this.save = nome => salvos.push(nome);
        this.output = tipo => (tipo === 'blob' ? blobDoGerador : null);
      }
    }
  };

  const context = vm.createContext({
    document: documento, window: janela, location: { protocol: 'https:' },
    fetch, FormData, Blob, AbortSignal, console: { error() {}, warn() {} }
  });
  vm.runInContext(source, context);
  return { context, salvos, blobDoGerador };
}

const dados = () => ({ processo: { numero: '0000001-23.2025.8.26.0001' } });

test('gerarPdf continua baixando o arquivo e devolve o mesmo documento em Blob', async () => {
  const ui = montar(async () => { throw new Error('não deve enviar aqui'); });
  ui.context.dados = dados();
  const resultado = await vm.runInContext("gerarPdf(dados, 'LV-260915-1234')", ui.context);

  assert.equal(resultado.nome, 'proposta-garantia-00000012320258260001.pdf');
  assert.deepEqual(ui.salvos, ['proposta-garantia-00000012320258260001.pdf']);
  assert.equal(resultado.blob, ui.blobDoGerador);

  const semBaixar = await vm.runInContext("gerarPdf(dados, 'LV-260915-1234', { baixar: false })", ui.context);
  assert.equal(ui.salvos.length, 1);
  assert.equal(semBaixar.blob, ui.blobDoGerador);
});

test('envia ao Worker o mesmo PDF gerado, com os dados do formulário e sem credenciais', async () => {
  let chamada = null;
  const ui = montar(async (url, options) => {
    chamada = { url, options };
    return Response.json({ recebido: true, referencia: 'hub-123' });
  });
  ui.context.dados = dados();

  const enviado = await vm.runInContext(`(async () => {
    const pdf = await gerarPdf(dados, 'LV-260915-1234');
    return enviarProposta(dados, 'LV-260915-1234', pdf);
  })()`, ui.context);

  assert.deepEqual(enviado, { recebido: true, referencia: 'hub-123' });
  assert.equal(chamada.url, '/api/garantia-judicial/submit');
  assert.equal(chamada.options.method, 'POST');
  // Nenhuma credencial sai do navegador e o Content-Type fica com o runtime.
  assert.equal(chamada.options.headers, undefined);
  assert.ok(chamada.options.body instanceof FormData);

  const corpo = chamada.options.body;
  /* O arquivo encaminhado é o Blob produzido pelo gerador de PDF — o FormData
     só o embrulha em File para carregar o nome do arquivo. */
  const arquivo = corpo.get('pdf');
  assert.equal(arquivo.name, 'proposta-garantia-00000012320258260001.pdf');
  assert.equal(arquivo.type, 'application/pdf');
  assert.equal(await arquivo.text(), await ui.blobDoGerador.text());
  const payload = JSON.parse(corpo.get('payload'));
  assert.equal(payload.protocolo, 'LV-260915-1234');
  assert.equal(payload.formulario.processo.numero, '0000001-23.2025.8.26.0001');
  assert.ok(payload.geradoEm);
});

test('traduz falha do Worker em mensagem legível, sem detalhes internos', async () => {
  const cases = [
    [async () => Response.json({ erro: 'O envio da proposta ainda não foi configurado. Referência: HUB_CONFIG.' }, { status: 503 }),
      /HUB_CONFIG/],
    [async () => new Response('<html>erro</html>', { headers: { 'Content-Type': 'text/html' } }), /não está disponível/],
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, /demorou/],
    [async () => { throw new TypeError('failed to fetch'); }, /conexão/]
  ];
  for (const [fetch, esperado] of cases) {
    const ui = montar(fetch);
    ui.context.dados = dados();
    await assert.rejects(
      vm.runInContext(`enviarProposta(dados, 'LV-260915-1234', { blob: new Blob(['%PDF-1.4']), nome: 'p.pdf' })`, ui.context),
      erro => {
        assert.match(erro.message, esperado);
        assert.ok(!erro.message.includes('failed to fetch'));
        return true;
      }
    );
  }
});
