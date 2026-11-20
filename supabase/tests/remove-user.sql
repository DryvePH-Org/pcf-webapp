-- Phase 56: removing a person who has no history. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96500000-0000-4000-8000-000000000001','admin@ru.invalid'),
('96500000-0000-4000-8000-000000000002','admin-two@ru.invalid'),
('96500000-0000-4000-8000-000000000003','new-person@ru.invalid'),
('96500000-0000-4000-8000-000000000004','custodian@ru.invalid'),
('96500000-0000-4000-8000-000000000005','approver@ru.invalid'),
('96500000-0000-4000-8000-000000000006','requester@ru.invalid'),
('96500000-0000-4000-8000-000000000007','reminded@ru.invalid');
insert into profiles(id,full_name,role) values
('96500000-0000-4000-8000-000000000001','Admin One','admin'),
('96500000-0000-4000-8000-000000000002','Admin Two','admin'),
('96500000-0000-4000-8000-000000000003','New Person','requester'),
('96500000-0000-4000-8000-000000000004','Fund Custodian','custodian'),
('96500000-0000-4000-8000-000000000005','Fund Approver','approver'),
('96500000-0000-4000-8000-000000000006','Has Records','requester'),
('96500000-0000-4000-8000-000000000007','Reminded Person','requester');

do $$
declare a1 constant uuid:='96500000-0000-4000-8000-000000000001'; a2 constant uuid:='96500000-0000-4000-8000-000000000002';
 fresh constant uuid:='96500000-0000-4000-8000-000000000003'; c constant uuid:='96500000-0000-4000-8000-000000000004';
 ap constant uuid:='96500000-0000-4000-8000-000000000005'; rec constant uuid:='96500000-0000-4000-8000-000000000006';
 rem constant uuid:='96500000-0000-4000-8000-000000000007';
 fund uuid:=gen_random_uuid(); req uuid; msg text; v uuid;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Removal fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',a1::text,true);
 perform set_fund_approvers(fund,array[ap]);

 -- Only an administrator.
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform remove_user(fresh); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a custodian cannot remove a person';
 perform set_config('request.jwt.claim.sub',a1::text,true);

 -- Not yourself; another administrator can be removed.
 begin perform remove_user(a1); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%your own account%','not yourself: '||coalesce(msg,'(removed)');

 -- A custodian who holds a fund, and an approver assigned to one, must be reassigned first.
 begin perform remove_user(c); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Removal fund%' and msg like '%Reassign%','a custodian holding a fund: '||coalesce(msg,'(removed)');
 begin perform remove_user(ap); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%Removal fund%','an assigned approver: '||coalesce(msg,'(removed)');
 assert exists(select 1 from profiles where id=c) and exists(select 1 from profiles where id=ap),'nothing was removed';

 -- A person with records stays, and nothing about them is lost.
 perform set_config('request.jwt.claim.sub',rec::text,true);
 req:=create_budget_request(fund,'Has Records',500,'Supplies');
 perform set_config('request.jwt.claim.sub',a1::text,true);
 begin perform remove_user(rec); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%has records%' and msg like '%Deactivate%','a person with a request: '||coalesce(msg,'(removed)');
 assert exists(select 1 from profiles where id=rec) and exists(select 1 from budget_requests where id=req),'they and their request are untouched';

 -- A person with nothing but reminders (housekeeping) is removed, and the reminders go with them.
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=save_workflow_voucher(null,fund,null,'x',current_date,'[{"particulars":"Direct","amount":100}]','none',null);
 perform set_config('request.jwt.claim.sub',a1::text,true);
 insert into liquidation_reminders(voucher_id,recipient_id,reminder_date) values(v,rem,current_date);
 perform remove_user(rem);
 assert not exists(select 1 from profiles where id=rem),'removed';
 assert not exists(select 1 from liquidation_reminders where recipient_id=rem),'their reminders went with them';

 -- A person who never did anything is removed, with the reason in the audit log.
 perform remove_user(fresh);
 assert not exists(select 1 from profiles where id=fresh),'the new person is removed';
 perform remove_user(a2);
 assert not exists(select 1 from profiles where id=a2),'another administrator can be removed';
 assert exists(select 1 from audit_log where entity_type='profiles' and entity_id=fresh and action='user_removed' and actor_id=a1 and old_data->>'email'='new-person@ru.invalid' and old_data->>'full_name'='New Person'),'who removed whom is recorded';
 begin perform remove_user(fresh); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%not found%','removing again says so';
 raise notice 'remove-user: all checks passed';
end $$;
rollback;
