-- Phase 39: fund approvers as the gateway for a custodian's own budget request.
-- All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values
('94000000-0000-4000-8000-000000000001','custodian-a@fa.invalid'),
('94000000-0000-4000-8000-000000000002','custodian-b@fa.invalid'),
('94000000-0000-4000-8000-000000000003','approver-fund@fa.invalid'),
('94000000-0000-4000-8000-000000000004','approver-other@fa.invalid'),
('94000000-0000-4000-8000-000000000005','requester@fa.invalid'),
('94000000-0000-4000-8000-000000000006','admin@fa.invalid');
insert into profiles(id,full_name,role) values
('94000000-0000-4000-8000-000000000001','Custodian A','custodian'),
('94000000-0000-4000-8000-000000000002','Custodian B','custodian'),
('94000000-0000-4000-8000-000000000003','Fund Approver','approver'),
('94000000-0000-4000-8000-000000000004','Other Approver','approver'),
('94000000-0000-4000-8000-000000000005','Plain Requester','requester'),
('94000000-0000-4000-8000-000000000006','Admin','admin');
insert into funds(id,name,amount,per_txn_limit,approval_threshold) values
('94000000-0000-4000-8000-000000000010','Approver fund',100000,50000,30000);
insert into fund_custodians(fund_id,custodian_id) values
('94000000-0000-4000-8000-000000000010','94000000-0000-4000-8000-000000000001'),
('94000000-0000-4000-8000-000000000010','94000000-0000-4000-8000-000000000002');

do $$
declare own_req uuid; other_req uuid; voucher uuid; refused boolean; seen int;
begin
 -- Only an admin assigns approvers, and only to active approvers.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
 refused:=false;
 begin perform set_fund_approvers('94000000-0000-4000-8000-000000000010',array['94000000-0000-4000-8000-000000000003']::uuid[]);
 exception when others then refused:=true; end;
 assert refused,'a custodian cannot assign approvers';
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000006',true);
 refused:=false;
 begin perform set_fund_approvers('94000000-0000-4000-8000-000000000010',array['94000000-0000-4000-8000-000000000002']::uuid[]);
 exception when others then refused:=true; end;
 assert refused,'a custodian cannot be assigned as a fund approver';
 perform set_fund_approvers('94000000-0000-4000-8000-000000000010',array['94000000-0000-4000-8000-000000000003']::uuid[]);
 assert fund_has_approver('94000000-0000-4000-8000-000000000010'),'the fund now has an approver';

 -- Custodian A asks for budget in her own fund.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
 own_req:=create_budget_request('94000000-0000-4000-8000-000000000010','Custodian A',1500,'Supplies for the branch');

 -- She cannot review it, and neither can the other custodian.
 refused:=false;
 begin perform review_budget_request(own_req,true,null); exception when others then refused:=true; end;
 assert refused,'the requester cannot review her own request';
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
 refused:=false;
 begin perform review_budget_request(own_req,true,null); exception when others then refused:=true; end;
 assert refused,'another custodian no longer reviews a custodian''s own request once the fund has an approver';

 -- An approver who is not assigned to the fund cannot either.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000004',true);
 refused:=false;
 begin perform review_budget_request(own_req,true,null); exception when others then refused:=true; end;
 assert refused,'an unassigned approver cannot review it';

 -- The assigned approver can see it, review it and prepare its voucher.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000003',true);
 set local role authenticated;
 select count(*) into seen from budget_requests where id=own_req;
 reset role;
 assert seen=1,'the assigned approver sees the custodian''s own request';
 perform review_budget_request(own_req,true,null);
 assert (select status from budget_requests where id=own_req)='approved','approved by the assigned approver';
 voucher:=save_workflow_voucher(null,'94000000-0000-4000-8000-000000000010',own_req,'Custodian A',current_date,
   '[{"particulars":"Supplies","amount":1500}]','none',null);
 assert (select budget_request_id from vouchers where id=voucher)=own_req,'the voucher is linked to the request';
 assert (select status from budget_requests where id=own_req)='voucher_created','the request moved on';

 -- Cash for her own request is never released by her.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
 refused:=false;
 begin update vouchers set released_at=now() where id=voucher; exception when others then refused:=true; end;
 assert refused,'the requester cannot release the cash for her own request';

 -- A normal request is untouched: the custodian reviews it, the approver cannot.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000005',true);
 other_req:=create_budget_request('94000000-0000-4000-8000-000000000010','Plain Requester',800,'Printing');
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000003',true);
 set local role authenticated;
 select count(*) into seen from budget_requests where id=other_req;
 reset role;
 assert seen=0,'the approver does not see ordinary requests';
 refused:=false;
 begin perform review_budget_request(other_req,true,null); exception when others then refused:=true; end;
 assert refused,'the approver does not review ordinary requests';
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
 perform review_budget_request(other_req,true,null);
 assert (select status from budget_requests where id=other_req)='approved','a custodian still reviews ordinary requests';

 -- Without an assigned approver, another custodian covers a custodian's request as before.
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000006',true);
 perform set_fund_approvers('94000000-0000-4000-8000-000000000010','{}'::uuid[]);
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000001',true);
 own_req:=create_budget_request('94000000-0000-4000-8000-000000000010','Custodian A',900,'Fuel');
 perform set_config('request.jwt.claim.sub','94000000-0000-4000-8000-000000000002',true);
 perform review_budget_request(own_req,true,null);
 assert (select status from budget_requests where id=own_req)='approved','falls back to another custodian when no approver is assigned';
end $$;
rollback;
