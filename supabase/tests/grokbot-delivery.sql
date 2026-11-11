-- Isolated queue, runner ownership and idempotent terminal callbacks.
begin;
insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at) values
('93000000-0000-4000-8000-000000000001','integration_test','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,repeat('a',64),'{}',now()+interval '1 hour'),
('93000000-0000-4000-8000-000000000002','integration_test','1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk',1042918180,repeat('b',64),'{}',now()+interval '1 hour');
do $$ declare claimed uuid; blocked boolean:=false; begin
 select id into claimed from claim_grokbot_dispatch();
 assert claimed='93000000-0000-4000-8000-000000000001','FIFO dispatch';
 assert not exists(select 1 from claim_grokbot_dispatch()),'one active destination';
 assert claim_grokbot_runner(claimed,'93000000-0000-4000-8000-000000000003'),'first runner claims';
 assert not claim_grokbot_runner(claimed,'93000000-0000-4000-8000-000000000004'),'duplicate runner denied';
 begin perform record_grokbot_result(claimed,'93000000-0000-4000-8000-000000000004','completed','{}',null); exception when others then blocked:=true; end;
 assert blocked,'wrong runner cannot finish';
 perform record_grokbot_result(claimed,'93000000-0000-4000-8000-000000000003','completed','{"verified":true}',null);
 perform record_grokbot_result(claimed,'93000000-0000-4000-8000-000000000003','failed','{}','late callback');
 assert (select status='completed' from grokbot_operations where id=claimed),'terminal receipt is immutable';
 select id into claimed from claim_grokbot_dispatch();
 assert claimed='93000000-0000-4000-8000-000000000002','next queued operation dispatches';
end $$;
rollback;
