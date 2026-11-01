# Consumidor independente de candidatos

## Arquitetura

- **Descoberta:** o processo da aplicação continua navegando pelo feed do Google Maps e registra cada resultado em `public.scrape_candidates`.
- **Deduplicação rápida:** `register_scrape_candidate` elimina Place IDs/URLs já conhecidos antes de abrir a ficha.
- **Processamento:** o processo Node independente reivindica um candidato por vez com `claim_scrape_candidate`, que usa `FOR UPDATE SKIP LOCKED`, lease por candidato, geração de fencing e limite de trabalho em andamento por job.
- **Persistência:** o worker chama `complete_scrape_candidate`; a inserção, deduplicação final, contadores e checkpoint continuam atômicos.
- **Recuperação:** leases vencidas podem ser reivindicadas novamente. Falhas liberam o candidato com backoff; tentativas esgotadas tornam o candidato `failed`. Retries de candidatos terminais não incrementam contadores.

A lease de processamento é independente da lease de descoberta. O consumidor não precisa roubar nem liberar a lease do navegador que está lendo o feed.

## Ativação protegida

O caminho antigo continua como padrão. A descoberta só delega extração ao worker quando a variável abaixo estiver configurada na Vercel:

```env
SCRAPE_CANDIDATE_PROCESSOR_MODE=external
```

Sem essa variável, o caminho inline existente permanece ativo. Isso evita deixar a produção dependendo de um worker ainda não implantado.

## Implantar o consumidor

O worker pode rodar em qualquer host Node/Bun persistente com acesso ao Supabase e ao Browserless/Chromium remoto. O repositório inclui `Dockerfile.scrape-worker`.

Variáveis obrigatórias:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret>
BROWSERLESS_TOKEN=<browserless-token>
```

Variáveis opcionais:

```env
SCRAPE_WORKER_ID=candidate-worker-01
SCRAPE_WORKER_POLL_MS=1500
SCRAPE_CANDIDATE_LEASE_SECONDS=180
SCRAPE_CANDIDATE_MAX_ATTEMPTS=5
```

Execução local:

```bash
bun install --frozen-lockfile
bun run worker:scrape
```

Build da imagem:

```bash
docker build -f Dockerfile.scrape-worker -t mais-clientes-scrape-worker .
docker run --env-file .env.worker mais-clientes-scrape-worker
```

Execute inicialmente uma única instância. O claim com `SKIP LOCKED` permite adicionar outras instâncias posteriormente, sem permitir que dois workers processem o mesmo candidato. O limite por job considera também os candidatos já em processamento, para não ultrapassar a meta solicitada por corrida entre workers.

## Ordem obrigatória de rollout

1. Aplicar `supabase/migrations/20261101040000_independent_scrape_candidate_worker.sql` no projeto remoto.
2. Executar `supabase/tests/independent_scrape_candidate_worker.sql` e confirmar rollback de todos os fixtures.
3. Implantar o worker persistente e verificar logs de inicialização, claim, lease renewal e conclusão.
4. Fazer uma coleta controlada com meta pequena, confirmando que o produtor apenas enfileira e o worker salva.
5. Só então definir `SCRAPE_CANDIDATE_PROCESSOR_MODE=external` na Vercel e fazer deploy da aplicação.
6. Monitorar jobs, candidatos `discovered/processing/failed`, contadores e checkpoints antes de aumentar concorrência.

**Não ativar o modo externo antes dos passos 1–4.** A migration ainda está apenas no repositório; não foi aplicada ao Supabase remoto nesta etapa.

## Limites conhecidos

- A descoberta ainda usa um navegador dedicado para ler o feed; o consumidor usa sessões próprias do Chromium para abrir fichas.
- O worker é um processo persistente e precisa ser hospedado separadamente da função serverless da Vercel.
- A execução desta etapa cria código e migration, mas não provisiona um host, não instala secrets e não faz deploy de produção.
- Os 83 candidatos históricos sem sessão e os registros de places preexistentes não são alterados por esta arquitetura.
