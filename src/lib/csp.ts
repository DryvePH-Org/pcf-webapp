// Content-Security-Policy: scripts may only run if they carry this request's
// nonce, so an injected <script> or inline handler is refused by the browser.
export function buildCsp(nonce: string, isDev: boolean) {
  const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let supabaseOrigin = "";
  let supabaseSocket = "";
  try {
    const url = new URL(supabase);
    supabaseOrigin = url.origin;
    supabaseSocket = `wss://${url.host}`;
  } catch {
    // Left empty; the policy then allows only same-origin connections.
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(isDev ? ["'unsafe-eval'"] : []),
    ],
    // Tailwind and the toast library set inline styles; styles cannot run code.
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "blob:", "data:", supabaseOrigin].filter(Boolean),
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      supabaseOrigin,
      supabaseSocket,
      ...(isDev ? ["ws:", "http:"] : []),
    ].filter(Boolean),
    "worker-src": ["'self'"],
    "manifest-src": ["'self'"],
    "media-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    ...(isDev ? {} : { "upgrade-insecure-requests": [] }),
  };

  return Object.entries(directives)
    .map(([name, values]) => [name, ...values].join(" "))
    .join("; ");
}
