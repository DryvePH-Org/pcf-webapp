export type Role = "admin" | "custodian" | "approver" | "accounting" | "requester";

export const ALL_ROLES: readonly Role[] = [
  "admin",
  "custodian",
  "approver",
  "accounting",
  "requester",
];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Administrator",
  custodian: "Custodian",
  approver: "Approver",
  accounting: "Accounting",
  requester: "Requester",
};

const ROUTE_RULES: readonly { prefix: string; roles: readonly Role[] }[] = [
  { prefix: "/accounting", roles: ["admin", "accounting"] },
  { prefix: "/funds", roles: ["admin", "accounting"] },
  { prefix: "/requests", roles: ALL_ROLES },
  { prefix: "/liquidations", roles: ALL_ROLES },
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/vouchers/new", roles: ["admin", "custodian", "approver"] },
  { prefix: "/vouchers", roles: ["admin", "custodian", "approver", "accounting"] },
  { prefix: "/approvals", roles: ["admin", "approver"] },
  { prefix: "/replenishments", roles: ["admin", "custodian", "accounting", "approver"] },
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
  | "request.create"
  | "request.review"
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
  | "admin.manage";

export const ACTION_ROLES: Record<Action, readonly Role[]> = {
  "request.create": ALL_ROLES,
  "request.review": ["custodian", "admin"],
  "voucher.create": ["custodian", "approver", "admin"],
  "voucher.submit": ["custodian", "approver", "admin"],
  "voucher.approve": ["approver", "admin"],
  "voucher.reject": ["approver", "admin"],
  "voucher.release": ["custodian", "approver", "admin"],
  "voucher.void": ["custodian", "approver", "admin"],
  "replenishment.create": ["custodian", "admin"],
  "replenishment.submit": ["custodian", "admin"],
  "replenishment.review": ["accounting", "admin"],
  "replenishment.close": ["accounting", "admin"],
  "admin.manage": ["admin"],
};

export function canPerform(role: Role, action: Action): boolean {
  return ACTION_ROLES[action].includes(role);
}
