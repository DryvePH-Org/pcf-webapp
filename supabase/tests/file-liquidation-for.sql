-- Phase 55: a custodian files the liquidation for an employee. She may review it herself (and it is recorded);
-- an administrator who filed it may not. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96400000-0000-4000-8000-000000000001','custodian-one@fl.invalid'),
('96400000-0000-4000-8000-000000000002','custodian-two@fl.invalid'),
('96400000-0000-4000-8000-000000000003','outsider@fl.invalid'),
('96400000-0000-4000-8000-000000000004','employee@fl.invalid'),
('96400000-0000-4000-8000-000000000005','admin@fl.invalid'),
('96400000-0000-4000-8000-000000000006','approver@fl.invalid'),
('96400000-0000-4000-8000-000000000007','employee-two@fl.invalid'),
('96400000-0000-4000-8000-000000000008','employee-three@fl.invalid');
insert into profiles(id,full_name,role) values
('96400000-0000-4000-8000-000000000001','Custodian One','custodian'),
('96400000-0000-4000-8000-000000000002','Custodian Two','custodian'),
('96400000-0000-4000-8000-000000000003','Custodian Outsider','custodian'),
('96400000-0000-4000-8000-000000000004','Maria Santos','requester'),
('96400000-0000-4000-8000-000000000005','Admin','admin'),
('96400000-0000-4000-8000-000000000006','Fund Approver','approver'),
('96400000-0000-4000-8000-000000000007','Second Employee','requester'),
('96400000-0000-4000-8000-000000000008','Third Employee','requester');

do $$
declare c1 constant uuid:='96400000-0000-4000-8000-000000000001'; c2 constant uuid:='96400000-0000-4000-8000-000000000002';
 c3 constant uuid:='96400000-0000-4000-8000-000000000003'; e constant uuid:='96400000-0000-4000-8000-000000000004';
 adm constant uuid:='96400000-0000-4000-8000-000000000005'; a constant uuid:='96400000-0000-4000-8000-000000000006';
 e2 constant uuid:='96400000-0000-4000-8000-000000000007'; e3 constant uuid:='96400000-0000-4000-8000-000000000008';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; v2 uuid; v3 uuid; lid uuid; lid2 uuid; lid3 uuid; again uuid;
 filing date; line uuid:=gen_random_uuid(); rev int; msg text; lines jsonb; items jsonb; audits int;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold,sheet_ledger) values(fund,'Filing fund',100000,50000,3000,false);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c1),(fund,c2);
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_fund_approvers(fund,array[a]);
 perform set_fund_expense_tags(fund,array['Meals']);

 -- Three employees each get cash: the employee asks, custodian one approves, prepares the voucher and releases it.
 perform set_config('request.jwt.claim.sub',e::text,true);
 req:=create_budget_request(fund,'Maria Santos',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Maria Santos',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',e2::text,true);
 req:=create_budget_request(fund,'Second Employee',1000,'Printing');
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform review_budget_request(req,true,null);
 v2:=save_workflow_voucher(null,fund,req,'Second Employee',current_date,'[{"particulars":"Printing","amount":1000}]','none',null);
 perform release_voucher(v2);
 perform set_config('request.jwt.claim.sub',e3::text,true);
 req:=create_budget_request(fund,'Third Employee',500,'Tools');
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform review_budget_request(req,true,null);
 v3:=save_workflow_voucher(null,fund,req,'Third Employee',current_date,'[{"particulars":"Tools","amount":500}]','none',null);
 perform release_voucher(v3);

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

 -- She fills it in and submits.
 perform set_config('request.jwt.claim.sub',c1::text,true);
 select filing_date into filing from liquidations where id=lid;
 items:=jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',2000,'no_receipt_reason','No receipt'));
 perform save_liquidation(lid,'Operations',filing,items,null);
 perform submit_liquidation(lid);
 assert (select status from liquidations where id=lid)='submitted' and (select owner_id from liquidations where id=lid)=e,'it was submitted for the employee';

 -- The custodian who filed it may review it herself, and every decision is on record.
 begin perform review_liquidation(lid,false,'Please check the amount'); msg:=null; exception when others then msg:='refused: '||sqlerrm; end;
 assert msg is null,'she can flag it: '||coalesce(msg,'');
 assert (select status from liquidations where id=lid)='flagged' and (select reviewed_by from liquidations where id=lid)=c1,'flagged, by her';
 select count(*) into audits from audit_log where entity_type='liquidations' and entity_id=lid and action='self_approval' and new_data->>'step'='filed_and_reviewed_by_same_custodian';
 assert audits=1,'and it is in the audit log: '||audits;
 assert can_edit_liquidation(lid),'she can fix it';
 perform set_config('request.jwt.claim.sub',e::text,true);
 assert can_edit_liquidation(lid),'so can the employee';
 perform set_config('request.jwt.claim.sub',c1::text,true);
 perform save_liquidation(lid,'Operations',filing,items,null);
 perform submit_liquidation(lid);
 assert (select status from liquidations where id=lid)='submitted','it was resubmitted';
 select receipt_review_revision into rev from liquidations where id=lid;
 lines:=jsonb_build_array(jsonb_build_object('particulars','Supplies','amount',2000,'supplier','N/A','tin','N/A','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''));
 begin perform save_custodian_receipts(lid,rev,lines); msg:=null; exception when others then msg:='refused: '||sqlerrm; end;
 assert msg is null,'she can do the receipt review: '||coalesce(msg,'');
 begin perform approve_liquidation_without_sheet(lid); msg:=null; exception when others then msg:='refused: '||sqlerrm; end;
 assert msg is null,'and approve it: '||coalesce(msg,'');
 assert (select status from liquidations where id=lid)='approved' and (select reviewed_by from liquidations where id=lid)=c1,'approved by the custodian who filed it';
 select count(*) into audits from audit_log where entity_type='liquidations' and entity_id=lid and action='self_approval' and new_data->>'step'='filed_and_reviewed_by_same_custodian';
 assert audits=2,'both decisions are in the audit log: '||audits;
 assert (select filed_by from liquidations where id=lid)=c1,'who filed it is still recorded';
 assert exists(select 1 from liquidation_revisions r where r.liquidation_id=lid and (r.payload->'form'->>'filed_by')=c1::text),'and is in the submitted history';

 -- She never approves the extra reimbursement of what she filed (that is the independent approver's).
 begin update liquidations set reimbursement_approved_by=c1 where id=lid; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%extra reimbursement%','refused: '||coalesce(msg,'(accepted)');
 begin update liquidations set reimbursement_approved_by=a where id=lid; msg:=null; exception when others then msg:='refused'; end;
 assert msg is null,'but the approver can';
 update liquidations set reimbursement_approved_by=null where id=lid;

 -- An administrator who filed it may not review it; another custodian can.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 assert can_file_liquidation_for(v2),'an administrator can file for an employee';
 lid2:=create_liquidation_for(v2);
 assert (select filed_by from liquidations where id=lid2)=adm,'recorded as filed by the administrator';
 select filing_date into filing from liquidations where id=lid2;
 perform save_liquidation(lid2,'Operations',filing,jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'particulars','Printing','amount',1000,'no_receipt_reason','No receipt')),null);
 perform submit_liquidation(lid2);
 begin perform review_liquidation(lid2,false,'x'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Only a custodian of this fund%','flagging it is refused: '||coalesce(msg,'(accepted)');
 select receipt_review_revision into rev from liquidations where id=lid2;
 begin perform save_custodian_receipts(lid2,rev,jsonb_build_array(jsonb_build_object('particulars','Printing','amount',1000,'supplier','N/A','tin','N/A','tag','Meals','expense_date',filing,'plate','N/A','receipt_number','','physical_checked',true,'receipt_path',''))); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Only a custodian of this fund%','the receipt review is refused: '||coalesce(msg,'(accepted)');
 begin update liquidations set reviewed_by=adm where id=lid2; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Only a custodian of this fund%','not by writing the row directly either';
 perform set_config('request.jwt.claim.sub',c2::text,true);
 perform review_liquidation(lid2,false,'Check it');
 assert (select status from liquidations where id=lid2)='flagged' and (select reviewed_by from liquidations where id=lid2)=c2,'another custodian can';

 -- A custodian who filed it and is no longer assigned to the fund loses the right to review it.
 perform set_config('request.jwt.claim.sub',c2::text,true);
 lid3:=create_liquidation_for(v3);
 assert (select filed_by from liquidations where id=lid3)=c2,'custodian two filed the third';
 delete from fund_custodians where fund_id=fund and custodian_id=c2;
 begin update liquidations set reviewed_by=c2 where id=lid3; msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Only a custodian of this fund%','no longer assigned, so no review: '||coalesce(msg,'(accepted)');
 assert not can_edit_liquidation(lid3),'and no longer allowed to edit it';
 raise notice 'file-liquidation-for: all checks passed';
end $$;
rollback;
