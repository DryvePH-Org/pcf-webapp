import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell user={user} badges={settlements > 0 ? { "/settlements": settlements } : {}}>
      {children}
    </AppShell>
  );
}
