/* ═══════════════════════════════════════════════════════════════
   Proxy local para a API Pública do DataJud (CNJ)

   Para que serve: o CNJ não devolve header CORS, então o navegador
   bloqueia a chamada direta. Este proxy roda na sua máquina, recebe a
   chamada do formulário e repassa ao CNJ — que aceita sem reclamar.

   Legado: o formulário atual usa npm run dev (Worker + assets).
   Este proxy isolado permanece apenas como referência.

   Como usar
   ---------
   Configure DATAJUD_APIKEY no ambiente e rode:

        node proxy/datajud-local.js

   Endpoint legado: POST /api_publica_<tribunal>/_search.
   Para testar o formulário atual, siga npm run dev no README.

   Não precisa instalar nada: usa só o Node.
   Só para desenvolvimento e demonstração — não publique isto na internet.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const http = require('http');

const PORTA = 8787;
const UPSTREAM = 'https://api-publica.datajud.cnj.jus.br';

/* Chave pública divulgada pelo CNJ na wiki da API.
   O CNJ pode trocá-la; confira em datajud-wiki.cnj.jus.br/api-publica/acesso/ */
const APIKEY = process.env.DATAJUD_APIKEY;
if (!APIKEY) throw new Error('Configure DATAJUD_APIKEY no ambiente antes de iniciar.');

/* Só aceita os índices da API pública, no formato api_publica_<tribunal>/_search.
   Sem isto, o proxy viraria um encaminhador genérico para qualquer URL. */
const ROTA = /^\/api_publica_[a-z0-9]{2,10}\/_search$/;

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function erro(res, status, mensagem) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ erro: mensagem }));
}

const servidor = http.createServer((req, res) => {
  const caminho = req.url.split('?')[0];

  /* o navegador pergunta antes de enviar o POST */
  if (req.method === 'OPTIONS') {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (caminho === '/' || caminho === '/status') {
    cors(res);
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Proxy DataJud no ar. Use POST /api_publica_<tribunal>/_search\n');
  }

  if (req.method !== 'POST') return erro(res, 405, 'Use POST.');
  if (!ROTA.test(caminho)) {
    return erro(res, 400, 'Caminho inválido. Esperado /api_publica_<tribunal>/_search');
  }

  let corpo = '';
  req.on('data', (parte) => {
    corpo += parte;
    if (corpo.length > 64 * 1024) { req.destroy(); }
  });

  req.on('end', () => {
    const inicio = Date.now();

    fetch(UPSTREAM + caminho, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /* a chave entra aqui, no servidor — não precisa ficar no navegador */
        'Authorization': 'APIKey ' + APIKEY
      },
      body: corpo
    })
      .then(async (r) => {
        const texto = await r.text();
        const ms = Date.now() - inicio;
        console.log(`${new Date().toLocaleTimeString('pt-BR')}  ${caminho}  ${r.status}  ${ms}ms`);
        cors(res);
        res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(texto);
      })
      .catch((e) => {
        console.error('falha ao falar com o CNJ:', e.message);
        erro(res, 502, 'Não foi possível falar com o CNJ: ' + e.message);
      });
  });
});

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log('');
  console.log('  Proxy DataJud no ar em http://localhost:' + PORTA);
  console.log('');
  console.log('  Proxy legado. Para o formulario atual, use npm run dev.');
  console.log('');
  console.log('  Ctrl+C encerra.');
  console.log('');
});
