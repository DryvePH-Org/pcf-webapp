"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth";
import { loadNavIndicators, navHrefFor, SEEN_TONES, type NavIndicators } from "@/lib/nav-indicators";
import { navGroupsFor } from "@/lib/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type { WorkflowDatabase } from "@/lib/workflow";

export async function refreshNavIndicators(): Promise<NavIndicators> {
  try {
    return await loadNavIndicators();
  } catch {
    return {};
  }
}

// The person opened a page: news that points to it counts as seen. The list page of a menu entry clears all the news
// under it; a detail page clears only the news about that one record. Work that still has to be done is not touched.
export async function markNavSeen(pathname: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user || typeof pathname !== "string" || pathname.length > 300 || !/^\/[A-Za-z0-9/_.%-]*$/.test(pathname)) return;
  const hrefs = navGroupsFor(user.role).flatMap((group) => group.items.map((item) => item.href));
  const isList = hrefs.includes(pathname);
  if (!isList && !navHrefFor(pathname, hrefs)) return;

  // Written with the server's access: people may read their own notifications but not change them directly.
  const admin = createAdminClient() as unknown as SupabaseClient<WorkflowDatabase>;
  const unread = await admin
    .from("notifications")
    .select("id, link_path")
    .eq("user_id", user.id)
    .is("read_at", null)
    .in("tone", [...SEEN_TONES])
    .not("link_path", "is", null)
    .limit(300);
  if (unread.error) return;
  const ids = (unread.data ?? [])
    .filter((row) => (isList ? navHrefFor(row.link_path, [pathname]) === pathname : row.link_path?.split("?")[0] === pathname))
    .map((row) => row.id);
  if (ids.length === 0) return;
  await admin.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).in("id", ids);
}
