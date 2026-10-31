import { UsersManager } from "@/components/admin/users-manager";
import type { UserRow } from "@/components/admin/types";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const instant = false;

export default async function AdminUsersPage() {
  const currentUser = await requireUser("/admin/users");
  const supabase = await createClient();
  const adminClient = createAdminClient();

  const [profilesResult, authUsersResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active, created_at")
      .order("full_name"),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (profilesResult.error) throw new Error(profilesResult.error.message);
  if (authUsersResult.error) throw new Error(authUsersResult.error.message);

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
  }));

  return <UsersManager users={users} currentUserId={currentUser.id} />;
}
