import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { jsPDF } from 'jspdf';

/* Mesma técnica de frontend.test.mjs: js/app.js roda em node:vm com um
   document falso, para exercitar o envio sem navegador. */
const source = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

function montar(fetch) {
  const salvos = [];
  const blobDoGerador = new Blob(['%PDF-1.4 gerado pelo formulario'], { type: 'application/pdf' });

  const documento = {
    querySelector: () => null,
    addEventListener() {}
  };

  const janela = {
    jspdf: {
      jsPDF: function () {
        let paginas = 1;
        for (const metodo of ['setProperties', 'setFillColor', 'rect', 'setTextColor', 'setFont', 'setFontSize',
          'text', 'setDrawColor', 'line', 'roundedRect', 'addImage', 'setPage']) this[metodo] = () => {};
        this.splitTextToSize = texto => [String(texto)];
        this.addPage = () => { paginas += 1; };
        this.getNumberOfPages = () => paginas;
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

const dados = () => ({
  responsavel: { empresa: 'Empresa Teste', nome: 'Pessoa Teste', email: 'teste@example.com', telefone: '(11) 99999-9999' },
  natureza: 'civel',
  naturezaRotulo: 'Cível',
  autor: { tipo: 'Pessoa jurídica', documento: '00.000.000/0001-00', nome: 'Autor Teste', endereco: 'Endereço do autor' },
  menorIdade: 'não',
  representante: null,
  reu: { documento: '11.111.111/0001-11', nome: 'Réu Teste', endereco: 'Endereço do réu' },
  processo: { numero: '0000001-23.2025.8.26.0001', ramo: 'Justiça Estadual', tribunal: 'TJSP', juizo: '1ª Vara', ano: '2025', numeroAdministrativo: '', tribunalRegional: '' },
  garantia: { valorCausa: 100000, add30: true, importanciaSegurada: 130000, autoInfracao: '', linhaDefesa: 'Defesa teste', historico: 'Histórico teste' },
  indice: 'IPCA',
  objetivo: 'Garantir o processo',
  vigencia: { inicio: '2026-09-17', anos: 3, fim: '2029-09-17' },
  entrega: { prazo: '2026-09-20', diasRestantes: 3 },
  exito: 'Possível',
  advogado: { nome: 'Advogado Teste', oab: '123456', uf: 'SP' },
  assinatura: 'data:image/png;base64,eA=='
});

test('gerarPdf baixa somente quando solicitado e devolve o documento em Blob', async () => {
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

test('gera um PDF A4 real e válido com o layout corporativo', async () => {
  const logoBase64 = 'data:image/png;base64,' + readFileSync(
    new URL('../assets/Logo_Lavoro (Branca).png', import.meta.url)
  ).toString('base64');
  const documento = {
    querySelector: seletor => seletor.includes('masthead-logo') ? logoBase64 : null,
    addEventListener() {}
  };
  const context = vm.createContext({
    document: documento,
    window: { jspdf: { jsPDF } },
    location: { protocol: 'https:' },
    Blob,
    console: { error() {}, warn() {} }
  });
  vm.runInContext(source, context);
  context.dados = { ...dados(), assinatura: logoBase64 };

  const resultado = await vm.runInContext(
    "gerarPdf(dados, 'LV-260917-4321', { baixar: false })",
    context
  );
  const bytes = Buffer.from(await resultado.blob.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(bytes.length > 20_000);
  assert.equal(resultado.nome, 'proposta-garantia-00000012320258260001.pdf');
});

test('envia ao Worker o mesmo PDF sem baixar automaticamente e sem expor credenciais', async () => {
  let chamada = null;
  const ui = montar(async (url, options) => {
    chamada = { url, options };
    return Response.json({ recebido: true, referencia: 'hub-123' });
  });
  ui.context.dados = dados();

  const enviado = await vm.runInContext(`(async () => {
    const pdf = await gerarPdf(dados, 'LV-260915-1234', { baixar: false });
    return enviarProposta(dados, 'LV-260915-1234', pdf);
  })()`, ui.context);

  assert.deepEqual(enviado, { recebido: true, referencia: 'hub-123' });
  assert.deepEqual(ui.salvos, []);
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

test('mostra o teto de 30 apenas quando o Worker sinaliza o limite diário', async () => {
  const limiteDiario = montar(async () => Response.json({
    codigo: 'ENVIO_LIMITE_DIARIO',
    limite: 30,
    erro: 'mensagem controlada pelo servidor'
  }, { status: 429 }));
  limiteDiario.context.dados = dados();
  await assert.rejects(
    vm.runInContext(`enviarProposta(dados, 'LV-260915-1234', { blob: new Blob(['%PDF-1.4']), nome: 'p.pdf' })`, limiteDiario.context),
    { message: 'Você atingiu o limite máximo de 30 envios por dia para esta rede. Tente novamente amanhã.' }
  );

  const rajada = montar(async () => Response.json({
    erro: 'Muitos envios. Aguarde um minuto e tente novamente.'
  }, { status: 429 }));
  rajada.context.dados = dados();
  await assert.rejects(
    vm.runInContext(`enviarProposta(dados, 'LV-260915-1234', { blob: new Blob(['%PDF-1.4']), nome: 'p.pdf' })`, rajada.context),
    erro => {
      assert.equal(erro.message, 'Muitos envios. Aguarde um minuto e tente novamente.');
      assert.ok(!erro.message.includes('30 envios por dia'));
      return true;
    }
  );
});
