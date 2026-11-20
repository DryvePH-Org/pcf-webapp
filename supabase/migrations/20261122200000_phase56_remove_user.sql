-- Phase 56: an administrator can remove a person who has no history.
--
-- A person who has made requests, vouchers or liquidations (or any other record) must stay, or the history would
-- lose its owner; they can be deactivated instead, which keeps everything. A person who never did anything (a
-- mistaken account, someone who never started) can be removed completely.
--
-- remove_user refuses, with a plain reason:
--   * your own account;
--   * a custodian who still holds a fund, and an approver still assigned to a fund (reassign first);
--   * anyone with records (the database's own links decide this, so no record can ever be missed).
-- It also clears what is only housekeeping (liquidation reminders), writes an audit record with who was removed and
-- by whom, and the app then deletes the sign-in account.

create function public.remove_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare person public.profiles; mail text; held text;
begin
  perform public.require_role(array['admin']::public.user_role[]);
  if p_user = auth.uid() then raise exception 'You cannot remove your own account'; end if;
  select * into person from public.profiles where id = p_user;
  if not found then raise exception 'User not found'; end if;
  select string_agg(f.name, ', ' order by f.name) into held
  from public.fund_custodians fc join public.funds f on f.id = fc.fund_id where fc.custodian_id = p_user;
  if held is not null then raise exception 'This custodian still holds %. Reassign the fund first', held; end if;
  select string_agg(f.name, ', ' order by f.name) into held
  from public.fund_approvers fa join public.funds f on f.id = fa.fund_id where fa.approver_id = p_user;
  if held is not null then raise exception 'This approver is still assigned to %. Change the fund''s approver first', held; end if;
  select email into mail from auth.users where id = p_user;
  begin
    delete from public.liquidation_reminders where recipient_id = p_user;
    delete from public.profiles where id = p_user;
  exception when foreign_key_violation then
    raise exception 'This person has records in the system (requests, vouchers, liquidations or other history), so they cannot be removed. Deactivate them instead: that keeps the history';
  end;
  insert into public.audit_log(entity_type, entity_id, action, actor_id, old_data)
  values ('profiles', p_user, 'user_removed', auth.uid(), jsonb_build_object('full_name', person.full_name, 'role', person.role, 'email', mail));
end $$;
revoke execute on function public.remove_user(uuid) from public, anon;
grant execute on function public.remove_user(uuid) to authenticated, service_role;
