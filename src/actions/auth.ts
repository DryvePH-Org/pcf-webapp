"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/url";

export type MagicLinkState = {
  status: "idle" | "sent" | "error";
  message: string | null;
};

const emailSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export async function requestMagicLink(
  _previousState: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const origin = await getOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
      shouldCreateUser: false,
    },
  });

  if (error) {
    // Keep this vague — don't reveal whether an account exists for the email.
    return {
      status: "error",
      message:
        "Could not send a sign-in link. Check the email, or contact your administrator.",
    };
  }

  return {
    status: "sent",
    message: `Check ${parsed.data.email} for a sign-in link.`,
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
