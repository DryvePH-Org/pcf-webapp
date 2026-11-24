-- Phase 66: the voucher number follows the number already printed on the liquidation forms.
--
-- Phase 65 gave each voucher the fund's letters and the digits the sheet used. But the liquidation forms the
-- custodians had already printed carry the old app number (PCV-2026-0035), so the paper files and the app did not
-- match. The digits now come from that printed number, with the fund's letters in front: PCV-2026-0035 in the Buying
-- fund is B-0035. A fund skips the numbers that belonged to the other funds in the old shared counter, which is
-- exactly what the printed forms show. A voucher made after phase 65 (it has no printed form) takes the next number
-- of its fund after these. The number from phase 65 stays in previous_number, so searching for it still finds the
-- voucher.

-- Step 1: park every number on a short unique value, so the new numbers cannot collide with the ones they replace.
update public.vouchers
set previous_number = coalesce(previous_number, pcv_number),
    pcv_number = 'T' || number_order::text,
    paper_pcv_number = 'T' || number_order::text;

-- Step 2: the digits of the printed number, with the fund's letters.
with plan as (
  select v.id, v.fund_id, f.code, v.created_at,
         case when v.previous_number ~ '^PCV-[0-9]{4}-[0-9]+$' then substring(v.previous_number from '[0-9]+$')::int end as printed
  from public.vouchers v join public.funds f on f.id = v.fund_id
), keep as (
  select p.*, row_number() over (partition by p.fund_id, p.printed order by p.created_at, p.id) as rn from plan p
), fixed as (
  select id, fund_id, code, printed as no from keep where printed is not null and rn = 1
), rest as (
  select k.id, k.fund_id, k.code, row_number() over (partition by k.fund_id order by k.created_at, k.id) as ord
  from keep k where not (k.printed is not null and k.rn = 1)
), base as (
  select fund_id, max(no) as mx from fixed group by fund_id
), numbered as (
  select id, code, no from fixed
  union all
  select r.id, r.code, coalesce(b.mx, 0) + r.ord from rest r left join base b on b.fund_id = r.fund_id
)
update public.vouchers v
set pcv_number = n.code || '-' || lpad(n.no::text, greatest(4, length(n.no::text)), '0'),
    paper_pcv_number = n.code || '-' || lpad(n.no::text, greatest(4, length(n.no::text)), '0')
from numbered n
where n.id = v.id;

update public.liquidations l set pcv_number = v.pcv_number from public.vouchers v where v.id = l.voucher_id;
