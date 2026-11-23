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

  const settlements = await settlementBadgeCount();
  return (
    <>
      <AppShell user={user} badges={settlements > 0 ? { "/settlements": settlements } : {}}>
        {children}
      </AppShell>
      <UpdateBanner loadedId={currentBuildId()} />
    </>
  );
}
