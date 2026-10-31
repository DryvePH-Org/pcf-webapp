export type Role = "admin" | "custodian" | "approver" | "accounting";

export const ALL_ROLES: readonly Role[] = [
  "admin",
  "custodian",
  "approver",
  "accounting",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  custodian: "Custodian",
  approver: "Approver",
  accounting: "Accounting",
};

const ROUTE_RULES: readonly { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/vouchers", roles: ["admin", "custodian"] },
  { prefix: "/approvals", roles: ["admin", "approver"] },
  { prefix: "/replenishments", roles: ["admin", "custodian", "accounting"] },
  { prefix: "/cash-count", roles: ["admin", "custodian"] },
  { prefix: "/reports", roles: ["admin", "accounting"] },
  { prefix: "/audit", roles: ["admin", "accounting"] },
  { prefix: "/dashboard", roles: ALL_ROLES },
];

export function canAccessRoute(role: Role, pathname: string): boolean {
  const rule = ROUTE_RULES.find(
    (candidate) =>
      pathname === candidate.prefix ||
      pathname.startsWith(`${candidate.prefix}/`),
  );
  return rule ? rule.roles.includes(role) : false;
}

export type Action =
  | "voucher.create"
  | "voucher.submit"
  | "voucher.approve"
  | "voucher.reject"
  | "voucher.release"
  | "voucher.void"
  | "replenishment.create"
  | "replenishment.submit"
  | "replenishment.review"
  | "replenishment.close"
  | "cash.count"
  | "admin.manage";

export const ACTION_ROLES: Record<Action, readonly Role[]> = {
  "voucher.create": ["custodian", "admin"],
  "voucher.submit": ["custodian", "admin"],
  "voucher.approve": ["approver", "admin"],
  "voucher.reject": ["approver", "admin"],
  "voucher.release": ["custodian", "admin"],
  "voucher.void": ["custodian", "admin"],
  "replenishment.create": ["custodian", "admin"],
  "replenishment.submit": ["custodian", "admin"],
  "replenishment.review": ["accounting", "admin"],
  "replenishment.close": ["accounting", "admin"],
  "cash.count": ["custodian", "admin"],
  "admin.manage": ["admin"],
};

export function canPerform(role: Role, action: Action): boolean {
  return ACTION_ROLES[action].includes(role);
}
