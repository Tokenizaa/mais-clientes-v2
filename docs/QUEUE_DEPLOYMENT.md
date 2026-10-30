# Deploy do consumidor de scraping (Cloudflare Queues)

A aplicação web continua no Cloudflare Pages (`mapscrape`). O consumidor é um Worker separado, executado fora do ciclo de vida da requisição HTTP. O endpoint Pages cria o job no Supabase e publica uma mensagem contendo apenas o ID; nenhum segredo ou endpoint de navegador é enviado na mensagem.

## Pré-requisitos no Cloudflare

Criar a fila principal uma única vez (a DLQ declarada na configuração do consumidor é criada automaticamente se ainda não existir):

```bash
npx wrangler queues create scrape-queue
```

Configurar os segredos no Worker consumidor (não adicionar valores ao Git):

```bash
npx wrangler secret put SUPABASE_URL --config wrangler.queue-consumer.toml
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.queue-consumer.toml
npx wrangler secret put BROWSER_WS_ENDPOINT --config wrangler.queue-consumer.toml
```

O `BROWSER_WS_ENDPOINT` deve apontar para o Chromium remoto já utilizado pelo projeto. A Service Role Key existe somente no ambiente server-side do Worker e nunca deve ser publicada no frontend, no payload da fila ou em logs.

## Ordem de implantação

1. Fazer deploy do Pages com o binding produtor definido em `wrangler.toml`: `npm run deploy` (o script publica Pages, não um Worker independente).
2. Fazer deploy do consumidor: `npx wrangler deploy --config wrangler.queue-consumer.toml`.
3. Conferir no painel Cloudflare se o Worker `mapscrape-queue-consumer` está inscrito em `scrape-queue` e se a DLQ `scrape-queue-dlq` foi criada/associada. O consumidor inicia com concorrência 1 para reduzir risco de saturar o Chromium remoto.
4. Executar uma coleta pequena (limite 1 ou 2) pela interface e acompanhar o job até estado terminal.

## Verificações

- POST autenticado em `/api/v1/jobs` deve retornar 202 e um `jobId`.
- O job deve sair de `running` e registrar progresso/resultado no Supabase.
- Mensagem malformada é descartada; falha transitória de banco/infraestrutura usa retry; falha após o limite é registrada como `failed`.
- Mensagens não contêm `BROWSER_WS_ENDPOINT`, credenciais Supabase, token API nem dados pessoais além do identificador opaco do job.
- O consumidor ignora mensagens repetidas quando o job já está em estado terminal.

## Limite desta preparação

A criação das filas e a configuração dos três secrets são recursos da conta Cloudflare e precisam existir antes do primeiro deploy do consumidor. Este PR prepara o código e a configuração versionada, mas não cria filas, não altera secrets e não aplica mudanças no Supabase.
## Testes

- `npm run test:unit`: testes sem dependência de banco, executados no CI de PR.
- `npm run test:integration`: suíte que grava no Supabase e exige variáveis de ambiente e um projeto de teste isolado. Não apontar essa suíte para produção; ela não faz limpeza automática de todos os registros criados.
- `npm run lint` e `npm run build`: typecheck e build de produção.

