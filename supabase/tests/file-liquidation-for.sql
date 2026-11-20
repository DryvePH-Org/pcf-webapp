-- Phase 55: a custodian files the liquidation for an employee, and can never review it. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96400000-0000-4000-8000-000000000001','custodian-one@fl.invalid'),
('96400000-0000-4000-8000-000000000002','custodian-two@fl.invalid'),
('96400000-0000-4000-8000-000000000003','outsider@fl.invalid'),
('96400000-0000-4000-8000-000000000004','employee@fl.invalid'),
('96400000-0000-4000-8000-000000000005','admin@fl.invalid'),
('96400000-0000-4000-8000-000000000006','approver@fl.invalid');
insert into profiles(id,full_name,role) values
('96400000-0000-4000-8000-000000000001','Custodian One','custodian'),
('96400000-0000-4000-8000-000000000002','Custodian Two','custodian'),
('96400000-0000-4000-8000-000000000003','Custodian Outsider','custodian'),
('96400000-0000-4000-8000-000000000004','Maria Santos','requester'),
('96400000-0000-4000-8000-000000000005','Admin','admin'),
('96400000-0000-4000-8000-000000000006','Fund Approver','approver');

do $$
declare c1 constant uuid:='96400000-0000-4000-8000-000000000001'; c2 constant uuid:='96400000-0000-4000-8000-000000000002';
 c3 constant uuid:='96400000-0000-4000-8000-000000000003'; e constant uuid:='96400000-0000-4000-8000-000000000004';
 adm constant uuid:='96400000-0000-4000-8000-000000000005'; a constant uuid:='96400000-0000-4000-8000-000000000006';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; lid uuid; again uuid; filing date; line uuid:=gen_random_uuid(); rev int; msg text; lines jsonb; items jsonb;
 who text;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(fund,'Filing fund',100000,50000,3000,false);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c1),(fund,c2);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);
 perform set_fund_expense_tags(fund,array['Meals']);

 -- The employee asks; custodian one reviews, prepares the voucher and releases the cash.
 perform set_config('request.jwt.claim.sub',e::text,true);
 req:=create_budget_request(fund,'Maria Santos',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Maria Santos',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);

 -- Who may file for the employee.
 assert can_file_liquidation_for(v),'a custodian of the fund can';
 perform set_config('request.jwt.claim.sub',c3::text,true);
 assert not can_file_liquidation_for(v),'a custodian of another fund cannot';
 begin perform create_liquidation_for(v); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'and cannot do it';
 perform set_config('request.jwt.claim.sub',e::text,true);
 assert not can_file_liquidation_for(v),'the employee has their own form';
 begin perform create_liquidation_for(v); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a requester cannot use the file-for door';

 -- It is the employee's liquidation, and it says who filed it.
 perform set_config('request.jwt.claim.sub',c1::text,true);
 lid:=create_liquidation_for(v);
 assert (select owner_id from liquidations where id=lid)=e,'it belongs to the employee';
 assert (select filed_by from liquidations where id=lid)=c1 and (select filed_by_name from liquidations where id=lid)='Custodian One','the person who filed it is recorded';
 assert (select employee_name from liquidations where id=lid)='Maria Santos','it carries the employee''s name';
 assert (select total_spent from liquidations where id=lid)=2000 and (select count(*) from liquidation_items where liquidation_id=lid)=1,'the voucher''s lines are copied in';
 again:=create_liquidation_for(v);
 assert again=lid,'asking again returns the same liquidation';
 assert not can_file_liquidation_for(v),'nothing more to file once it exists';

 -- Who may edit the draft: the employee and whoever filed it, nobody else.
 assert can_edit_liquidation(lid),'the person who filed it can edit';
 perform set_config('request.jwt.claim.sub',e::text,true);
 assert can_edit_liquidation(lid),'the employee still can';
 perform set_config('request.jwt.claim.sub',c2::text,true);
 assert not can_edit_liquidation(lid),'another custodian cannot edit someone else''s draft';
 perform set_config('request.jwt.claim.sub',c3::text,true);
 assert not can_edit_liquidation(lid),'nor one from another fund';

 -- The person who filed it fills it in and submits.
 perform set_config('request.jwt.claim.sub',c1::text,true);
 select filing_date into filing from liquidations where id=lid;
 items:=jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',2000,'no_receipt_reason','No receipt'));
 perform save_liquidation(lid,'Operations',filing,items,null);
 perform submit_liquidation(lid);
 assert (select status from liquidations where id=lid)='submitted','it was submitted for the employee';
 assert (select owner_id from liquidations where id=lid)=e,'and is still the employee''s';

 -- It cannot be reviewed by the person who filed it, by any route.
 begin perform review_liquidation(lid,false,'x'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot review it%','flagging it is refused: '||coalesce(msg,'(accepted)');
 select receipt_review_revision into rev from liquidations where id=lid;
 lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',2000,'supplier','N/A','tin','N/A','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''));
 begin perform save_custodian_receipts(lid,rev,lines); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot review it%','the receipt review is refused: '||coalesce(msg,'(accepted)');
 begin perform approve_liquidation_without_sheet(lid); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'so is the approval';
 assert (select status from liquidations where id=lid)='submitted' and (select receipt_reviewed_by from liquidations where id=lid) is null,'nothing changed';
 -- and not by writing the row directly either
 begin update liquidations set reviewed_by=c1 where id=lid; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot review it%','not by changing who reviewed it';
 begin update liquidations set receipt_reviewed_by=c1 where id=lid; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot review it%','nor who did the receipt review';
 begin update liquidations set reimbursement_approved_by=c1 where id=lid; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%cannot review it%','nor who approved an extra reimbursement';
 begin update liquidations set reviewed_by=c2 where id=lid; msg:=null; exception when others then msg:='refused'; end;
 assert msg is null,'but another person can be the reviewer';
 update liquidations set reviewed_by=null where id=lid;

 -- Another custodian flags it; the person who filed it and the employee can both fix it.
 perform set_config('request.jwt.claim.sub',c2::text,true);
 perform review_liquidation(lid,false,'Please check the amount');
 assert (select status from liquidations where id=lid)='flagged','another custodian can flag it';
 assert (select reviewed_by from liquidations where id=lid)=c2,'and is recorded as the reviewer';
 perform set_config('request.jwt.claim.sub',c1::text,true);
 assert can_edit_liquidation(lid),'the person who filed it can fix a flagged one';
 perform set_config('request.jwt.claim.sub',e::text,true);
 assert can_edit_liquidation(lid),'so can the employee';
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform save_liquidation(lid,'Operations',filing,items,null);
 perform submit_liquidation(lid);
 assert (select status from liquidations where id=lid)='submitted','it was resubmitted';

 -- Another custodian reviews and approves it; the filing is kept in the history.
 perform set_config('request.jwt.claim.sub',c2::text,true);
 select receipt_review_revision into rev from liquidations where id=lid;
 perform save_custodian_receipts(lid,rev,lines);
 perform approve_liquidation_without_sheet(lid);
 assert (select status from liquidations where id=lid)='approved' and (select reviewed_by from liquidations where id=lid)=c2,'another custodian approved it';
 assert (select filed_by from liquidations where id=lid)=c1,'who filed it is still recorded';
 assert exists(select 1 from liquidation_revisions r where r.liquidation_id=lid and (r.payload->'form'->>'filed_by')=c1::text),'and is in the submitted history';

 -- An employee's own filing is unchanged.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 select count(*) into rev from liquidations where filed_by is not null and filed_by<>owner_id;
 assert rev=1,'only the one filed for someone else';
 raise notice 'file-liquidation-for: all checks passed';
end $$;
rollback;
