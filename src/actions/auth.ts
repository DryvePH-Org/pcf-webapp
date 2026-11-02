"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { sendSignInCode } from "@/lib/email";
import { clientIp, withinLimit } from "@/lib/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { emailField } from "@/lib/validators/text";

export type SignInCodeState = {
  status: "idle" | "sent" | "error";
  message: string | null;
};

const emailSchema = z.object({ email: emailField });

const PAGE_SIZE = 200;
const MAX_PAGES = 10;

async function hasActiveAccount(email: string) {
  const admin = createAdminClient();

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: PAGE_SIZE,
    });
    if (error) throw error;

    const user = data.users.find((candidate) => candidate.email === email);
    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("is_active")
        .eq("id", user.id)
        .maybeSingle();
      return Boolean(profile?.is_active);
    }
    if (data.users.length < PAGE_SIZE) break;
  }

  return false;
}

export async function requestSignInCode(
  _previousState: SignInCodeState,
  formData: FormData,
): Promise<SignInCodeState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const { email } = parsed.data;

  // Stops code-spamming (inbox flooding, email quota burn) per address and per
  // caller. The same answer is given whether or not the account exists.
  const ip = await clientIp();
  if (
    !(await withinLimit(`code:email:${email}`, 3, 600)) ||
    !(await withinLimit(`code:ip:${ip}`, 10, 600))
  ) {
    return {
      status: "error",
      message: "Too many attempts. Wait a few minutes before asking for another code.",
    };
  }

  try {
    // Only people with an admin-created, active account get a code. The reply
    // is identical either way so the form can't be used to probe for accounts.
    if (await hasActiveAccount(email)) {
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });
      if (error || !data.properties?.email_otp) {
        throw error ?? new Error("No sign-in code was generated");
      }
      await sendSignInCode(email, data.properties.email_otp);
    }
  } catch (error) {
    console.error("requestSignInCode failed", error);
    return {
      status: "error",
      message: "Could not send a sign-in code. Try again in a moment.",
    };
  }

  return {
    status: "sent",
    message: `If ${email} has an account, a sign-in code is on its way.`,
  };
}

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; error: "invalid_code" | "inactive" | "rate_limited" };

const verifyCodeSchema = z.object({
  email: emailField,
  token: z.string().trim().regex(/^\d{6,8}$/),
});

export async function verifyEmailCode(input: {
  email: string;
  token: string;
}): Promise<VerifyCodeResult> {
  const parsed = verifyCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_code" };

  // Codes are short, so cap guesses per address and per caller.
  const ip = await clientIp();
  if (
    !(await withinLimit(`verify:email:${parsed.data.email}`, 8, 600)) ||
    !(await withinLimit(`verify:ip:${ip}`, 30, 600))
  ) {
    return { ok: false, error: "rate_limited" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });
  if (error || !data.user) return { ok: false, error: "invalid_code" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .single();

  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return { ok: false, error: "inactive" };
  }

  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
