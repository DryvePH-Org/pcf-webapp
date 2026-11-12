# Remove duplicate budget requests (keep one)

Use when a double-click created the same budget request more than once. The
one you name is kept; copies are removed only if they are safe to remove.

Replace `BR-20249111` with the request number you want to KEEP (the short form
shown in the app is fine).

## Step 1: preview (changes nothing)

```bash
supabase db query --linked "
with keeper as (select * from budget_requests where request_no ilike 'BR-20249111%')
select r.request_no, r.status, to_char(r.created_at at time zone 'Asia/Manila','YYYY-MM-DD HH24:MI:SS') as created_manila,
       r.amount, left(r.purpose, 40) as purpose, (r.id = k.id) as keep_this_one,
       exists(select 1 from vouchers v where v.budget_request_id = r.id) as has_voucher
from budget_requests r join keeper k
  on r.requester_id = k.requester_id and r.fund_id = k.fund_id and r.amount = k.amount and r.purpose = k.purpose
order by r.created_at"
```

Check the table: exactly one row says `keep_this_one = true`, and it is the one
you want. Rows that will be removed are the others with `status = submitted`,
`has_voucher = false` and created within 10 minutes of the kept one. Save this
output as your record.

## Step 2: remove them

Put the number of rows that will be removed (from Step 1) in place of `N`.
If the real count differs, nothing is deleted.

```bash
supabase db query --linked "
do \$\$
declare removed int;
begin
  with keeper as (select * from budget_requests where request_no ilike 'BR-20249111%')
  delete from budget_requests r using keeper k
  where r.id <> k.id
    and r.requester_id = k.requester_id and r.fund_id = k.fund_id
    and r.amount = k.amount and r.purpose = k.purpose
    and r.status = 'submitted'
    and not exists (select 1 from vouchers v where v.budget_request_id = r.id)
    and r.created_at between k.created_at - interval '10 minutes' and k.created_at + interval '10 minutes';
  get diagnostics removed = row_count;
  if removed <> N then raise exception 'Expected to remove N, would have removed %. Nothing was changed.', removed; end if;
end \$\$"
```

An error message means nothing was changed. Run Step 1 again to confirm only
the kept request remains.
