-- Phase 58: what accounting changes by hand in the sheet reaches the app. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96300000-0000-4000-8000-000000000001','custodian@se.invalid'),
('96300000-0000-4000-8000-000000000002','requester@se.invalid'),
('96300000-0000-4000-8000-000000000003','accounting@se.invalid');
insert into profiles(id,full_name,role) values
('96300000-0000-4000-8000-000000000001','Custodian','custodian'),
('96300000-0000-4000-8000-000000000002','Requester','requester'),
('96300000-0000-4000-8000-000000000003','Accounting','accounting');

do $$
declare c constant uuid:='96300000-0000-4000-8000-000000000001'; r constant uuid:='96300000-0000-4000-8000-000000000002';
 acc constant uuid:='96300000-0000-4000-8000-000000000003';
 dbf uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; rev int; lines jsonb; voucher_no text; res jsonb;
 meals_line uuid; fuel_line uuid; msg text;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(dbf,'Edits fund',100000,50000,3000,false);
 insert into fund_custodians(fund_id,custodian_id) values(dbf,c);
 perform set_config('request.jwt.claim.sub',c::text,true);
 -- an approved liquidation with two lines
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
 lines:=jsonb_build_array(
   jsonb_build_object('particulars','Lunch at Jollibee','amount',1200,'supplier','Diner','tin','111','tag','NCE - MEALS','expense_date',filing,'plate','N/A','receipt_number','OR-1','physical_checked',true,'receipt_path',''),
   jsonb_build_object('particulars','Gas','amount',800,'supplier','Gas Co','tin','222','tag','CE - FUEL','expense_date',filing,'plate','ABC 123','receipt_number','','physical_checked',true,'receipt_path',''));
 perform save_custodian_receipts(liq,rev,lines);
 perform approve_liquidation_without_sheet(liq);
 select case when vv.flow_version=2 then coalesce(nullif(vv.paper_pcv_number,''),vv.pcv_number) else vv.pcv_number end into voucher_no from vouchers vv where vv.id=v;
 select id into meals_line from liquidation_receipt_lines where liquidation_id=liq and amount=1200;
 select id into fuel_line from liquidation_receipt_lines where liquidation_id=liq and amount=800;

 -- a workbook for this fund, with the tags its summary of accounts lists (the sheet is not connected: only the rows matter here)
 update sheet_workbooks set fund_id=dbf, enabled=false, custodian_id=null,
   catalog=jsonb_build_array(jsonb_build_object('sheetId',active_sheet_id,'title','t','expenseTags',jsonb_build_array('NCE - MEALS','NCE - REPRESENTATION','CE - FUEL')))
 where id='buying';
 perform set_config('request.jwt.claim.sub','',true);

 -- the sheet agrees with the app: nothing happens
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - MEALS','particulars','Lunch at Jollibee','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','CE - FUEL','particulars','Gas','amount',800)));
 assert (res->>'applied')::int=0 and (res->>'flagged')::int=0,'no difference, nothing done: '||res::text;

 -- accounting moves the meal to representation in the sheet: the app follows, on record
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - REPRESENTATION','particulars','LUNCH AT JOLLIBEE','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','CE - FUEL','particulars','Gas','amount',800)));
 assert (res->>'applied')::int=1,'one tag followed the sheet: '||res::text;
 assert (select tag from liquidation_receipt_lines where id=meals_line)='NCE - REPRESENTATION','the app line has the new tag';
 assert (select tag from liquidation_receipt_lines where id=fuel_line)='CE - FUEL','the other line is untouched';
 assert exists(select 1 from sheet_edit_log where kind='tag_changed' and applied and app_value='NCE - MEALS' and sheet_value='NCE - REPRESENTATION' and line_id=meals_line),'it is listed';
 assert exists(select 1 from audit_log where entity_type='liquidation_receipt_lines' and entity_id=meals_line and action='update'),'the change is audited';

 -- the same read again changes nothing more
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - REPRESENTATION','particulars','Lunch at Jollibee','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','CE - FUEL','particulars','Gas','amount',800)));
 assert (res->>'applied')::int=0 and (select count(*) from sheet_edit_log where kind='tag_changed')=1,'a repeat read adds nothing';

 -- a tag the sheet does not list is flagged, not applied
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - REPRESENTATION','particulars','Lunch at Jollibee','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','FUEL (typo)','particulars','Gas','amount',800)));
 assert (res->>'flagged')::int=1 and (select tag from liquidation_receipt_lines where id=fuel_line)='CE - FUEL','an unknown tag is left alone';
 assert exists(select 1 from sheet_edit_log where kind='tag_unknown' and resolved_at is null and sheet_value='FUEL (typo)'),'and listed for a look';

 -- an amount that matches no line is flagged, never applied
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - REPRESENTATION','particulars','Lunch at Jollibee','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','CE - FUEL','particulars','Gas','amount',850)));
 assert exists(select 1 from sheet_edit_log where kind='amount_differs' and resolved_at is null),'a changed amount is flagged';
 assert (select amount from liquidation_receipt_lines where id=fuel_line)=800,'the app amount never changes from the sheet';
 assert not exists(select 1 from sheet_edit_log where kind='tag_unknown' and resolved_at is null),'the earlier flag cleared itself';

 -- once they agree again, nothing is open
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',79,'voucher',voucher_no,'category','NCE - REPRESENTATION','particulars','Lunch at Jollibee','amount',1200),
   jsonb_build_object('source_row',80,'voucher',voucher_no,'category','CE - FUEL','particulars','Gas','amount',800)));
 assert not exists(select 1 from sheet_edit_log where resolved_at is null and not applied),'flags clear when the sheet is corrected';

 -- rows with no voucher number, or for a voucher the app does not have, are left alone
 res:=apply_sheet_edits('buying',jsonb_build_array(
   jsonb_build_object('source_row',9,'voucher','','category','NCE - MEALS','particulars','typed by hand','amount',597),
   jsonb_build_object('source_row',10,'voucher','0099','category','NCE - MEALS','particulars','older entry','amount',100)));
 assert (res->>'applied')::int=0 and (res->>'flagged')::int=0,'unrelated rows are ignored: '||res::text;

 -- only administrators and accounting can read the list; others never
 perform set_config('request.jwt.claim.sub',acc::text,true);
 raise notice 'sheet-edits: all checks passed';
end $$;
rollback;
