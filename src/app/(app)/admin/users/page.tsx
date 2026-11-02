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

  const [profilesResult, authUsersResult, fundsResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at")
      .order("full_name"),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("funds")
      .select("id, name, amount, custodian_id, is_active")
      .order("name"),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (authUsersResult.error) throw new Error(authUsersResult.error.message);
  if (fundsResult.error) throw new Error(fundsResult.error.message);

  const heldBy = new Map<string, string[]>();
  for (const fund of fundsResult.data) {
    if (!fund.custodian_id) continue;
    heldBy.set(fund.custodian_id, [
      ...(heldBy.get(fund.custodian_id) ?? []),
      fund.name,
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
      custodian_id: fund.custodian_id,
      custodian_name: fund.custodian_id ? (names.get(fund.custodian_id) ?? null) : null,
    }));

  return (
    <UsersManager
      users={users}
      funds={fundOptions}
      currentUserId={currentUser.id}
    />
  );
}
