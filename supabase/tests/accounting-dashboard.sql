-- Isolated database fixtures, including assignment changes, are rolled back.
begin;
insert into auth.users(id,email) values ('92000000-0000-4000-8000-000000000001','accounting@dashboard.invalid'),('92000000-0000-4000-8000-000000000002','custodian@dashboard.invalid');
insert into profiles(id,full_name,role) values ('92000000-0000-4000-8000-000000000001','Dashboard Accounting','accounting'),('92000000-0000-4000-8000-000000000002','Dashboard Custodian','custodian');
update sheet_workbooks set catalog='[{"sheetId":1},{"sheetId":2}]',active_sheet_id=2 where id='buying';
insert into sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,voucher,category,particulars,person,supplier,receipt_number,amount,tin)
select 'buying',1,g,'Worksheet 1','2026-10-01','V-'||g,'CE - FUEL','Fuel 100%','Employee','Supplier','R-'||g,10,'123-456-789' from generate_series(1,60) g;
insert into sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,voucher,category,particulars,person,supplier,receipt_number,amount,tin)
select book_id,2,source_row,'Worksheet 2',expense_date,voucher,category,particulars,person,supplier,receipt_number,amount,tin from sheet_expenses where book_id='buying';
-- Legitimate repeated lines within a worksheet must remain, including copies.
insert into sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,voucher,category,particulars,person,supplier,receipt_number,amount,tin)
select book_id,sheet_id,61,sheet_name,expense_date,voucher,category,particulars,person,supplier,receipt_number,amount,tin from sheet_expenses where book_id='buying' and source_row=1;
insert into sheet_expenses(book_id,sheet_id,source_row,sheet_name,expense_date,particulars,amount) values ('buying',1,62,'Worksheet 1',null,'Undated',20),('buying',1,63,'Worksheet 1','2026-10-02','No reference',30),('buying',2,63,'Worksheet 2','2026-10-02','No reference',30);
do $$ declare report jsonb; blocked boolean:=false; begin
 perform set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
 perform configure_sheet_workbook('buying','92000000-0000-4000-8000-000000000002',null,2,false);
 assert (select custodian_id='92000000-0000-4000-8000-000000000002' from sheet_workbooks where id='buying'),'Accounting can assign workbook';
 report:=accounting_dashboard('{"book":"buying","from":"2026-10-01","to":"2026-10-31"}');
 assert (report->'totals'->>'expense_count')::int=63,'61 dated referenced lines plus two unreferenced lines';
 assert (report->'totals'->>'amount')::numeric=670,'totals cover every page';
 assert jsonb_array_length(report->'rows')=50,'paged output';
 assert (report->>'hidden_copies')::int=61,'copies preserve repeated occurrences';
 assert (report->>'undated_scope')::int=1,'undated alert outside period';
 report:=accounting_dashboard('{"book":"buying","from":"2026-10-01","to":"2026-10-31"}',true);
 assert jsonb_array_length(report->'rows')=63,'export covers every matching row';
 report:=accounting_dashboard('{"book":"buying","tab":"1"}');
 assert (report->'totals'->>'expense_count')::int=63,'worksheet shows original rows';
 report:=accounting_dashboard('{"book":"buying","q":"100%","tin":"123-456","receipt":"present"}');
 assert (report->'totals'->>'expense_count')::int=61,'search is literal and combines filters';
 report:=accounting_dashboard('{"custodian":"92000000-0000-4000-8000-000000000002","date_status":"missing"}');
 assert (report->'totals'->>'amount')::numeric=20,'custodian and missing-date filters';
 report:=accounting_dashboard('{"book":"buying","classification":"NCE"}');
 assert (report->'totals'->>'expense_count')::int=0,'classification filter';
 perform set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
 begin perform accounting_dashboard('{}'); exception when others then blocked:=true; end;
 assert blocked,'custodian cannot query Accounting RPC';
 blocked:=false;
 begin perform configure_sheet_workbook('buying',null,null,null,false); exception when others then blocked:=true; end;
 assert blocked,'custodian cannot modify workbook assignment';
end $$;
rollback;
