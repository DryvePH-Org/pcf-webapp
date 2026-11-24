-- Phase 64: the whole app feeds the bots one job at a time, oldest first; a job put back waits for its time.
-- All fixtures roll back. Run only against an isolated database.
begin;
do $$
declare buying text:='1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk'; dryve text:='1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ';
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); c uuid:=gen_random_uuid(); claimed uuid; r record;
begin
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,created_at) values
  (a,'integration_test',buying,1042918180,repeat('a',64),'{}',now()+interval '2 hours',now()-interval '3 minutes'),
  (b,'integration_test',dryve,1251133408,repeat('b',64),'{}',now()+interval '2 hours',now()-interval '2 minutes'),
  (c,'integration_test',buying,1042918180,repeat('c',64),'{}',now()+interval '2 hours',now()-interval '1 minute');

 -- 1. Oldest first, and a start is counted.
 select * into r from claim_grokbot_dispatch();
 assert r.id=a,'the oldest job goes first';
 assert r.attempts=1 and r.started_at is not null,'the start is counted and timed';

 -- 2. Nothing else starts while one is running, even for another sheet.
 assert not exists(select 1 from claim_grokbot_dispatch()),'one job at a time across every sheet';

 -- 3. A job put back waits for its time, and the next one goes ahead of it.
 update grokbot_operations set status='queued',runner_id=null,not_before=now()+interval '10 minutes' where id=a;
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=b,'the next job goes while the first waits';
 update grokbot_operations set status='completed' where id=b;
 select id into claimed from claim_grokbot_dispatch();
 assert claimed=c,'a waiting job is skipped until its time';
 update grokbot_operations set status='completed' where id=c;
 assert not exists(select 1 from claim_grokbot_dispatch()),'nothing is due';
 update grokbot_operations set not_before=now()-interval '1 second' where id=a;
 select * into r from claim_grokbot_dispatch();
 assert r.id=a and r.attempts=2 and r.not_before is null,'it goes once its time has come, as a second start';

 -- 4. A refresh nobody answered is still released, so it cannot hold the queue.
 update grokbot_operations set status='completed' where id=a;
 insert into grokbot_operations(id,kind,status,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,updated_at) values
  (gen_random_uuid(),'workbook_refresh','running',buying,1042918180,repeat('d',64),'{}',now()+interval '1 hour',now()-interval '30 minutes');
 perform claim_grokbot_dispatch();
 assert not exists(select 1 from grokbot_operations where kind='workbook_refresh' and status='running'),'an unanswered refresh is released';
end $$;
rollback;
