-- Phase 53: the Accounting dashboard reads the app's own approved liquidations. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96200000-0000-4000-8000-000000000001','custodian@ad.invalid'),
('96200000-0000-4000-8000-000000000002','requester@ad.invalid'),
('96200000-0000-4000-8000-000000000003','admin@ad.invalid');
insert into profiles(id,full_name,role) values
('96200000-0000-4000-8000-000000000001','Custodian','custodian'),
('96200000-0000-4000-8000-000000000002','Requester','requester'),
('96200000-0000-4000-8000-000000000003','Admin','admin');

do $$
declare c constant uuid:='96200000-0000-4000-8000-000000000001'; r constant uuid:='96200000-0000-4000-8000-000000000002';
 adm constant uuid:='96200000-0000-4000-8000-000000000003';
 dbf uuid:=gen_random_uuid(); book text; req uuid; v uuid; liq uuid; filing date; rev int; res jsonb; msg text; lines jsonb;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(dbf,'Dashboard fund',100000,50000,3000,false);
 insert into fund_custodians(fund_id,custodian_id) values(dbf,c);
 book:='fund:'||dbf::text;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_expense_tags(dbf,array['Meals','Fuel']);

 -- Nothing approved yet: nothing to show, and the fund is a valid scope.
 res:=accounting_dashboard(jsonb_build_object('book',book));
 assert (res->'totals'->>'expense_count')::int=0,'no expenses before an approval';

 -- A liquidation of two expense lines is reviewed and approved with no sheet.
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
   jsonb_build_object('particulars','Lunch','amount',1200,'supplier','Diner','tin','111','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','OR-1','physical_checked',true,'receipt_path',''),
   jsonb_build_object('particulars','Gas','amount',800,'supplier','Gas Co','tin','222','tag','Fuel','expense_date',filing,'plate','ABC 123','receipt_number','','physical_checked',true,'receipt_path',''));
 perform save_custodian_receipts(liq,rev,lines);
 perform approve_liquidation_without_sheet(liq);
 perform set_config('request.jwt.claim.sub',adm::text,true);

 -- It shows at once, as the fund's own book, with every line and a link back to the liquidation.
 res:=accounting_dashboard(jsonb_build_object('book',book));
 assert (res->'totals'->>'expense_count')::int=2,'both lines show: '||(res->'totals'->>'expense_count');
 assert (res->'totals'->>'amount')::numeric=2000,'the total is the approved amount';
 assert (res->'rows'->0->>'book_id')=book and (res->'rows'->0->>'workbook_name')='Dashboard fund','the fund is its own book';
 assert (res->'rows'->0->>'liquidation_id')=liq::text,'each row points at its liquidation';
 assert (res->'rows'->0->>'spreadsheet_id') is null,'a database record has no spreadsheet';
 assert exists(select 1 from jsonb_array_elements(res->'rows') x where x->>'category'='Fuel' and x->>'plate'='ABC 123' and x->>'person'='Requester' and (x->>'custodian_id')=c::text),'the tag, plate, person and reviewing custodian are carried over';
 assert (res->'categories') @> '["Meals","Fuel"]'::jsonb,'the tag list for the filters comes from the records';

 -- Filters still work.
 assert (accounting_dashboard(jsonb_build_object('book',book,'category','Meals'))->'totals'->>'amount')::numeric=1200,'by tag';
 assert (accounting_dashboard(jsonb_build_object('book',book,'custodian',c::text))->'totals'->>'expense_count')::int=2,'by custodian';
 assert (accounting_dashboard(jsonb_build_object('book',book,'receipt','missing'))->'totals'->>'expense_count')::int=1,'by missing receipt number';
 assert accounting_latest_date('database',book,null,null)=filing,'the latest date comes from the records';

 -- The Google Sheet copy is still available, and does not contain this fund.
 res:=accounting_dashboard(jsonb_build_object('book',book,'source','sheet'));
 assert (res->'totals'->>'expense_count')::int=0,'the sheet copy has none of it';

 -- Not for everyone.
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform accounting_dashboard(jsonb_build_object('book',book)); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a custodian cannot open the dashboard figures';
 raise notice 'accounting-from-database: all checks passed';
end $$;
rollback;
