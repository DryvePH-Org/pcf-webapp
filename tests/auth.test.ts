import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  profile: vi.fn(),
  withinLimit: vi.fn(),
  clientIp: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  withinLimit: mocks.withinLimit,
  clientIp: mocks.clientIp,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { signIn } from "@/actions/auth";
import { newPasswordSchema } from "@/lib/validators/auth";
import { createUserSchema } from "@/lib/validators/user";

const credentials = { email: "employee@example.com", password: " secret <&> " };

describe("password sign-in", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.clientIp.mockResolvedValue("127.0.0.1");
    mocks.withinLimit.mockResolvedValue(true);
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: "employee-id" } }, error: null });
    mocks.profile.mockResolvedValue({ data: { is_active: true }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.createClient.mockResolvedValue({
      auth: { signInWithPassword: mocks.signInWithPassword, signOut: mocks.signOut },
      from: () => ({ select: () => ({ eq: () => ({ single: mocks.profile }) }) }),
    });
  });

  it("normalizes email but passes the password unchanged", async () => {
    expect(await signIn({ ...credentials, email: " Employee@Example.com " })).toEqual({ ok: true });
    expect(mocks.signInWithPassword).toHaveBeenCalledWith(credentials);
    expect(mocks.signOut).not.toHaveBeenCalled();
  });

  it("rejects malformed input before contacting the provider", async () => {
    expect(await signIn({ ...credentials, email: "invalid" })).toEqual({ ok: false, error: "invalid_credentials" });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("stops rate-limited attempts before checking passwords", async () => {
    mocks.withinLimit.mockResolvedValue(false);
    expect(await signIn(credentials)).toEqual({ ok: false, error: "rate_limited" });
    expect(mocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("does not expose provider errors or whether an account exists", async () => {
    mocks.signInWithPassword.mockResolvedValue({ data: { user: null }, error: { message: "internal provider detail" } });
    expect(await signIn(credentials)).toEqual({ ok: false, error: "invalid_credentials" });
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it.each([
    { data: { is_active: false }, error: null },
    { data: null, error: null },
    { data: null, error: { message: "database unavailable" } },
  ])("clears sessions for disabled, missing, or unreadable profiles: %j", async (profile) => {
    mocks.profile.mockResolvedValue(profile);
    expect(await signIn(credentials)).toEqual({ ok: false, error: "invalid_credentials" });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("handles an unavailable backend without exposing exception details", async () => {
    mocks.createClient.mockRejectedValue(new Error("private config details"));
    expect(await signIn(credentials)).toEqual({ ok: false, error: "unavailable" });
  });
});

describe("admin-created passwords", () => {
  it("requires a password on account creation", () => {
    expect(createUserSchema.safeParse({ full_name: "Maria Santos", email: "maria@example.com", role: "custodian" }).success).toBe(false);
  });

  it("enforces length without changing password characters", () => {
    expect(newPasswordSchema.safeParse("short").success).toBe(false);
    expect(newPasswordSchema.safeParse("x".repeat(129)).success).toBe(false);
    expect(newPasswordSchema.parse(credentials.password)).toBe(credentials.password);
  });
});
