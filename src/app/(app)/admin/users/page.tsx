import { UsersManager } from "@/components/admin/users-manager";
import type { FundAssignmentOption, UserRow } from "@/components/admin/types";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const currentUser = await requireUser("/admin/users");
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [profilesResult, authUsersResult, fundsResult, linksResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at")
      .order("full_name"),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("funds")
      .select("id, name, amount, is_active")
      .order("name"),
    supabase.from("fund_custodians").select("fund_id, custodian_id"),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (authUsersResult.error) throw new Error(authUsersResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);
  if (linksResult.error) throw new Error(linksResult.error.message);

  const fundNames = new Map(fundsResult.data.map((fund) => [fund.id, fund.name]));
  const heldBy = new Map<string, string[]>();
  const custodiansOf = new Map<string, string[]>();
  for (const link of linksResult.data) {
    heldBy.set(link.custodian_id, [
      ...(heldBy.get(link.custodian_id) ?? []),
      fundNames.get(link.fund_id) ?? "—",
    ]);
    custodiansOf.set(link.fund_id, [
      ...(custodiansOf.get(link.fund_id) ?? []),
      link.custodian_id,
    ]);
  }

  const emails = new Map(
    authUsersResult.data.users.map((user) => [user.id, user.email ?? "—"]),
  );

  const users: UserRow[] = profilesResult.data.map((profile) => ({
    id: profile.id,
    full_name: profile.full_name,
    email: emails.get(profile.id) ?? "—",
    role: profile.role,
    is_active: profile.is_active,
    joined: formatDate(profile.created_at),
    funds: heldBy.get(profile.id) ?? [],
  }));

  const names = new Map(profilesResult.data.map((p) => [p.id, p.full_name]));
  const fundOptions: FundAssignmentOption[] = fundsResult.data
    .filter((fund) => fund.is_active)
    .map((fund) => ({
      id: fund.id,
      name: fund.name,
      amount: String(fund.amount),
      custodian_ids: custodiansOf.get(fund.id) ?? [],
      custodian_names: (custodiansOf.get(fund.id) ?? []).map((id) => names.get(id) ?? "—"),
    }));

  return (
    <UsersManager
      users={users}
      funds={fundOptions}
      currentUserId={currentUser.id}
    />
  );
}
