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
5. A URL não secreta do Hub já está declarada em `wrangler.jsonc`. No painel, configure apenas o segredo de autenticação:

   | Nome | Tipo | Conteúdo |
   | --- | --- | --- |
   | `HUB_WEBHOOK_SECRET` | **Secret** de runtime | token da autenticação servidor a servidor, só o valor, sem `Bearer ` |

   O Hub roda em Lovable, que exige o prefixo `/api/public/` nas rotas abertas. O endereço a
   configurar é `https://<hub>/api/public/garantia-judicial-submit` — com o prefixo e com hífen
   antes de `submit`. Informe a URL exata, sem barra no fim: o Worker não segue redirecionamento
   (para não repassar o token a outro endereço) e responde `HUB_REDIRECT` se o Hub devolver 3xx.

   O endereço fica em `HUB_SUBMIT_URL`, como variável não secreta no `wrangler.jsonc`. Mudar o
   caminho no Hub exige atualizar a configuração e realizar um novo deploy.

   Sem as duas, o envio responde com `HUB_CONFIG` e nada é encaminhado. O token existe apenas no Worker: não vai para o HTML, para o JavaScript nem para log algum.

6. Abra a URL HTTPS indicada pelo Cloudflare. Em `/diagnostico.html`, verifique se o Worker encontrou a configuração.
7. No formulário, consulte um processo público conhecido e confira os dados retornados. O diagnóstico verifica a presença da configuração do CNJ, não a autenticação no CNJ nem o envio ao Hub.
8. Compartilhe o link do formulário com o time. Se o Worker estiver conectado ao repositório em **Builds → Settings**, todo push para a branch de produção `main` inicia build e deploy automáticos.

`npx wrangler login` autentica apenas a CLI nesta máquina; ele não cria a conexão entre GitHub e Cloudflare. Se o Worker do T.I. não tiver uma integração Git configurada, o push não publica nada. Nesse caso, publique manualmente com `npm run deploy` ou peça ao T.I. para conectar o repositório e a branch `main` no painel.

O formulário abre sem a chave, mas a consulta retorna uma mensagem de configuração pendente até o Secret ser definido.
Não é necessário editar `js/app.js` com a URL do Worker nem com o endereço do Hub: as chamadas usam `/api/datajud` e `/api/garantia-judicial/submit` no mesmo domínio.

## Desenvolvimento e validação

Requer Node.js 22 ou superior.

```sh
npm ci
```

Copie `.dev.vars.example` para `.dev.vars` e preencha `DATAJUD_APIKEY`, `HUB_SUBMIT_URL` e `HUB_WEBHOOK_SECRET` localmente.
Use o endereço e o token de homologação do Hub, nunca os de produção.
O Wrangler carrega esse arquivo; ele está ignorado pelo Git (`.dev.vars`, `.dev.vars.*`, `.env`, `.env.*`). Não envie credenciais ao repositório.

```sh
npm run check
npm run deploy:check
npm run dev
```

Abra o endereço informado pelo Wrangler. `deploy:check` valida o empacotamento sem publicar.
Para publicação manual autenticada na sua conta: `npm run deploy`. Antes de publicar, use `npm run deploy:check` para validar o pacote sem alterar a produção.

## Organização e fluxo

- `html/`: `index.html` (formulário) e `diagnostico.html` (verificação de configuração).
- `css/styles.css`: identidade visual e layout.
- `js/`: `app.js` (preenchimento e regras do formulário) e `diagnostico.js`.
- `assets/`: logo e imagem de fundo.
- `src/worker.mjs`: rotas HTTP, origem, limite de chamadas e respostas de erro.
- `src/services/datajud.mjs`: validação CNJ, seleção de tribunal e chamada à API.
- `src/services/hub.mjs`: validação do envio (payload + PDF) e encaminhamento autenticado ao Hub.
- `src/utils/http.mjs`: leitura limitada de JSON e respostas HTTP.
- `scripts/build.mjs`: copia a lista explícita de `html/`, `css/`, `js/`, `assets/` e `_headers`
  para `dist/` no formato plano que o Worker publica — a organização por tipo é só do código-fonte.
- `wrangler.jsonc`: Worker, assets e limite de chamadas.
- `tests/`: verificações automatizadas sem usar processos reais nem credenciais reais.

`POST /api/datajud` recebe somente `{ "numeroProcesso": "20 dígitos" }`.
O servidor valida tamanho e dígito verificador, deriva o tribunal e monta uma consulta fixa.
Não aceita URL externa, índice arbitrário nem DSL Elasticsearch do cliente.
A chave fica no servidor. Respostas da consulta usam `Cache-Control: no-store`.
O proxy não grava o formulário ou os números dos processos em banco nem em logs de aplicação.

`POST /api/garantia-judicial/submit` recebe `multipart/form-data` com dois campos: `payload`
(JSON com `protocolo`, `geradoEm` e `formulario`, o mesmo objeto montado por `coletar()`) e
`pdf` (o arquivo gerado em memória, sem download automático). O mesmo documento fica disponível no botão de download após a confirmação. `payload` vai como campo de
texto puro — anexado como arquivo, com nome, o envio é recusado com 400. O Worker confere formato, tamanho
e a assinatura `%PDF-` do arquivo, remonta o multipart e encaminha a `HUB_SUBMIT_URL` com
`Authorization: Bearer <HUB_WEBHOOK_SECRET>`. Qualquer resposta 2xx do Hub confirma o
recebimento; o Worker não espera consulta de seguradoras. Nada do envio vai para log: só
`{ evento, codigo, upstreamStatus }` em caso de falha.

São dois endereços diferentes, e nenhum precisa casar com o outro:
`/api/garantia-judicial/submit` é a rota deste Worker, no mesmo domínio do formulário, e é a
única que o navegador conhece; o endereço do Hub (`/api/public/garantia-judicial-submit`, no
domínio dele) existe só dentro de `HUB_SUBMIT_URL`, do lado do servidor.

## Acesso e limites

O deploy padrão gera um endereço acessível pela internet: o código não inclui login.
Para uso exclusivo do time, configure Cloudflare Access com a política de acesso da empresa antes de compartilhar dados reais.
A verificação de origem não é autenticação e não impede chamadas de clientes fora do navegador.

O limite é de 60 consultas por minuto por IP e por localização Cloudflare; pessoas na mesma rede compartilham esse limite.
É uma proteção aproximada contra abuso, não uma cota global exata. O namespace `1001` deve ser exclusivo deste limitador na conta; ajuste-o se já estiver em uso.
O backend espera até 15 segundos pelo CNJ; o navegador espera até 20 segundos e sempre libera o botão ao terminar.

A API pode não conter o processo consultado. O preenchimento usa órgão julgador e movimentações, incluindo classe/assuntos quando disponíveis; campos já preenchidos são preservados.
Partes e valor da causa continuam manuais. A consulta de CNPJ existente usa serviços externos separados.
O envio da proposta entrega os dados e o PDF ao Hub pelo Worker; o protocolo e o PDF continuam sendo gerados no navegador.
Este projeto não consulta seguradoras, não gera planilha, não envia e-mail e não acessa banco de dados — isso é responsabilidade do Hub.

## Referências

- [Assets e Worker no mesmo projeto](https://developers.cloudflare.com/workers/static-assets/)
- [Build e deploy pelo Git](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Secrets de runtime](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Limitação de chamadas](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)
- [Acesso à API DataJud](https://datajud-wiki.cnj.jus.br/api-publica/acesso/)
