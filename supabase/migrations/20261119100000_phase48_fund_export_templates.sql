-- Phase 48: Excel export of a fund's ledger from the app's own data.
-- Each fund's ledger is laid out differently, so an admin uploads the fund's own .xlsx once
-- and the export fills that file in. The files are private: only the server reads them
-- (with its service key), so the bucket has no policies for signed-in users.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fund-templates','fund-templates',false,15728640,array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create table public.fund_export_templates (
  fund_id uuid primary key references public.funds(id) on delete cascade,
  file_name text not null check (length(file_name) between 1 and 200),
  storage_path text not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  uploaded_at timestamptz not null default now()
);
alter table public.fund_export_templates enable row level security;

create policy fund_export_templates_read on public.fund_export_templates for select to authenticated
  using (public.app_role() in ('admin','accounting'));
