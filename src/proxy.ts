import type { NextRequest } from "next/server";

import { buildCsp } from "@/lib/csp";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce, process.env.NODE_ENV !== "production");

  // Next reads the nonce from the request's policy and stamps it on its own
  // scripts; the same policy goes back to the browser.
  request.headers.set("content-security-policy", csp);
  request.headers.set("x-nonce", nonce);

  const response = await updateSession(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|sw\\.js|offline\\.html|manifest\\.webmanifest|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
