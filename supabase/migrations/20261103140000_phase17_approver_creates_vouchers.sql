-- Phase 17: approvers can prepare vouchers too.
-- They get the same rights a custodian has over their OWN vouchers (create,
-- edit a draft, submit, release, void a draft). They still cannot approve a
-- voucher they prepared, and they cannot touch other people's vouchers.
do $$
declare
  fn text;
  def text;
begin
  foreach fn in array array[
    'create_voucher_lines', 'update_voucher_lines', 'submit_voucher',
    'release_voucher', 'void_voucher'
  ] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = fn;

    def := replace(def,
      'array[''custodian'', ''admin'']::public.user_role[]',
      'array[''custodian'', ''approver'', ''admin'']::public.user_role[]');
    -- Anywhere the code limited a custodian to their own vouchers, limit approvers too.
    def := replace(def, 'v_role = ''custodian''', 'v_role in (''custodian'', ''approver'')');
    def := replace(def, 'Custodians can only void', 'You can only void');

    execute def;
  end loop;
end $$;
