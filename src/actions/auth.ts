"use server";

import { redirect } from "next/navigation";

import { clientIp, withinLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/validators/auth";

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
