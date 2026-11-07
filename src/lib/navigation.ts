import {
  Bell,
  ClipboardCheck,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  Scale,
  ScrollText,
  Table2,
  Tags,
  Trash2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { canAccessRoute, type Role } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

// Day-to-day work first, in the order money moves: ask, spend, justify, check.
const OPERATIONS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests", label: "Budget requests", shortLabel: "Requests", icon: ClipboardList },
  { href: "/vouchers", label: "Vouchers", icon: ReceiptText },
  { href: "/liquidations", label: "Liquidations", icon: Scale },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  {
    href: "/replenishments",
    label: "Replenishments",
    shortLabel: "Replenish",
    icon: RefreshCw,
  },
  { href: "/accounting", label: "Accounting sheets", shortLabel: "Sheets", icon: Table2 },
  { href: "/funds", label: "Fund assignments", shortLabel: "Funds", icon: Landmark },
  { href: "/audit", label: "Audit trail", icon: ScrollText },
];

const ADMINISTRATION: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/funds", label: "Funds", icon: Wallet },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/sheets", label: "Google Sheets", icon: Table2 },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/data", label: "Data deletion", icon: Trash2 },
];

export function navGroupsFor(role: Role): NavGroup[] {
  const groups: NavGroup[] = [
    {
      label: "Operations",
      items: OPERATIONS.filter((item) => canAccessRoute(role, item.href)),
    },
  ];

  const adminItems = ADMINISTRATION.filter((item) =>
    canAccessRoute(role, item.href),
  );
  if (adminItems.length > 0) {
    groups.push({ label: "Administration", items: adminItems });
  }

  return groups;
}

// The four bottom tabs are what each role reaches for most; the rest sit under "More".
const MOBILE_FIRST: Record<Role, string[]> = {
  admin: ["/dashboard", "/approvals", "/vouchers", "/requests"],
  custodian: ["/dashboard", "/vouchers", "/requests", "/liquidations"],
  approver: ["/dashboard", "/approvals", "/vouchers", "/requests"],
  accounting: ["/dashboard", "/replenishments", "/accounting", "/audit"],
  requester: ["/dashboard", "/requests", "/liquidations"],
};

export function mobileNavFor(role: Role): {
  primary: NavItem[];
  overflow: NavItem[];
} {
  const items = navGroupsFor(role).flatMap((group) => group.items);
  const wanted = MOBILE_FIRST[role] ?? [];
  const primary = wanted
    .map((href) => items.find((item) => item.href === href))
    .filter((item): item is NavItem => Boolean(item))
    .slice(0, 4);
  const fallback = items.filter((item) => !primary.includes(item));
  while (primary.length < Math.min(4, items.length)) {
    const next = fallback.shift();
    if (!next) break;
    primary.push(next);
  }
  return { primary, overflow: items.filter((item) => !primary.includes(item)) };
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
