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

- `supabase/migrations/20261101030000_atomic_scrape_candidate_persistence.sql`: RPCs transacionais.
- `supabase/tests/atomic_scrape_candidate_persistence.sql`: teste de integração com fixtures dentro de transação e rollback.
- `server.ts`: registro e conclusão de candidatos no fluxo principal.

## Gate obrigatório antes de produção

**A migration ainda não foi aplicada ao Supabase remoto.** O código novo depende das duas RPCs; portanto, não fazer merge/deploy de produção antes de:

1. Confirmar que a migration aparece como pendente no projeto `xjfwpkkmhnbkgtkbaseh`.
2. Aplicar a migration `20261101030000_atomic_scrape_candidate_persistence`.
3. Confirmar que as funções existem com as assinaturas esperadas e que o acesso está restrito a `service_role`.
4. Executar `supabase/tests/atomic_scrape_candidate_persistence.sql` no banco e confirmar que o bloco termina sem exceção e faz rollback dos fixtures.
5. Fazer uma coleta controlada com meta pequena e verificar: ficha inédita salva uma vez; duplicado descartado; contador e checkpoint coerentes; retry não duplica.

Não alterar nem limpar os candidatos históricos sem sessão (83 registros observados na auditoria). A migration e o teste não os modificam.

## Limites desta entrega

O consumidor ainda executa a descoberta e o processamento dentro do mesmo worker/browser. A tabela de candidatos agora é usada como diário durável e fonte de idempotência, mas ainda não existe um consumidor independente que reivindique candidatos pendentes com `SKIP LOCKED`. Esse desacoplamento fica para a próxima etapa, após validar esta persistência transacional.
