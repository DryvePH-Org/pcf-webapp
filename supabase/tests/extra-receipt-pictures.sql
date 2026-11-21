-- Phase 57: more than one picture per particular. Fixtures roll back.
begin;
insert into auth.users(id,email) values
('97100000-0000-4000-8000-000000000001','custodian@ep.invalid'),
('97100000-0000-4000-8000-000000000002','requester@ep.invalid'),
('97100000-0000-4000-8000-000000000003','other@ep.invalid');
insert into profiles(id,full_name,role) values
('97100000-0000-4000-8000-000000000001','Custodian','custodian'),
('97100000-0000-4000-8000-000000000002','Requester','requester'),
('97100000-0000-4000-8000-000000000003','Other','requester');

do $$
declare c constant uuid:='97100000-0000-4000-8000-000000000001'; r constant uuid:='97100000-0000-4000-8000-000000000002'; o constant uuid:='97100000-0000-4000-8000-000000000003';
 fund uuid:=gen_random_uuid(); req uuid; v uuid; liq uuid; filing date; line uuid:=gen_random_uuid(); items jsonb; msg text; photos jsonb;
begin
 insert into funds(id,name,amount,per_txn_limit,approval_threshold) values(fund,'Pictures fund',100000,50000,3000);
 insert into fund_custodians(fund_id,custodian_id) values(fund,c);
 perform set_config('request.jwt.claim.sub',r::text,true);
 req:=create_budget_request(fund,'Requester',2000,'Supplies');
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform review_budget_request(req,true,null);
 v:=save_workflow_voucher(null,fund,req,'Requester',current_date,'[{"particulars":"Supplies","amount":2000}]','none',null);
 perform release_voucher(v);
 perform set_config('request.jwt.claim.sub',r::text,true);
 liq:=create_liquidation(v);
 select filing_date into filing from liquidations where id=liq;
 -- the files exist in storage, as they do after an upload
 insert into storage.objects(bucket_id,name) select 'liquidation-receipts', liq||'/'||line||'/'||f||'.jpg' from unnest(array['main','two','three','four','p1','p2','p3','p4','p5','p6']) f;
 items:=jsonb_build_array(jsonb_build_object('id',line,'particulars','Supplies','amount',2000,'receipt_path',liq||'/'||line||'/main.jpg'));
 perform save_liquidation(liq,'Operations',filing,items,null);

 -- The owner keeps several pictures on a line, in order.
 photos:=jsonb_build_array(jsonb_build_object('item_id',line,'path',liq||'/'||line||'/two.jpg'),jsonb_build_object('item_id',line,'path',liq||'/'||line||'/three.jpg'));
 perform set_liquidation_photos(liq,photos);
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=2,'two extra pictures were kept';
 assert (select path from liquidation_item_photos where liquidation_id=liq and position=2)=liq||'/'||line||'/three.jpg','kept in order';

 -- Saving the draft again (the line rows are replaced) does not lose them.
 perform save_liquidation(liq,'Operations',filing,items,null);
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=2,'saving the draft keeps the pictures';

 -- Setting them again replaces the list.
 perform set_liquidation_photos(liq,jsonb_build_array(jsonb_build_object('item_id',line,'path',liq||'/'||line||'/four.jpg')));
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=1,'the list was replaced';
 perform set_liquidation_photos(liq,'[]'::jsonb);
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=0,'an empty list clears them';

 -- At most 5 extra pictures per line.
 photos:=(select jsonb_agg(jsonb_build_object('item_id',line,'path',liq||'/'||line||'/p'||g||'.jpg')) from generate_series(1,6) g);
 begin perform set_liquidation_photos(liq,photos); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%at most 5%','a sixth extra picture is refused: '||coalesce(msg,'(accepted)');
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=0,'a refused list leaves nothing half saved';

 -- A picture from another liquidation, or for a line that is not here, is refused.
 begin perform set_liquidation_photos(liq,jsonb_build_array(jsonb_build_object('item_id',line,'path',gen_random_uuid()||'/x/y.jpg'))); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%does not belong to this liquidation line%','a path from elsewhere is refused: '||coalesce(msg,'(accepted)');
 begin perform set_liquidation_photos(liq,jsonb_build_array(jsonb_build_object('item_id',line,'path',liq||'/'||line||'/never-uploaded.jpg'))); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%does not belong to this liquidation line%','a file that was never uploaded is refused: '||coalesce(msg,'(accepted)');
 begin perform set_liquidation_photos(liq,jsonb_build_array(jsonb_build_object('item_id',gen_random_uuid(),'path',liq||'/'||gen_random_uuid()||'/y.jpg'))); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%not in this liquidation%','an unknown line is refused: '||coalesce(msg,'(accepted)');

 -- Someone else cannot change them.
 perform set_liquidation_photos(liq,jsonb_build_array(jsonb_build_object('item_id',line,'path',liq||'/'||line||'/two.jpg')));
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin perform set_liquidation_photos(liq,'[]'::jsonb); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%can no longer be changed%','another person cannot change them: '||coalesce(msg,'(accepted)');
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=1,'their attempt changed nothing';

 -- Once submitted, the owner can no longer change them; the custodian sees them.
 perform set_config('request.jwt.claim.sub',r::text,true);
 perform submit_liquidation(liq);
 begin perform set_liquidation_photos(liq,'[]'::jsonb); msg:=null; exception when others then msg:=sqlerrm; end;
 assert msg like '%can no longer be changed%','a submitted liquidation keeps its pictures: '||coalesce(msg,'(accepted)');
 assert (select count(*) from liquidation_item_photos where liquidation_id=liq)=1,'still there';
 raise notice 'extra-receipt-pictures: all checks passed';
end $$;
rollback;
