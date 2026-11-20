-- Phase 54: the Telegram gateway. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('96300000-0000-4000-8000-000000000001','admin@tg.invalid'),
('96300000-0000-4000-8000-000000000002','requester@tg.invalid'),
('96300000-0000-4000-8000-000000000003','custodian@tg.invalid'),
('96300000-0000-4000-8000-000000000004','second@tg.invalid'),
('96300000-0000-4000-8000-000000000005','gone@tg.invalid');
insert into profiles(id,full_name,role,is_active) values
('96300000-0000-4000-8000-000000000001','Admin','admin',true),
('96300000-0000-4000-8000-000000000002','Maria Santos','requester',true),
('96300000-0000-4000-8000-000000000003','Custodian','custodian',true),
('96300000-0000-4000-8000-000000000004','Second Person','requester',true),
('96300000-0000-4000-8000-000000000005','Inactive Person','requester',false);

do $$
declare adm constant uuid:='96300000-0000-4000-8000-000000000001'; r constant uuid:='96300000-0000-4000-8000-000000000002';
 c constant uuid:='96300000-0000-4000-8000-000000000003'; s constant uuid:='96300000-0000-4000-8000-000000000004'; gone constant uuid:='96300000-0000-4000-8000-000000000005';
 fund uuid:=gen_random_uuid(); code text; code2 text; msg text; req uuid; got record; n int;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Telegram fund',100000,1000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);

 -- Only an administrator makes a link code, and only for an active person; only its hash is kept.
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform telegram_issue_link_code(r); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'a custodian cannot make a link code';
 perform set_config('request.jwt.claim.sub',adm::text,true);
 begin perform telegram_issue_link_code(gone); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%not active%','an inactive account gets no link: '||coalesce(msg,'(made)');
 code:=telegram_issue_link_code(r);
 assert length(code)=20,'the code is 20 characters';
 assert not exists(select 1 from telegram_link_codes where code_hash=code),'the code itself is not stored';
 assert exists(select 1 from telegram_link_codes where code_hash=encode(sha256(convert_to(code,'UTF8')),'hex') and profile_id=r and used_at is null),'only its hash is';

 -- Redeeming links the chat to the person. It works once.
 select * into got from telegram_redeem_link_code(code,555001,'maria');
 assert got.profile_id=r and got.full_name='Maria Santos','the code links the person it was made for';
 assert (select chat_id from telegram_links where profile_id=r)=555001,'the chat is recorded';
 begin perform telegram_redeem_link_code(code,555009,'someone'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%expired or was already used%','a used code is refused: '||coalesce(msg,'(accepted)');
 assert (select chat_id from telegram_links where profile_id=r)=555001,'and nothing changed';
 begin perform telegram_redeem_link_code('not-a-code',555009,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%expired or was already used%','a made-up code is refused';
 code2:=telegram_issue_link_code(s);
 update telegram_link_codes set expires_at=now()-interval '1 minute' where code_hash=encode(sha256(convert_to(code2,'UTF8')),'hex');
 begin perform telegram_redeem_link_code(code2,555002,null); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%expired or was already used%','an expired code is refused';

 -- One chat belongs to one person, and one person to one chat.
 code2:=telegram_issue_link_code(s);
 perform telegram_redeem_link_code(code2,555001,'second');
 assert not exists(select 1 from telegram_links where profile_id=r),'a chat that moves to another person leaves the first';
 assert (select profile_id from telegram_links where chat_id=555001)=s,'and belongs to the new one';
 code:=telegram_issue_link_code(s);
 perform telegram_redeem_link_code(code,555003,'second');
 assert (select count(*) from telegram_links where profile_id=s)=1 and (select chat_id from telegram_links where profile_id=s)=555003,'a person moving to a new chat has one chat';

 -- A request made by the gateway is the person's own, under the website's rules.
 req:=telegram_create_budget_request(r,fund,500,'Gasolina');
 assert (select requester_id from budget_requests where id=req)=r and (select requester_name from budget_requests where id=req)='Maria Santos','it is made by the linked person';
 assert (select status from budget_requests where id=req)='submitted','it waits for the custodian like any request';
 begin perform telegram_create_budget_request(r,fund,1500,'Too much'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%at most%','the per-transaction limit applies: '||coalesce(msg,'(accepted)');
 begin perform telegram_create_budget_request(gone,fund,100,'No'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%not active%','an inactive account cannot make one';
 begin perform telegram_create_budget_request(r,gen_random_uuid(),100,'Nowhere'); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'an unknown fund is refused';

 -- A chat has one request open at a time; an update counts once.
 insert into telegram_drafts(chat_id,profile_id,status) values(555003,s,'draft');
 begin insert into telegram_drafts(chat_id,profile_id,status) values(555003,s,'editing_amount'); msg:=null; exception when unique_violation then msg:='unique'; end;
 assert msg='unique','only one open draft per chat';
 update telegram_drafts set status='cancelled' where chat_id=555003;
 insert into telegram_drafts(chat_id,profile_id,status) values(555003,s,'draft');
 insert into telegram_updates(update_id) values(42);
 begin insert into telegram_updates(update_id) values(42); msg:=null; exception when unique_violation then msg:='unique'; end;
 assert msg='unique','an update id counts once';

 -- Unlinking removes the link, the unused codes and any open draft.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform telegram_issue_link_code(s);
 perform telegram_unlink(s);
 assert not exists(select 1 from telegram_links where profile_id=s),'unlinked';
 assert not exists(select 1 from telegram_link_codes where profile_id=s and used_at is null),'its unused codes are gone';
 assert not exists(select 1 from telegram_drafts where profile_id=s and status in ('draft','editing_amount','editing_purpose')),'its open draft is cancelled';
 perform set_config('request.jwt.claim.sub',c::text,true);
 begin perform telegram_unlink(r); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg is not null,'only an administrator can unlink';
 raise notice 'telegram-gateway: all checks passed';
end $$;

-- Signed-in users cannot call the service-only functions at all.
set local role authenticated;
do $$
declare refused int := 0;
begin
 begin perform telegram_create_budget_request('96300000-0000-4000-8000-000000000002',gen_random_uuid(),1,'x'); exception when insufficient_privilege then refused:=refused+1; end;
 begin perform telegram_redeem_link_code('x',1,null); exception when insufficient_privilege then refused:=refused+1; end;
 assert refused=2,'signed-in users cannot call the gateway functions directly';
 begin perform 1 from telegram_link_codes; exception when insufficient_privilege then refused:=refused+1; end;
 begin perform 1 from telegram_drafts; exception when insufficient_privilege then refused:=refused+1; end;
 assert refused=4,'nor read the codes or the drafts';
end $$;
reset role;
rollback;
