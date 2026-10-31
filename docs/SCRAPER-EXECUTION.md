# Execução do scraper em lotes

## Por que o fluxo foi dividido

A API roda em Vercel Functions com maxDuration de 60 segundos. Uma execução monolítica que abre o Maps, descobre resultados e visita todas as fichas pode exceder esse limite. O processo era encerrado no meio e o registro permanecia como running.

## Fluxo atual

1. POST /api/v1/jobs cria o job com phase=discovering.
2. A primeira etapa abre o Google Maps e persiste as URLs encontradas em candidate_urls, dentro do snapshot do job em app_state.
3. A interface consulta GET /api/v1/jobs/:id a cada dois segundos.
4. Cada consulta agenda no máximo uma etapa curta: discovery localiza e persiste URLs; processing processa uma ficha por invocação e avança candidate_cursor.
5. worker_locked_until no registro relacional scrape_jobs impede duas instâncias de processarem o mesmo job simultaneamente.
6. heartbeat_at permite detectar workers abandonados; o cursor persistido permite retomar a próxima ficha.
7. A barra usa duas fases: descoberta (0–70%) e processamento das URLs persistidas (70–100%).

## Módulos

- src/server/scraper/browser.ts: conexão Browserless com timeout explícito e fechamento de conexões tardias.
- src/server/scraper/job-runner.ts: descoberta, processamento incremental, persistência do cursor, retry e encerramento.
- src/server/scraper/extractor.ts: extração da ficha do Google Maps.
- src/server/scraper/normalizer.ts: normalização e identificação de registros.
- src/shared/types.ts: estado persistido do job.
- src/components/SearchScreen.tsx: representação do progresso por fase.

## Limites e operação

- Cada invocação processa uma ficha, para caber no limite de 60 segundos mesmo com uma navegação lenta.
- A execução continua enquanto a interface mantém o polling do job. Se o usuário fechar a página, o job pausa entre lotes e retoma quando o histórico/progresso voltar a ser consultado.
- A conexão Browserless tem timeout de 8 segundos por tentativa e no máximo duas tentativas.
- Erros em uma ficha são registrados e avançam o cursor; falhas de infraestrutura são tentadas novamente até três vezes.
- Não executar coletas de produção como teste automatizado. Validar primeiro com uma busca pequena e conferir scrape_jobs, app_state e places.

## Banco

A migração 20261031_scrape_worker_lease.sql adiciona worker_locked_until em public.scrape_jobs. Os demais dados de execução ficam no objeto do job dentro de app_state, preservando compatibilidade com a estrutura atual.