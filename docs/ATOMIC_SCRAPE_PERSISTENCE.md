# Persistência atômica da coleta

## Objetivo

Registrar cada resultado do Google Maps, descartar duplicados rapidamente e persistir somente fichas inéditas. A ficha, os contadores e o checkpoint devem avançar na mesma transação.

## Fluxo único de execução

1. O processo de coleta reivindica a lease da sessão de pesquisa.
2. Ao encontrar um resultado no feed, chama `register_scrape_candidate`.
3. A RPC deduplica imediatamente por Place ID e URL normalizada. Se já existir, registra o resultado como duplicado, avança o checkpoint e o feed continua — sem abrir a ficha e sem avisos desnecessários ao usuário.
4. Se o resultado for inédito, o próprio processo abre a ficha e extrai os dados.
5. `complete_scrape_candidate` faz a deduplicação final por Place ID, URL e combinação nome/endereço; insere somente se ainda for inédito; atualiza candidato, contadores e checkpoint atomicamente.
6. Retries de candidatos já concluídos são idempotentes e não incrementam contadores novamente.

Não existe consumidor independente, fila paralela de extração, Docker worker ou modo externo. A descoberta e a extração permanecem no mesmo fluxo sequencial.

## Regra da meta

- `total_collected` aumenta somente quando uma linha inédita é efetivamente inserida em `public.places`.
- `total_duplicates` aumenta quando um resultado é descartado como duplicado.
- Duplicados não consomem a meta de novos estabelecimentos.
- O checkpoint só avança depois da decisão persistida pela RPC.

## Recuperação do navegador

Se o Google Maps substituir o frame do feed e o Puppeteer retornar `detached frame`, a coleta recria somente a página do feed quando a conexão Chromium continua ativa. Se a conexão também caiu, reconecta ao Chromium. Em seguida, reabre a pesquisa, reencontra a última URL confirmada no checkpoint e continua pelo resultado seguinte. A ficha pendente não é contada nem descartada por causa da falha do frame.

## Arquivos

- `supabase/migrations/20261101035329_atomic_scrape_candidate_persistence.sql`: RPCs transacionais.
- `supabase/tests/atomic_scrape_candidate_persistence.sql`: teste de integração com fixtures dentro de transação e rollback.
- `server.ts`: execução sequencial, deduplicação, extração, recuperação do frame e persistência.

## Estado do banco remoto

A migration de persistência atômica está aplicada no projeto `xjfwpkkmhnbkgtkbaseh`. A migration experimental do consumidor independente foi revertida por uma migration posterior; suas funções, índice e colunas específicas foram removidos. Os candidatos históricos não foram apagados nem reclassificados.

## Retomada da pesquisa e paginação infinita

- Uma nova execução com o mesmo usuário, segmento, localização, projeto e categoria reutiliza a sessão não esgotada mais recente.
- A retomada carrega o último URL confirmado e o ordinal da sessão. O feed é percorrido até reencontrar essa âncora; resultados anteriores são apenas usados para reposicionar a navegação, sem registrar candidatos, consultar duplicidade ou abrir fichas.
- Sessões marcadas como esgotadas não são reutilizadas; uma nova pesquisa começa com sessão nova.
- A paginação não depende apenas de uma pausa fixa. A cada rolagem, o processo verifica crescimento de `scrollHeight`, aumento/alteração dos links e a mensagem explícita de fim da lista.
- Se a rolagem não trouxer novos resultados, são feitas novas tentativas limitadas. Ausência de crescimento não é tratada como fim da lista: o job pausa como parcial, preservando a âncora para retomada.
- Eventos `feed_pagination_advanced` e `feed_pagination_waiting` registram a evidência de avanço ou ausência de avanço do feed.
