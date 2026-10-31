import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { canAccessRoute, type Role } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

export type CurrentUser = {
  id: string;
  full_name: string;
  role: Role;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  // Supabase auth checks token expiry with Date.now(); defer past prerendering.
  await connection();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) return null;

  return {
    id: profile.id,
    full_name: profile.full_name,
    role: profile.role,
  };
});

export async function requireUser(pathname: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessRoute(user.role, pathname)) redirect("/dashboard");
  return user;
}

export async function getAdminUser(): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user?.role === "admin" ? user : null;
}
