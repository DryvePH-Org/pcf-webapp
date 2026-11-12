"use server";

import { redirect } from "next/navigation";
import { createClient as createStandaloneClient } from "@supabase/supabase-js";

import { getCurrentUser } from "@/lib/auth";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  changePasswordSchema,
  signInSchema,
  type ChangePasswordValues,
} from "@/lib/validators/auth";

export type SignInResult =
  | { ok: true }
  | { ok: false; error: "invalid_credentials" | "rate_limited" | "unavailable" };

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<SignInResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_credentials" };

  try {
    const ip = await clientIp();
    if (
      !(await withinLimit(`login:email:${parsed.data.email}`, 8, 600)) ||
      !(await withinLimit(`login:ip:${ip}`, 30, 600))
    ) {
      return { ok: false, error: "rate_limited" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) return { ok: false, error: "invalid_credentials" };

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", data.user.id)
      .single();

    // Missing or disabled profiles must not keep an authenticated session.
    if (profileError || !profile?.is_active) {
      await supabase.auth.signOut();
      return { ok: false, error: "invalid_credentials" };
    }

    return { ok: true };
  } catch {
    // Never log the credentials or expose provider error details.
    return { ok: false, error: "unavailable" };
  }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type ChangePasswordResult =
  | { ok: true; signedOut?: boolean }
  | { ok: false; field?: "current" | "next" | "confirm"; error: string };

// Checks the current password, sets the new one, and signs out every other
// device. The browser session that made the change stays signed in.
export async function changeMyPassword(
  input: ChangePasswordValues,
): Promise<ChangePasswordResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in again, then retry." };

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue?.path[0];
    return {
      ok: false,
      field: field === "current" || field === "next" || field === "confirm" ? field : undefined,
      error: issue?.message ?? "Check the form.",
    };
  }

  try {
    if (!(await withinLimit(`password:change:${user.id}`, 5, 600))) {
      return { ok: false, error: "Too many attempts. Wait a few minutes, then try again." };
    }

    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.email) return { ok: false, error: "Sign in again, then retry." };

    // Verify the current password on a throwaway client so the browser's own
    // session cookies are not touched, then end that extra session.
    const checker = createStandaloneClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { error: wrongPassword } = await checker.auth.signInWithPassword({
      email: authUser.email,
      password: parsed.data.current,
    });
    if (wrongPassword) {
      return { ok: false, field: "current", error: "Your current password is not correct." };
    }
    await checker.auth.signOut({ scope: "local" });

    // Changing it through the user's own session keeps this browser signed in
    // and ends every other session.
    const { error } = await supabase.auth.updateUser({ password: parsed.data.next });
    if (error?.code === "weak_password" || error?.code === "same_password") {
      return { ok: false, field: "next", error: "That password is too easy to guess, or was used before. Choose another." };
    }
    if (error) {
      // Some projects require a recent sign-in for this. The current password
      // was just verified, so set it directly; that signs out every device,
      // this one included.
      const { error: adminError } = await createAdminClient().auth.admin.updateUserById(user.id, {
        password: parsed.data.next,
      });
      if (adminError) {
        return adminError.code === "weak_password"
          ? { ok: false, field: "next", error: "That password is too easy to guess. Choose a longer one." }
          : { ok: false, error: "Could not change the password. Try again." };
      }
      return { ok: true, signedOut: true };
    }

    await supabase.auth.signOut({ scope: "others" });
    return { ok: true };
  } catch {
    // Never log or echo passwords.
    return { ok: false, error: "Could not change the password. Try again." };
  }
}
