create table public.grokbot_operations (
 id uuid primary key,
 kind text not null check(kind in ('reference_audit','integration_test','liquidation_approved','replenishment_approved')),
 status text not null default 'queued' check(status in ('queued','running','completed','blocked','failed')),
 spreadsheet_id text not null check(spreadsheet_id='1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk'),
 sheet_id int not null check(sheet_id=1042918180),
 callback_hash text not null check(length(callback_hash)=64),
 payload jsonb not null,
 report jsonb,
 error text,
 liquidation_id uuid references public.liquidations(id) on delete cascade,
 replenishment_id uuid references public.replenishments(id) on delete cascade,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 expires_at timestamptz not null,
 check(kind<>'liquidation_approved' or liquidation_id is not null),
 check(kind<>'replenishment_approved' or replenishment_id is not null),
 check(octet_length(payload::text)<=262144),
 check(report is null or octet_length(report::text)<=262144)
);
alter table public.grokbot_operations enable row level security;
revoke all on public.grokbot_operations from public,anon,authenticated;
grant all on public.grokbot_operations to service_role;
create unique index grokbot_one_active_destination on public.grokbot_operations(spreadsheet_id,sheet_id)
where status in ('queued','running');
