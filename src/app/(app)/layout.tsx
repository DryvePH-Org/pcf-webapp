import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { UpdateBanner } from "@/components/layout/update-banner";
import { currentBuildId } from "@/lib/build-id";
import { getCurrentUser } from "@/lib/auth";
import { settlementBadgeCount } from "@/lib/settlements-due";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Not awaited: the page and the menu appear at once, and the badge fills in when its count is ready. It used to
  // hold up every page until the count (several database round trips) was done.
  const badges = settlementBadgeCount().then((settlements): Record<string, number> => (settlements > 0 ? { "/settlements": settlements } : {}));
  return (
    <>
      <AppShell user={user} badges={badges}>
        {children}
      </AppShell>
      <UpdateBanner loadedId={currentBuildId()} />
    </>
  );
}
