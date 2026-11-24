-- Phase 65: one voucher number per voucher, counted per fund with the fund's letters. All fixtures roll back. Run only against an isolated database.
begin;
insert into auth.users(id,email) values ('98000000-0000-4000-8000-000000000001','custodian@fvn.invalid');
insert into profiles(id,full_name,role) values ('98000000-0000-4000-8000-000000000001','Custodian','custodian');
insert into categories(id,name) values ('98000000-0000-4000-8000-0000000000c1','Number test category');
insert into funds(id,name,amount,per_txn_limit,code) values
 ('98000000-0000-4000-8000-000000000010','Alpha fund',1000,500,'AF'),
 ('98000000-0000-4000-8000-000000000011','Beta fund',1000,500,'BF');

do $$
declare a uuid:='98000000-0000-4000-8000-000000000010'; b uuid:='98000000-0000-4000-8000-000000000011';
 u uuid:='98000000-0000-4000-8000-000000000001'; c uuid:='98000000-0000-4000-8000-0000000000c1';
 n text; v1 uuid; code1 text; code2 text; refused boolean;
begin
 -- a fund made without a code gets its letters from its name, and a clash gets a digit
 insert into funds(name,amount,per_txn_limit) values ('Gamma Delta Epsilon',1000,500) returning code into code1;
 assert code1='GDE','letters come from the words of the name, got '||code1;
 insert into funds(name,amount,per_txn_limit) values ('Great Dark Elephants',1000,500) returning code into code2;
 assert code2<>code1 and code2 ~ '^GDE',' a second fund with the same letters gets its own code, got '||code2;
 begin insert into funds(name,amount,per_txn_limit,code) values ('Bad',1000,500,'lower'); refused:=false;
 exception when check_violation then refused:=true; end;
 assert refused,'a code must be capital letters and digits';

 -- numbers count per fund and start at 0001
 assert public.next_pcv_number(a)='AF-0001','first number of the fund';
 insert into vouchers(fund_id,pcv_number,payee,particulars,amount,category_id,prepared_by,flow_version)
   values(a,public.next_pcv_number(a),'p','x',100,c,u,2) returning id into v1;
 assert (select pcv_number from vouchers where id=v1)='AF-0001','stored with the fund letters';
 assert (select paper_pcv_number from vouchers where id=v1)='AF-0001','the paper number is always the voucher number';
 update vouchers set paper_pcv_number='TYPED-9' where id=v1;
 assert (select paper_pcv_number from vouchers where id=v1)='AF-0001','a typed number cannot differ from the voucher number';
 assert public.next_pcv_number(a)='AF-0002','next number follows';
 assert public.next_pcv_number(b)='BF-0001','another fund counts on its own';

 -- a voided voucher keeps its number, so a number is never used twice
 update vouchers set status='void',void_reason='test' where id=v1;
 assert public.next_pcv_number(a)='AF-0002','a void voucher still holds its number';

 -- the numbering carries past 9999 without cutting digits
 insert into vouchers(fund_id,pcv_number,payee,particulars,amount,category_id,prepared_by,flow_version)
   values(b,'BF-9999','p','x',100,c,u,2);
 assert public.next_pcv_number(b)='BF-10000','five digits when the fund needs them';
end $$;
rollback;
