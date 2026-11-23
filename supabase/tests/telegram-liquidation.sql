-- Phase 61: filing a liquidation through the Telegram bot. All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('98000000-0000-4000-8000-000000000001','employee@tl.invalid'),
('98000000-0000-4000-8000-000000000002','custodian@tl.invalid'),
('98000000-0000-4000-8000-000000000003','other@tl.invalid');
insert into profiles(id,full_name,role) values
('98000000-0000-4000-8000-000000000001','Tele Employee','custodian'),
('98000000-0000-4000-8000-000000000002','Tele Custodian','custodian'),
('98000000-0000-4000-8000-000000000003','Someone Else','custodian');
insert into funds(id,name,amount,per_txn_limit,approval_threshold,custodian_self_approval) values
('98000000-0000-4000-8000-000000000010','Tele fund',100000,50000,30000,true);
insert into fund_custodians(fund_id,custodian_id) values
('98000000-0000-4000-8000-000000000010','98000000-0000-4000-8000-000000000002');

do $$
declare req uuid; voucher uuid; liq uuid; again uuid; refused boolean; l public.liquidations; line uuid:=gen_random_uuid();
begin
 -- an advance released to the employee (made as the employee, the way the bot makes a request)
 req:=telegram_create_budget_request('98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000010',1000,'Tele supplies');
 perform set_config('request.jwt.claim.sub','98000000-0000-4000-8000-000000000002',true);
 perform review_budget_request(req,true,null);
 voucher:=save_workflow_voucher(null,'98000000-0000-4000-8000-000000000010',req,'Tele Employee',current_date,
   '[{"particulars":"Supplies","amount":1000}]','none',null);
 update vouchers set status='released', released_at=now() where id=voucher;

 -- 1. The bot opens the liquidation as the employee, and opening it again finds the same one.
 liq:=telegram_create_liquidation('98000000-0000-4000-8000-000000000001',voucher);
 again:=telegram_create_liquidation('98000000-0000-4000-8000-000000000001',voucher);
 assert liq=again,'opening twice gives the same liquidation';
 select * into l from liquidations where id=liq;
 assert l.owner_id='98000000-0000-4000-8000-000000000001','it belongs to the employee';
 assert l.status='draft','as a draft';

 -- 2. Someone else cannot open or save it through the bot.
 refused:=false;
 begin perform telegram_create_liquidation('98000000-0000-4000-8000-000000000003',voucher); exception when others then refused:=true; end;
 assert refused,'another person cannot open this advance';
 refused:=false;
 begin perform telegram_save_liquidation('98000000-0000-4000-8000-000000000003',liq,'Ops','[]'::jsonb); exception when others then refused:=true; end;
 assert refused,'another person cannot save into it';
 refused:=false;
 begin perform telegram_submit_liquidation('98000000-0000-4000-8000-000000000003',liq); exception when others then refused:=true; end;
 assert refused,'another person cannot submit it';

 -- 3. An inactive account cannot act.
 update profiles set is_active=false where id='98000000-0000-4000-8000-000000000003';
 refused:=false;
 begin perform telegram_act_as('98000000-0000-4000-8000-000000000003'); exception when others then refused:=true; end;
 assert refused,'an inactive account is refused';

 -- 4. Save the lines the person sent, then submit.
 insert into storage.objects(bucket_id,name,owner) values('liquidation-receipts',liq::text||'/'||line::text||'/a.jpg',null) on conflict do nothing;
 perform telegram_save_liquidation('98000000-0000-4000-8000-000000000001',liq,'Operations',
   jsonb_build_array(jsonb_build_object('id',line,'particulars','Gasolina','amount',450,'receipt_path',liq::text||'/'||line::text||'/a.jpg','no_receipt_reason','')));
 assert (select count(*) from liquidation_items where liquidation_id=liq)=1,'the bot replaced the advance lines with the receipts';
 assert (select total_spent from liquidations where id=liq)=450,'the total follows the lines';
 perform telegram_submit_liquidation('98000000-0000-4000-8000-000000000001',liq);
 assert (select status from liquidations where id=liq)='submitted','it is submitted for the custodian to review';

 -- 5. A submitted liquidation cannot be changed through the bot.
 refused:=false;
 begin perform telegram_save_liquidation('98000000-0000-4000-8000-000000000001',liq,'Operations','[]'::jsonb); exception when others then refused:=true; end;
 assert refused,'a submitted liquidation is closed to the bot';
end $$;

-- 6. The bot's working tables are private.
do $$
begin
 assert not has_table_privilege('authenticated','public.telegram_liq_drafts','select'),'drafts are not readable by users';
 assert not has_table_privilege('authenticated','public.telegram_liq_lines','select'),'lines are not readable by users';
 assert not has_function_privilege('authenticated','public.telegram_submit_liquidation(uuid,uuid)','execute'),'the bot function is service only';
end $$;
rollback;
