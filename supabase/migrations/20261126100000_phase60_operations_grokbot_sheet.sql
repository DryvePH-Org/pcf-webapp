-- Phase 60: the Operations Parts & Repairs sheet and its own Grokbot (a third bot, after Buying and DRYVE).
--
-- One bot per spreadsheet. The database allows operations only for the listed sheets (keep this list in step with
-- src/lib/grokbot/targets.ts), runs a sheet's operations one at a time, and lets different sheets run side by side.
-- The existing "operations" workbook is pointed at the new spreadsheet, tab "PCF REPLENISHMENT #1 (NEW)". It stays
-- disabled until an administrator assigns its custodian and fund. Its replenishment counter starts at 0, so the first
-- marker on the sheet is PCF REPLENISHMENT #01.

create or replace function public.grokbot_targets() returns table(book text, spreadsheet_id text, sheet_id int, sheet_title text)
language sql immutable as $$
  select * from (values
    ('buying'::text,     '1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk'::text, 1042918180::int, 'PCF REPLENISHMENT - BUYING (NOV-DEC 2026)'::text),
    ('dryve'::text,      '1N705j5lSHGXgjqgdj8vPSe3HbgNA1QXRd9RWzTPcCBQ'::text, 1251133408::int, 'DRYVE PCF - NOV TO DEC 2026'::text),
    ('operations'::text, '1uG_1IEvMSnKl2WcQFbRA0mCWs6vudCCPlVVDifkjiak'::text,                  180635821::int,  'PCF REPLENISHMENT #1 (NEW)'::text)
  ) t(book, spreadsheet_id, sheet_id, sheet_title);
$$;

-- anything left from the sheet this workbook used to point at is of no use now
delete from public.sheet_expenses where book_id = 'operations';

update public.sheet_workbooks set
 name = 'MAD Operations (Parts & Repairs)',
 spreadsheet_id = '1uG_1IEvMSnKl2WcQFbRA0mCWs6vudCCPlVVDifkjiak',
 active_sheet_id = 180635821,
 enabled = false, custodian_id = null, fund_id = null,
 catalog = jsonb_build_array(jsonb_build_object('sheetId', 180635821, 'title', 'PCF REPLENISHMENT #1 (NEW)',
  'gridProperties', jsonb_build_object('rowCount', 904, 'columnCount', 29),
  'expenseTags', jsonb_build_array(
   'CE - TIRES', 'CE - PAINT', 'CE - BODY WORK',
   'CE - FUEL', 'CE - BATTERY', 'CE - AC',
   'CE - UPHOLSTERY', 'CE - PMS', 'CE - PARTS',
   'CE - MECHANICAL', 'CE - OTHERS', 'CE - SHIPPING',
   'CE - REGISTRATION', 'CE - TRANSFER', 'CE - PARKING AND TOLL',
   'CE - NOTARIAL EXPENSE', 'CE - TRANSFER EXPENSE', 'CE - RENEWAL EXPENSE',
   'NCE - DETAILING SUPPLIES', 'NCE - TRANSPORTATION', 'NCE - DELIVERY/COURIER',
   'NCE - FACILITATION (SOP) / VERIFICATION', 'NCE - TAXES AND LICENSES', 'NCE - LICENSES AND PERMIT',
   'NCE - MEALS', 'NCE - REPRESENTATION', 'NCE - CLEANING SUPPLIES',
   'NCE - ADMIN & OFFICE SUPPLIES', 'NCE - DRINKING WATER SUPPLIES', 'NCE - ASSOCIATION DUES',
   'NCE - MARKETING EXPENSE', 'NCE - MEDICAL EXPENSE', 'NCE - BANKING FEE / GCASH FEE',
   'NCE - COMMUNICATION', 'NCE - REPAIR AND MAINTENANCE', 'NCE - LEASEHOLD IMPROVEMENTS',
   'NCE - ENTERTAINMENT EXPENSE', 'NCE - OTHER SALARIES / BONUSES', 'NCE - OTHERS'))),
 replenishment_sequence = 0,
 config_version = config_version + 1, last_synced_at = null, refresh_until = null, refresh_token = null, sync_error = null
where id = 'operations';
