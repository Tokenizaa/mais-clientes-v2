-- A search scope can have many independent executions. Session identity is per run,
-- while scope_key remains descriptive/filterable metadata only.
drop index if exists public.scrape_search_sessions_user_scope_unique;

create index if not exists scrape_search_sessions_user_scope_idx
  on public.scrape_search_sessions (user_id, scope_key, created_at desc);
