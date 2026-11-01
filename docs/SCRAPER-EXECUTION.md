# Execução sequencial do scraper Google Maps

## Objetivo

Pesquisar estabelecimentos no Google Maps, abrir cada ficha, extrair os campos definidos no contrato Firecrawl, evitar duplicidades e salvar cada contato no banco de dados.

A coleta não usa uma etapa global de descoberta seguida de uma fila de processamento. O fluxo é sequencial e cada ficha concluída atualiza imediatamente o checkpoint.

## Fluxo único

1. `POST /api/v1/jobs` cria uma execução e recupera o checkpoint da sessão para a combinação de usuário, segmento, localização, projeto e categoria.
2. O worker abre a mesma pesquisa no Google Maps.
3. Se já existe `last_processed_url`, reconstrói o feed virtualizado até localizar essa ficha e seleciona o resultado seguinte. Nunca usa pixels como identidade de retomada.
4. Abre a ficha seguinte e executa `extractPlaceDetails()`.
5. Consulta o banco para identificar a ficha por ID/URL da fonte e, quando necessário, nome + endereço.
6. Se já existe, marca como duplicada e avança o checkpoint. Se for nova, salva todos os campos do contrato e avança o checkpoint.
7. O checkpoint é persistido com a URL/ID da última ficha efetivamente processada, o resultado (salva ou duplicada), a data e a contagem.
8. O próximo passo abre novamente a pesquisa e continua depois dessa ficha.

## Retomada e meta original

Ao iniciar novamente a mesma pesquisa não esgotada, o backend reutiliza o mesmo job interrompido/parcial/falho e a mesma sessão. Não cria um job com contadores zerados.

- A meta é a quantidade original salva em `limit_requested`; mudar o seletor ao tentar retomar não reinicia nem amplia a meta daquele job.
- `total_collected` permanece acumulado e representa somente inserts inéditos confirmados.
- O saldo é `max(0, limit_requested - total_collected)`. Exemplo: uma meta de 20 com 15 inserts confirmados retoma para salvar no máximo mais 5.
- Duplicados e resultados revisitados durante a reconstrução do feed não consomem a meta.
- A retomada limpa a solicitação de cancelamento anterior, mantém o mesmo ID de job e continua pelo checkpoint persistido.
- Ao alcançar a meta original, o loop encerra sem abrir a ficha seguinte.

## Regra do checkpoint

O checkpoint oficial é `discovery_checkpoint.last_processed_url`, acompanhado de `last_processed_source_key` e `last_processed_at`.

- `last_seen_url` e `scroll_top` são dados históricos/diagnósticos; não determinam a retomada.
- Uma ficha só vira checkpoint depois de ser salva ou reconhecida como duplicada.
- Se a extração ou persistência falhar, o checkpoint continua apontando para a ficha anterior. A próxima tentativa abre novamente a ficha pendente.
- Se o feed não reencontrar a âncora, a execução pausa e preserva o checkpoint. Não reinicia silenciosamente do primeiro resultado.
- Sessões antigas são migradas usando a última linha de `scrape_candidates` com status `processed` ou `duplicate`. A fila antiga não recebe novos itens.

## Execução e monitoramento

- `GET /api/v1/jobs/:id` é somente leitura: consulta progresso e não abre navegador.
- `POST /api/v1/jobs/:id/step` agenda uma etapa limitada do worker.
- A interface consulta o progresso e solicita explicitamente a próxima etapa quando o job continua `running`.
- `worker_locked_until` impede que duas instâncias processem simultaneamente a mesma sessão.
- Cada etapa processa até cinco fichas ou até atingir o orçamento de execução. O checkpoint é gravado ficha a ficha, não apenas no final do lote.
- Três falhas consecutivas na ficha pendente pausam o job, mantendo a âncora anterior.

## Contrato de dados preservado

O fluxo chama o extrator existente e preserva os campos de `PlaceRecord` definidos nos documentos:

- `docs/mapeamento-detalhado-ficha-google-maps-bearzil.md`
- `docs/mapeamento-verificado-firecrawl-bearzil.md`
- `docs/matriz-cobertura-firecrawl-implantacao.md`
- `docs/validacao-cobertura-firecrawl-2026-10-27.md`

Não coleta rótulos de interface como atributos comerciais, não inventa valores para campos vazios e mantém `field_status` para diferenciar o que foi capturado do que não foi observado naquela sessão.

## Módulos

- `src/server/scraper/browser.ts`: conexão com Browserless/Chromium remoto.
- `src/server/scraper/job-runner.ts`: fluxo sequencial, retomada, deduplicação, salvamento e checkpoint.
- `src/server/scraper/extractor.ts`: extração dos campos da ficha.
- `src/server/scraper/normalizer.ts`: normalização, endereço e identificadores da fonte.
- `server.ts`: persistência, sessão, lease e endpoints de execução/monitoramento.
- `src/App.tsx`: polling de leitura e solicitação explícita da próxima etapa.

## Compatibilidade e validação

- A tabela `scrape_candidates` permanece apenas como fonte de migração para sessões antigas. O fluxo novo não descobre e persiste uma fila intermediária.
- `candidate_cursor` e `next_ordinal` permanecem por compatibilidade com jobs/sessões antigos; o checkpoint por URL é a referência para novas execuções.
- Não foi realizada coleta real nesta alteração. A aprovação de produção exige CI verde, deployment concluído e uma coleta pequena validando a retomada, a deduplicação e a persistência no banco remoto.
