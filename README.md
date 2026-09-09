# Formulário Lavoro — garantia judicial

Formulário HTML/CSS/JavaScript e consulta à API Pública DataJud no mesmo Cloudflare Worker.
O time abre um link HTTPS; não precisa instalar Node nem iniciar um proxy local.

## Publicar pelo GitHub no Cloudflare Workers

1. No painel Cloudflare, abra **Workers & Pages**, crie uma aplicação/Worker e escolha importar um repositório Git.
2. Conecte o GitHub e selecione **OperacoesLavoro/Formul-rio-Lavoro**, branch **main**.
3. Use estas configurações:

   | Campo | Valor |
   | --- | --- |
   | Nome do Worker | `formulario-lavoro` (igual a `name` em `wrangler.jsonc`) |
   | Diretório raiz | raiz do repositório (`/`) |
   | Build command | `npm run build` |
   | Deploy command | `npx wrangler deploy` |

   A instalação usa `package.json` e `package-lock.json`. Não selecione hospedagem apenas estática/Pages: a consulta precisa executar o Worker.

4. Depois do primeiro deploy, abra o Worker em **Settings → Variables & Secrets** e adicione um **Secret de runtime** chamado `DATAJUD_APIKEY`.
   Copie apenas o valor da chave vigente em <https://datajud-wiki.cnj.jus.br/api-publica/acesso/>, sem `Authorization:` nem `APIKey `.
   Salve/aplique a alteração e publique a versão atualizada, se solicitado pelo painel. Uma variável apenas de build não atende a essa configuração.
5. Abra a URL HTTPS indicada pelo Cloudflare. Em `/diagnostico.html`, verifique se o Worker encontrou a configuração.
6. No formulário, consulte um processo público conhecido e confira os dados retornados. O diagnóstico verifica a presença da configuração, não a autenticação no CNJ.
7. Compartilhe o link do formulário com o time. Alterações enviadas à branch conectada podem gerar novos deploys automáticos.

O formulário abre sem a chave, mas a consulta retorna uma mensagem de configuração pendente até o Secret ser definido.
Não é necessário editar `app.js` com a URL do Worker: a chamada usa `/api/datajud` no mesmo domínio.

## Desenvolvimento e validação

Requer Node.js 22 ou superior.

```sh
npm ci
```

Copie `.dev.vars.example` para `.dev.vars` e preencha `DATAJUD_APIKEY` localmente.
O Wrangler carrega esse arquivo; ele está ignorado pelo Git. Não envie credenciais ao repositório.

```sh
npm run check
npm run deploy:check
npm run dev
```

Abra o endereço informado pelo Wrangler. `deploy:check` valida o empacotamento sem publicar.
Para publicação manual autenticada na sua conta: `npm run deploy`.

## Organização e fluxo

- `index.html`, `app.js`, `styles.css`: formulário existente e preenchimento dos dados.
- `src/worker.mjs`: rotas HTTP, origem, limite de chamadas e respostas de erro.
- `src/services/datajud.mjs`: validação CNJ, seleção de tribunal e chamada à API.
- `src/utils/http.mjs`: leitura limitada de JSON e respostas HTTP.
- `scripts/build.mjs`: copia somente a lista explícita de assets para `dist/`.
- `wrangler.jsonc`: Worker, assets e limite de chamadas.
- `tests/`: verificações automatizadas sem usar processos reais nem credenciais reais.
- `proxy/`: referências legadas; a publicação atual usa `src/worker.mjs`.

`POST /api/datajud` recebe somente `{ "numeroProcesso": "20 dígitos" }`.
O servidor valida tamanho e dígito verificador, deriva o tribunal e monta uma consulta fixa.
Não aceita URL externa, índice arbitrário nem DSL Elasticsearch do cliente.
A chave fica no servidor. Respostas da consulta usam `Cache-Control: no-store`.
O proxy não grava o formulário ou os números dos processos em banco nem em logs de aplicação.

## Acesso e limites

O deploy padrão gera um endereço acessível pela internet: o código não inclui login.
Para uso exclusivo do time, configure Cloudflare Access com a política de acesso da empresa antes de compartilhar dados reais.
A verificação de origem não é autenticação e não impede chamadas de clientes fora do navegador.

O limite é de 60 consultas por minuto por IP e por localização Cloudflare; pessoas na mesma rede compartilham esse limite.
É uma proteção aproximada contra abuso, não uma cota global exata. O namespace `1001` deve ser exclusivo deste limitador na conta; ajuste-o se já estiver em uso.
O backend espera até 15 segundos pelo CNJ; o navegador espera até 20 segundos e sempre libera o botão ao terminar.

A API pode não conter o processo consultado. O preenchimento usa órgão julgador e movimentações, incluindo classe/assuntos quando disponíveis; campos já preenchidos são preservados.
Partes e valor da causa continuam manuais. A consulta de CNPJ existente usa serviços externos separados.
O envio do formulário mantém o comportamento local existente; este projeto não adiciona recebimento de propostas em um backend.

## Referências

- [Assets e Worker no mesmo projeto](https://developers.cloudflare.com/workers/static-assets/)
- [Build e deploy pelo Git](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Secrets de runtime](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Limitação de chamadas](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Acesso à API DataJud](https://datajud-wiki.cnj.jus.br/api-publica/acesso/)
