-- Phase 59: the real handover date and amount are recorded when accounting confirms the cash handover.
--
-- Cash is sometimes handed over before the approvals are recorded (a delayed approval). The app only knew when the
-- button was pressed. Now accounting enters the day the cash really changed hands (never in the future, never before
-- the replenishment was prepared) and the amount handed over. If the amount is not the approved amount, a note
-- explaining the difference is required, and both are kept on the replenishment and shown in its timeline.

alter table public.replenishments
  add column handed_over_on date,
  add column handed_over_amount numeric(12,2) check (handed_over_amount is null or handed_over_amount > 0),
  add column handover_note text check (handover_note is null or char_length(handover_note) <= 300);

create function public.close_replenishment_with_handover(p_id uuid, p_on date, p_amount numeric, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.replenishments; today date := (now() at time zone 'Asia/Manila')::date; note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_role(array['accounting', 'admin']::public.user_role[]);
  select * into r from public.replenishments where id = p_id for update;
  if not found then raise exception 'Replenishment not found'; end if;
  if p_on is null then raise exception 'Enter the day the cash was handed over'; end if;
  if p_on > today then raise exception 'The handover day cannot be in the future'; end if;
  if p_on < (r.created_at at time zone 'Asia/Manila')::date then
    raise exception 'The handover day cannot be before this replenishment was prepared';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) or p_amount > 9999999999.99 then
    raise exception 'Enter the amount handed over, greater than zero with at most two decimals';
  end if;
  if abs(p_amount - r.total) >= 0.01 and note is null then
    raise exception 'The amount handed over (%) is different from the approved amount (%). Explain the difference in the note',
      to_char(p_amount, 'FM999,999,990.00'), to_char(r.total, 'FM999,999,990.00');
  end if;
  update public.replenishments set handed_over_on = p_on, handed_over_amount = p_amount, handover_note = note where id = p_id;
  -- the same closing as before (approver approved, vouchers closed, who and when recorded)
  perform public.close_replenishment(p_id);
end $$;
revoke execute on function public.close_replenishment_with_handover(uuid, date, numeric, text) from public, anon;
grant execute on function public.close_replenishment_with_handover(uuid, date, numeric, text) to authenticated, service_role;
