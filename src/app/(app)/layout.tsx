import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { UpdateBanner } from "@/components/layout/update-banner";
import { currentBuildId } from "@/lib/build-id";
import { getCurrentUser } from "@/lib/auth";
import { loadNavIndicators, type NavIndicators } from "@/lib/nav-indicators";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Not awaited: the page and the menu appear at once, and the indicators fill in when their counts are ready (they used to
  // hold up every page). The menu then refreshes them as the person moves around.
  const badges = loadNavIndicators().catch((): NavIndicators => ({}));
  return (
    <>
      <AppShell user={user} badges={badges}>
        {children}
      </AppShell>
      <UpdateBanner loadedId={currentBuildId()} />
    </>
  );
}
