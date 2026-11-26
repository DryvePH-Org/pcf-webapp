-- Phase 68: an administrator sends a liquidation back, or deletes it, so it can be done again. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('98100000-0000-4000-8000-000000000001','custodian@ar.invalid'),
('98100000-0000-4000-8000-000000000002','admin@ar.invalid'),
('98100000-0000-4000-8000-000000000003','requester@ar.invalid');
insert into profiles(id,full_name,role) values
('98100000-0000-4000-8000-000000000001','Custodian','custodian'),
('98100000-0000-4000-8000-000000000002','Administrator','admin'),
('98100000-0000-4000-8000-000000000003','Requester','requester');

do $$
declare c constant uuid:='98100000-0000-4000-8000-000000000001'; adm constant uuid:='98100000-0000-4000-8000-000000000002';
 r constant uuid:='98100000-0000-4000-8000-000000000003';
 gid int;
 dbf uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; rev int; res jsonb; refused boolean; sid text;
 spreadsheet text;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger,custodian_self_approval) values(dbf,'Reopen fund',100000,50000,3000,false,true);
 insert into fund_custodians(fund_id,custodian_id) values(dbf,c);
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(dbf,'Requester',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,dbf,req,'Requester',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Supplies','amount',2000,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 perform set_config('request.jwt.claim.sub',c::text,true);
 select receipt_review_revision into rev from liquidations where id=liq;
 perform save_custodian_receipts(liq,rev,jsonb_build_array(
   jsonb_build_object('particulars','Supplies','amount',2000,'supplier','Shop','tin','111','tag','NCE - MEALS','expense_date',filing,'plate','N/A','receipt_number','OR-1','physical_checked',true,'receipt_path','')));
 perform approve_liquidation_without_sheet(liq);
 perform set_config('request.jwt.claim.sub','',true);
 assert (select status from liquidations where id=liq)='approved','approved to start with';
 select spreadsheet_id,sheet_id into spreadsheet,gid from grokbot_targets() where book='buying';
 insert into grokbot_operations(id,kind,spreadsheet_id,sheet_id,callback_hash,payload,expires_at,status,liquidation_id)
   values(gen_random_uuid(),'liquidation_approved',spreadsheet,gid,repeat('d',64),'{}',now()+interval '2 hours','completed',liq);
 insert into sheet_edit_log(book_id,fund_id,liquidation_id,voucher,kind,summary) values('buying',dbf,liq,'X','amount_differs','x');

 -- only an administrator, with a reason
 refused:=false; begin perform admin_reopen_liquidation(c,liq,'draft','Wrong amounts typed'); exception when others then refused:=true; end;
 assert refused,'a custodian cannot do it';
 refused:=false; begin perform admin_reopen_liquidation(adm,liq,'draft','no'); exception when others then refused:=true; end;
 assert refused,'a reason is required';
 refused:=false; begin perform admin_reopen_liquidation(adm,liq,'erase','Wrong amounts typed'); exception when others then refused:=true; end;
 assert refused,'only the two known actions';

 -- the preview says what is there
 res:=admin_preview_liquidation_reopen(adm,liq);
 assert (res->>'in_sheet')::boolean and jsonb_array_length(res->'blockers')=0,'the preview sees the sheet job and no blocker: '||res::text;

 -- money that moved on blocks it
 insert into cash_settlements(liquidation_id,voucher_id,fund_id,kind,amount,recorded_by,recorder_name) values(liq,v,dbf,'return',10,c,'Custodian');
 refused:=false; begin perform admin_reopen_liquidation(adm,liq,'draft','Wrong amounts typed'); exception when others then refused:=true; end;
 assert refused,'a recorded settlement blocks it';
 assert jsonb_array_length(admin_preview_liquidation_reopen(adm,liq)->'blockers')=1,'and the preview says so';
 delete from cash_settlements where liquidation_id=liq;
 update grokbot_operations set status='running' where liquidation_id=liq;
 refused:=false; begin perform admin_reopen_liquidation(adm,liq,'draft','Wrong amounts typed'); exception when others then refused:=true; end;
 assert refused,'a job Grokbot is running blocks it';
 update grokbot_operations set status='completed' where liquidation_id=liq;

 -- send back: a draft again, the review and the sheet job gone, the lines kept
 res:=admin_reopen_liquidation(adm,liq,'draft','Wrong amounts typed');
 assert (res->>'in_sheet')::boolean,'it says the sheet had it';
 assert (select status='draft' and reviewed_by is null and receipt_reviewed_by is null from liquidations where id=liq),'back to a draft with no approval';
 assert not exists(select 1 from grokbot_operations where liquidation_id=liq),'the sheet job is gone';
 assert not exists(select 1 from sheet_edit_log where liquidation_id=liq),'the sheet flags are gone';
 assert not exists(select 1 from liquidation_receipt_lines where liquidation_id=liq),'the custodian review is gone';
 assert (select count(*)=1 from liquidation_items where liquidation_id=liq),'the requester lines are kept';
 assert (select status from vouchers where id=v) in ('released','approved'),'the advance is still out';
 assert exists(select 1 from admin_corrections where target_id=liq and action='liquidation_reopened' and actor_id=adm and reason='Wrong amounts typed'),'it is logged';

 -- the owner corrects and submits again, and it goes through the normal review
 perform set_config('request.jwt.claim.sub',r::text,true);
 perform save_liquidation(liq,'Ops',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Supplies fixed','amount',1500,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(liq);
 assert (select status='submitted' and total_spent=1500 from liquidations where id=liq),'submitted again with the corrected amount';

 -- delete: the liquidation is gone, the advance is open again and can be liquidated anew
 res:=admin_reopen_liquidation(adm,liq,'delete','Filed against the wrong advance');
 assert not exists(select 1 from liquidations where id=liq),'deleted';
 assert not exists(select 1 from liquidation_items where liquidation_id=liq),'its lines are gone';
 assert exists(select 1 from admin_corrections where target_id=liq and action='liquidation_deleted'),'the deletion is logged';
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 assert liq is not null and (select status from liquidations where id=liq)='draft','a new liquidation can be started';
 raise notice 'admin-reopen-liquidation: all checks passed';
end $$;
rollback;
