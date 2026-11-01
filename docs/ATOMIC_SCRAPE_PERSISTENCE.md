# Persistência atômica da coleta

## Objetivo

Garantir que cada ficha descoberta tenha um registro durável e que o resultado da ficha, a contagem da coleta e o checkpoint avancem juntos, sem contagem duplicada em retries.

## Fluxo implementado

1. O worker reivindica a lease da sessão de pesquisa.
2. Antes de abrir a ficha, registra a URL em `public.scrape_candidates` por `register_scrape_candidate`.
3. A própria operação de registro faz a deduplicação rápida por Place ID e URL. Se já existir, marca o candidato como duplicado, avança checkpoint/contadores e não abre a ficha no navegador.
4. A chave da ficha é o Place ID extraído do Google Maps; quando não existe, usa a URL normalizada do resultado.
5. Se a ficha passar pela deduplicação rápida, a conclusão chama `complete_scrape_candidate`:
   - verifica novamente a lease e o proprietário;
   - bloqueia concorrência por chaves de identidade em ordem determinística;
   - deduplica globalmente por Place ID, URL e combinação nome/endereço;
   - insere a ficha inédita;
   - atualiza o estado do candidato;
   - incrementa exatamente um contador (salvo ou duplicado);
   - avança o cursor e o checkpoint;
   - atualiza o checkpoint da sessão.
6. Tudo isso ocorre na mesma transação PostgreSQL. Uma repetição de candidato terminal devolve o resultado já gravado sem incrementar contadores.

## Regra da meta

`total_collected` só aumenta quando a linha de `public.places` é efetivamente inserida. Duplicados aumentam somente `total_duplicates` e nunca consomem a meta de novos estabelecimentos.

## Arquivos

- `supabase/migrations/20261101035329_atomic_scrape_candidate_persistence.sql`: RPCs transacionais.
- `supabase/tests/atomic_scrape_candidate_persistence.sql`: teste de integração com fixtures dentro de transação e rollback.
- `server.ts`: registro e conclusão de candidatos no fluxo principal.

## Gate obrigatório antes de produção

**A migration de persistência atômica já foi aplicada ao Supabase remoto. A migration do consumidor independente ainda está pendente.** Não ativar o modo externo nem fazer deploy dessa etapa antes de:

1. Aplicar `supabase/migrations/20261101040000_independent_scrape_candidate_worker.sql` no projeto `xjfwpkkmhnbkgtkbaseh`.
2. Confirmar que as RPCs de claim, renovação e liberação existem e só podem ser executadas por `service_role`.
3. Executar `supabase/tests/independent_scrape_candidate_worker.sql` e confirmar rollback dos fixtures.
4. Implantar e validar o worker independente conforme `docs/INDEPENDENT_SCRAPE_WORKER.md`.
5. Fazer uma coleta controlada com meta pequena antes de ativar o modo externo na Vercel.

Não alterar nem limpar os candidatos históricos sem sessão (83 registros observados na auditoria). A migration e o teste não os modificam.

## Limites desta entrega

O consumidor independente está implementado em código, mas sua migration ainda não foi aplicada ao Supabase remoto e o worker ainda não foi implantado. O modo externo é opt-in; o fluxo inline continua sendo o padrão até a validação e o rollout documentados em `docs/INDEPENDENT_SCRAPE_WORKER.md`.
