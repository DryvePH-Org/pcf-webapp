import {
  Bell,
  ClipboardList,
  Files,
  ClipboardCheck,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  RefreshCw,
  ScrollText,
  Tags,
  Users,
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

const OPERATIONS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/funds", label: "Fund assignments", shortLabel: "Funds", icon: Landmark },
  { href: "/requests", label: "Budget Requests", shortLabel: "Requests", icon: ClipboardList },
  { href: "/liquidations", label: "Liquidations", icon: Files },
  { href: "/vouchers", label: "Vouchers", icon: ReceiptText },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck },
  {
    href: "/replenishments",
    label: "Replenishments",
    shortLabel: "Replenish",
    icon: RefreshCw,
  },
  { href: "/audit", label: "Audit Trail", icon: ScrollText },
];

const ADMINISTRATION: NavItem[] = [
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/funds", label: "Funds", icon: Landmark },
  { href: "/admin/categories", label: "Categories", icon: Tags },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
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

export function mobileNavFor(role: Role): {
  primary: NavItem[];
  overflow: NavItem[];
} {
  const items = navGroupsFor(role).flatMap((group) => group.items);
  return { primary: items.slice(0, 4), overflow: items.slice(4) };
}

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
