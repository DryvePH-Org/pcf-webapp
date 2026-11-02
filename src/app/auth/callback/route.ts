import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", data.user.id)
        .single();

      if (profile?.is_active) {
        return NextResponse.redirect(`${origin}/dashboard`);
      }

      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=inactive`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
