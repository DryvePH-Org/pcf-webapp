-- Phase 64: pace the Grokbot queue.
--
-- Until now each sheet ran one job at a time, but different sheets ran side by side, and the bots (which can share a
-- machine) sometimes mixed up their runs. Now the whole app feeds the bots one job at a time, oldest first. A job the
-- bot never started is sent again, then put back in the queue with a wait that grows each time, and only after three
-- starts is it left for a person ("needs attention").

alter table public.grokbot_operations
  -- how many times the job has been handed to the bot
  add column attempts int not null default 0,
  -- when the current start began (a resend does not change it)
  add column started_at timestamptz,
  -- a job put back in the queue waits until this time
  add column not_before timestamptz;

create or replace function public.claim_grokbot_dispatch() returns setof public.grokbot_operations
language plpgsql security definer set search_path=public as $$
declare operation uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('grokbot-dispatch',0));
 -- a refresh that Grokbot never answered must not hold up the queue (refreshes only read the sheet, so releasing one is safe)
 update grokbot_operations set status='failed',error='Grokbot did not answer in time. Refresh again.',updated_at=now()
  where kind='workbook_refresh' and status='running' and updated_at<now()-interval '10 minutes';
 update grokbot_operations set status='failed',error='A newer refresh replaced this one.',updated_at=now()
  where kind='workbook_refresh' and status='queued' and created_at<now()-interval '10 minutes';
 select q.id into operation from grokbot_operations q
  where q.status='queued'
    and (q.not_before is null or q.not_before<=now())
    -- one job at a time across every sheet
    and not exists (select 1 from grokbot_operations r where r.status='running')
  order by q.created_at, q.id limit 1 for update;
 if operation is null then return; end if;
 return query update grokbot_operations
   set status='running',updated_at=now(),started_at=now(),attempts=attempts+1,not_before=null
   where id=operation returning *;
end $$;
