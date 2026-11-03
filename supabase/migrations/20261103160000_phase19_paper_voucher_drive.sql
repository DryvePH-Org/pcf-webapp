-- Phase 19: keep the photo of the signed paper voucher, and remember where
-- copies were mirrored in Google Drive.
-- Also lets approvers upload photos for the vouchers they prepare (phase 17
-- gave them voucher rights but the storage policy was not widened).

alter table public.vouchers
  add column paper_voucher_path text,
  add column paper_drive_url text,
  add column receipt_drive_url text;

alter table public.vouchers
  add constraint vouchers_paper_voucher_path_len check (char_length(paper_voucher_path) <= 300) not valid,
  add constraint vouchers_paper_drive_url_len check (char_length(paper_drive_url) <= 500) not valid,
  add constraint vouchers_receipt_drive_url_len check (char_length(receipt_drive_url) <= 500) not valid;

-- The preparer attaches the paper photo themselves (RLS limits it to their own
-- drafts). The Drive links are written only by the server with its own key.
grant update (paper_voucher_path) on public.vouchers to authenticated;

drop policy receipts_insert on storage.objects;
create policy receipts_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and public.app_role() in ('custodian', 'approver', 'admin')
    and case
      when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
        then public.can_access_fund(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
