-- All financial and identity fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('91000000-0000-4000-8000-000000000001','requester@workflow.invalid'),
('91000000-0000-4000-8000-000000000002','custodian@workflow.invalid'),
('91000000-0000-4000-8000-000000000003','accounting@workflow.invalid'),
('91000000-0000-4000-8000-000000000004','approver@workflow.invalid');
insert into profiles(id,full_name,role) values
('91000000-0000-4000-8000-000000000001','Workflow Requester','requester'),
('91000000-0000-4000-8000-000000000002','Workflow Custodian','custodian'),
('91000000-0000-4000-8000-000000000003','Workflow Accounting','accounting'),
('91000000-0000-4000-8000-000000000004','Workflow Approver','approver');
insert into funds(id,name,amount,per_txn_limit,approval_threshold) values('91000000-0000-4000-8000-000000000010','Workflow test fund',10000,5000,3000);
insert into fund_custodians(fund_id,custodian_id) values('91000000-0000-4000-8000-000000000010','91000000-0000-4000-8000-000000000002');
update sheet_workbooks set fund_id='91000000-0000-4000-8000-000000000010',custodian_id='91000000-0000-4000-8000-000000000002',enabled=true,active_sheet_id=1,catalog='[{"sheetId":1,"title":"Test sheet","expenseTags":["CE - FUEL","CE - OTHERS","NCE - OTHERS"]}]' where id='buying';
insert into sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,voucher,category,particulars,person,supplier,plate,receipt_number,company,amount)
values('buying',1,1,'Test sheet',current_date,'TEST','CE - FUEL','Fuel','Employee','Supplier','','','MAD',500);

do $$ declare req uuid; voucher uuid; liquidation uuid; replenishment uuid; preview uuid; line uuid:=gen_random_uuid(); path text; blocked boolean; rev int; number text; begin
 assert not has_function_privilege('authenticated','public.create_voucher_lines(uuid,text,jsonb,date,text,text,text)','execute'),'legacy creation cannot bypass the new flow';
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
 req:=create_budget_request('91000000-0000-4000-8000-000000000010','Editable request name',500,'Fuel budget');
 assert (select requester_name='Workflow Requester' from budget_requests where id=req),'requester name comes from the signed-in profile';
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
 perform review_budget_request(req,true,null);
 update sheet_expenses set voucher='0049' where book_id='buying' and sheet_id=1 and source_row=1;
 assert suggest_voucher_number('91000000-0000-4000-8000-000000000010')='0050','first voucher can continue the assigned workbook sequence';
 update sheet_expenses set voucher='TEST' where book_id='buying' and sheet_id=1 and source_row=1;
 assert 'NCE - OTHERS'=any(list_custodian_tags('91000000-0000-4000-8000-000000000010')),'unused CE/NCE tags are available from template summaries';
 voucher:=save_workflow_voucher(null,'91000000-0000-4000-8000-000000000010',req,'Editable request name',current_date,'[{"particulars":"Fuel","amount":500}]','auto',null);
 assert (select paper_pcv_number='0001' and receipt_path is null from vouchers where id=voucher),'automatic number and no voucher attachment';
 perform release_voucher(voucher);
 assert (select expected_cash=9500 from fund_balance_v where fund_id='91000000-0000-4000-8000-000000000010'),'cash deducted only at release';
 perform save_workflow_voucher(null,'91000000-0000-4000-8000-000000000010',null,'Manual',current_date,'[{"particulars":"Draft","amount":1}]','manual','0050');
 number:=suggest_voucher_number('91000000-0000-4000-8000-000000000010');assert number='0051','manual number advances the suggested sequence';
 perform save_workflow_voucher(null,'91000000-0000-4000-8000-000000000010',null,'No number',current_date,'[{"particulars":"Draft","amount":1}]','none',null);
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
 liquidation:=create_liquidation(voucher);
 assert (select employee_name='Workflow Requester' from liquidations where id=liquidation),'locked account name';
 blocked:=false;
 begin perform save_liquidation(liquidation,'Operations',current_date+1,'[]','Not spent');exception when others then blocked:=true;end;
 assert blocked,'filing date cannot change';
 blocked:=false;begin update liquidations set filing_date=filing_date+1 where id=liquidation;exception when others then blocked:=true;end;assert blocked,'direct updates cannot change the filing date';
 perform save_liquidation(liquidation,'Operations',current_date,jsonb_build_array(jsonb_build_object('id',line,'particulars','Fuel','amount',500,'sheet_details',jsonb_build_object('supplier','FORGED','plate','ABC123'))),null);
 assert (select sheet_details->>'supplier' is null from liquidation_items where liquidation_id=liquidation),'requester cannot encode supplier or tags';
 path:=liquidation::text||'/'||line::text||'/receipt.heic';
 insert into storage.objects(bucket_id,name) values('liquidation-receipts',path);
 perform save_liquidation(liquidation,'Operations',current_date,jsonb_build_array(
  jsonb_build_object('id',line,'particulars','Fuel','amount',250,'receipt_path',path,'sheet_details',jsonb_build_object('plate','ABC123')),
  jsonb_build_object('id',gen_random_uuid(),'particulars','Parking','amount',250)
 ),null);
 perform submit_liquidation(liquidation);
 assert (select count(*)=1 from liquidation_items where liquidation_id=liquidation and receipt_path is null and no_receipt_reason='No receipt provided'),'receiptless expense can be submitted';
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000002',true);
 select receipt_review_revision into rev from liquidations where id=liquidation;
 blocked:=false;
 begin perform save_custodian_receipts(liquidation,rev,jsonb_build_array(jsonb_build_object('particulars','Fuel','amount',500,'supplier','Supplier','tin','NON VAT','tag','CE - FUEL','expense_date',current_date,'receipt_path',path,'physical_checked',false)));exception when others then blocked:=true;end;
 assert blocked,'physical receipt check is mandatory';
 perform save_custodian_receipts(liquidation,rev,jsonb_build_array(
  jsonb_build_object('particulars','Fuel','amount',250,'supplier','Supplier','tin','NON VAT','tag','CE - FUEL','expense_date',current_date,'receipt_path',path,'physical_checked',true),
  jsonb_build_object('particulars','Parking','amount',250,'tag','NCE - CUSTOM','expense_date',current_date,'physical_checked',true)
 ));
 select receipt_review_revision into rev from liquidations where id=liquidation;
 insert into sheet_previews(liquidation_id,reviewer_id,revision,book_id,config_version,sheet_id,sheet_name,operation_id,requests,google_token,summary)
 select liquidation,auth.uid(),l.revision,'buying',w.config_version,1,'Test sheet','workflow_test','[]','test',jsonb_build_object('review_revision',rev-1) from liquidations l cross join sheet_workbooks w where l.id=liquidation and w.id='buying' returning id into preview;
 blocked:=false;begin perform approve_liquidation_with_sheet(preview);exception when others then blocked:=true;end;assert blocked,'stale receipt review cannot approve';
 update sheet_previews set summary=jsonb_build_object('review_revision',rev) where id=preview;
 perform approve_liquidation_with_sheet(preview);
 assert (select expected_cash=9500 from fund_balance_v where fund_id='91000000-0000-4000-8000-000000000010'),'liquidation approval does not change cash';
 update sheet_jobs set status='synced' where liquidation_id=liquidation;
 assert 'NCE - CUSTOM'=any(list_custodian_tags('91000000-0000-4000-8000-000000000010')),'custom tags are available for the workbook after sync';
 replenishment:=create_replenishment('91000000-0000-4000-8000-000000000010');perform submit_replenishment(replenishment);
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
 perform review_replenishment(replenishment,true,null);
 assert (select status='accounting_approved' from replenishments where id=replenishment),'accounting review waits for approver even below limit';
 blocked:=false;begin perform close_replenishment(replenishment);exception when others then blocked:=true;end;assert blocked,'no cash handover before independent approval';
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000004',true);
 perform approve_replenishment(replenishment,true,null);
 assert (select expected_cash=9500 from fund_balance_v where fund_id='91000000-0000-4000-8000-000000000010'),'approver approval does not move cash';
 perform set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000003',true);
 perform close_replenishment(replenishment);
 assert (select expected_cash=10000 from fund_balance_v where fund_id='91000000-0000-4000-8000-000000000010'),'actual handover restores fund';
 assert (select count(*)=1 from sheet_rollovers where replenishment_id=replenishment),'only cash handover queues next numbered worksheet';
 blocked:=false;begin perform close_replenishment(replenishment);exception when others then blocked:=true;end;assert blocked,'cash cannot be recorded twice';
end $$;
rollback;
