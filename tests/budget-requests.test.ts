import { describe, expect, it } from "vitest";
import { ALL_ROLES, canAccessRoute, canPerform } from "@/lib/permissions";
import { createUserSchema } from "@/lib/validators/user";
import { createBudgetRequestSchema, reviewBudgetRequestSchema } from "@/lib/validators/budget-request";
import { createVoucherSchema, updateVoucherSchema } from "@/lib/validators/voucher";

const request = { fund_id: "90000000-0000-4000-8000-000000000010", requester_name: "Maria Santos", amount: "1500.50", purpose: "Purchase supplies" };
describe("requester access", () => {
  it("lets every role request a budget", () => {
    for (const role of ALL_ROLES) {
      expect(canAccessRoute(role, "/requests/new")).toBe(true);
      expect(canPerform(role, "request.create")).toBe(true);
    }
  });
  it("supports a standalone requester without financial staff permissions", () => {
    expect(createUserSchema.safeParse({ full_name: "Maria Santos", email: "maria@example.com", password: "Example-passw0rd", role: "requester" }).success).toBe(true);
    for (const path of ["/vouchers", "/vouchers/new", "/approvals", "/replenishments", "/admin/users", "/audit"]) expect(canAccessRoute("requester", path)).toBe(false);
    for (const action of ["request.review", "voucher.create", "voucher.approve", "replenishment.close", "admin.manage"] as const) expect(canPerform("requester", action)).toBe(false);
  });
  it("limits request review to custodians, fund approvers and administrators", () => {
    // Approvers only review a custodian's own request in their assigned fund; the database enforces that.
    expect(ALL_ROLES.filter(role => canPerform(role, "request.review"))).toEqual(["admin", "custodian", "approver"]);
  });
});
describe("budget request validation", () => {
  it("cleans names/purpose and preserves cents", () => {
    const parsed = createBudgetRequestSchema.parse({ ...request, requester_name: " Maria Santos ", purpose: "<b>Supplies</b>\u0000" });
    expect(parsed.requester_name).toBe("Maria Santos");
    expect(parsed.purpose).toBe("bSupplies/b");
    expect(parsed.amount).toBe("1500.50");
  });
  it.each(["0", "-1", "1.001", "1,000", "NaN", "Infinity", "", "10000000000"])("rejects invalid budget %s", amount => {
    expect(createBudgetRequestSchema.safeParse({ ...request, amount }).success).toBe(false);
  });
  it("rejects missing fields, forged fund IDs, and overlong purposes", () => {
    for (const invalid of [{ purpose: " " }, { requester_name: " " }, { fund_id: "anything" }, { purpose: "x".repeat(301) }]) expect(createBudgetRequestSchema.safeParse({ ...request, ...invalid }).success).toBe(false);
  });
  it("requires a rejection reason but permits approval without a note", () => {
    expect(reviewBudgetRequestSchema.safeParse({ id: request.fund_id, approve: false, note: " " }).success).toBe(false);
    expect(reviewBudgetRequestSchema.safeParse({ id: request.fund_id, approve: false, note: "Not a fund expense" }).success).toBe(true);
    expect(reviewBudgetRequestSchema.safeParse({ id: request.fund_id, approve: true }).success).toBe(true);
  });
  it("validates request linkage for creation and strips it from ordinary edits", () => {
    const voucher = { fund_id: request.fund_id, payee: request.requester_name, voucher_date: "2026-11-06", budget_request_id: request.fund_id, items: [{ particulars: request.purpose, amount: request.amount, category_id: request.fund_id }] };
    expect(createVoucherSchema.parse(voucher).budget_request_id).toBe(request.fund_id);
    expect(createVoucherSchema.safeParse({ ...voucher, budget_request_id: "forged" }).success).toBe(false);
    expect(updateVoucherSchema.parse({ ...voucher, voucher_id: request.fund_id })).not.toHaveProperty("budget_request_id");
  });
});
