-- Integration test for the independent, leased candidate processor.
-- Run after 20261101040000_independent_scrape_candidate_worker.sql.
-- Every fixture is rolled back.

begin;

do $test$
declare
  v_user_id text := 'worker_test_user_' || gen_random_uuid()::text;
  v_session_id text := 'worker_test_session_' || gen_random_uuid()::text;
  v_job_id text := 'worker_test_job_' || gen_random_uuid()::text;
  v_session_token uuid := gen_random_uuid();
  v_first record;
  v_second record;
  v_reclaimed record;
  v_saved jsonb;
  v_retry jsonb;
  v_release text;
  v_count integer;
  v_job public.scrape_jobs%rowtype;
begin
  insert into public.app_users (id, email, name, password_hash, role)
  values (v_user_id, v_user_id || '@example.invalid', 'Worker test', 'not-a-real-password', 'user');

  insert into public.scrape_search_sessions (
    id, user_id, scope_key, segment, location, next_ordinal,
    lease_token, lease_generation, lease_expires_at
  ) values (
    v_session_id, v_user_id, gen_random_uuid()::text, 'cafeterias', 'São Paulo, SP',
    0, v_session_token, 1, now() + interval '5 minutes'
  );

  insert into public.scrape_jobs (
    id, user_id, search_session_id, segment, location, limit_requested, status
  ) values (
    v_job_id, v_user_id, v_session_id, 'cafeterias', 'São Paulo, SP', 2, 'running'
  );

  insert into public.scrape_candidates (
    id, job_id, user_id, session_id, source_key, source_url, ordinal, status
  ) values
    ('worker_candidate_1', v_job_id, v_user_id, v_session_id, 'worker-key-1', 'https://maps.example/one', 0, 'discovered'),
    ('worker_candidate_2', v_job_id, v_user_id, v_session_id, 'worker-key-2', 'https://maps.example/two', 1, 'discovered');

  select * into v_first
    from public.claim_scrape_candidate('worker-a', 180, 5);
  if v_first.candidate_id <> 'worker_candidate_1' or v_first.attempt_count <> 1 then
    raise exception 'first candidate was not claimed in FIFO order';
  end if;

  -- A second consumer may claim another candidate, but never the same active
  -- lease; per-job capacity remains bounded by the requested target.
  select * into v_second
    from public.claim_scrape_candidate('worker-b', 180, 5);
  if v_second.candidate_id <> 'worker_candidate_2' then
    raise exception 'second worker did not claim the next candidate';
  end if;

  -- Expire the session lease to prove candidate processing is independent of
  -- the discovery worker's lease.
  update public.scrape_search_sessions
     set lease_expires_at = now() - interval '1 second'
   where id = v_session_id;

  v_saved := public.complete_scrape_candidate(
    v_first.candidate_id, v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object(
      'id', 'worker_test_place_1',
      'job_id', v_job_id,
      'name', 'Café Worker Test',
      'category', 'Cafeteria',
      'address', 'Rua Worker, 10',
      'source_place_id', 'worker-place-id-1',
      'source_url', 'https://maps.example/one',
      'maps_url', 'https://maps.example/one'
    ),
    v_first.source_key,
    v_first.source_url,
    v_first.lease_token,
    v_first.lease_generation
  );

  if v_saved->>'outcome' <> 'saved' then
    raise exception 'independent worker could not complete without discovery lease';
  end if;

  v_retry := public.complete_scrape_candidate(
    v_first.candidate_id, v_job_id, v_user_id, v_session_id,
    'saved',
    jsonb_build_object('id', 'worker_test_place_1', 'name', 'Café Worker Test', 'address', 'Rua Worker, 10'),
    v_first.source_key,
    v_first.source_url,
    v_first.lease_token,
    v_first.lease_generation
  );
  if (v_retry->>'already_completed')::boolean is distinct from true then
    raise exception 'worker completion retry was not idempotent';
  end if;

  -- Reclaim an expired processing lease. The generation must fence the stale
  -- worker from renewing or releasing the candidate after reclamation.
  update public.scrape_candidates
     set processing_locked_until = now() - interval '1 second'
   where id = v_second.candidate_id;

  select * into v_reclaimed
    from public.claim_scrape_candidate('worker-c', 180, 2);
  if v_reclaimed.candidate_id <> v_second.candidate_id
     or v_reclaimed.lease_generation <= v_second.lease_generation
     or v_reclaimed.attempt_count <> 2 then
    raise exception 'expired candidate lease was not safely reclaimed';
  end if;

  if public.renew_scrape_candidate_lease(
    v_second.candidate_id, 'worker-b', v_second.lease_token, v_second.lease_generation, 180
  ) then
    raise exception 'stale worker unexpectedly renewed a reclaimed lease';
  end if;

  v_release := public.release_scrape_candidate(
    v_reclaimed.candidate_id, 'worker-c', v_reclaimed.lease_token,
    v_reclaimed.lease_generation, 'synthetic retry exhaustion', 2
  );
  if v_release <> 'failed' then
    raise exception 'candidate should become failed after maximum attempts';
  end if;

  select count(*) into v_count from public.places where job_id = v_job_id;
  select * into v_job from public.scrape_jobs where id = v_job_id;
  if v_count <> 1 or v_job.total_collected <> 1 or v_job.total_errors <> 1 then
    raise exception 'unexpected worker persistence counters: places %, collected %, errors %',
      v_count, v_job.total_collected, v_job.total_errors;
  end if;
end;
$test$;

rollback;
