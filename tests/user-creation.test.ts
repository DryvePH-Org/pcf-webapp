import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAdminUser: vi.fn(), createUser: vi.fn(), deleteUser: vi.fn(),
  insert: vi.fn(), queueNotification: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminUser: mocks.getAdminUser }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: { admin: { createUser: mocks.createUser, deleteUser: mocks.deleteUser } },
    from: () => ({ insert: mocks.insert }),
  }),
}));
vi.mock("@/lib/notifications/deliver", () => ({ queueNotification: mocks.queueNotification }));
vi.mock("@/lib/notifications/events", () => ({
  notifyFundAssignment: vi.fn(), notifyUserAccessChanged: vi.fn(),
  notifyUserRoleChanged: vi.fn(), notifyUserWelcome: vi.fn(),
}));

import { createUser } from "@/actions/users";

const input = { full_name: "Maria Santos", email: "Maria@Example.com", password: " Secret <&> ", role: "custodian" as const };

describe("admin account creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getAdminUser.mockResolvedValue({ id: "admin-id", role: "admin" });
    mocks.createUser.mockResolvedValue({ data: { user: { id: "new-id" } }, error: null });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it("requires an administrator before creating an auth account", async () => {
    mocks.getAdminUser.mockResolvedValue(null);
    expect((await createUser(input)).ok).toBe(false);
    expect(mocks.createUser).not.toHaveBeenCalled();
  });

  it("passes the password only to Auth and keeps role in the profile", async () => {
    expect(await createUser(input)).toEqual({ ok: true });
    expect(mocks.createUser).toHaveBeenCalledWith({
      email: "maria@example.com", password: input.password, email_confirm: true,
      user_metadata: { full_name: input.full_name },
    });
    expect(mocks.insert).toHaveBeenCalledWith({ id: "new-id", full_name: input.full_name, role: input.role });
    expect(mocks.queueNotification.mock.calls[0][0]).toBe("user.welcome");
    expect(mocks.queueNotification.mock.calls[0]).not.toContain(input.password);
  });

  it("does not leave an auth account behind when the profile cannot be created", async () => {
    mocks.insert.mockResolvedValue({ error: { message: "profile insert failed" } });
    expect((await createUser(input)).ok).toBe(false);
    expect(mocks.deleteUser).toHaveBeenCalledWith("new-id");
    expect(mocks.queueNotification).not.toHaveBeenCalled();
  });
});
