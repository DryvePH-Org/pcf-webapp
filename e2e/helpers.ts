import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const PRODUCTION_REF = "ltkzkgkvxztjxwqtnklj";
const ANY_ID = "00000000-0000-0000-0000-000000000000";

export type Role = "admin" | "custodian" | "approver" | "accounting";

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (expected in .env.local)`);
  return value;
}

// The authenticated specs wipe vouchers, replenishments and cash counts.
export function assertSafeTarget() {
  if (env("NEXT_PUBLIC_SUPABASE_URL").includes(PRODUCTION_REF)) {
    throw new Error("Refusing to run destructive e2e against production.");
  }
}

export function adminClient() {
  return createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
}

export function testEmail(role: Role) {
  return `${role}@pcf.local`;
}

async function newOtp(email: string) {
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.email_otp) {
    throw new Error(`Could not generate a sign-in code for ${email}`);
  }
  return data.properties.email_otp;
}

// A signed-in client for calling RPCs directly (test setup and assertions).
export async function clientFor(role: Role): Promise<SupabaseClient> {
  const client = createClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const email = testEmail(role);
  const { error } = await client.auth.verifyOtp({
    email,
    token: await newOtp(email),
    type: "email",
  });
  if (error) throw new Error(`Sign-in failed for ${role}: ${error.message}`);
  return client;
}

// Browser cookies in the exact format @supabase/ssr writes, so the app sees a
// normal signed-in session without going through the email step.
export async function cookiesFor(role: Role, baseURL: string) {
  const jar = new Map<string, string>();
  const client = createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll: () => [...jar].map(([name, value]) => ({ name, value })),
        setAll: (list) => {
          for (const cookie of list) jar.set(cookie.name, cookie.value);
        },
      },
    },
  );
  const email = testEmail(role);
  const { error } = await client.auth.verifyOtp({
    email,
    token: await newOtp(email),
    type: "email",
  });
  if (error) throw new Error(`Sign-in failed for ${role}: ${error.message}`);
  return [...jar].map(([name, value]) => ({ name, value, url: baseURL }));
}

export async function cleanTestData() {
  assertSafeTarget();
  const admin = adminClient();
  for (const table of ["vouchers", "replenishments", "cash_counts"]) {
    const { error } = await admin.from(table).delete().neq("id", ANY_ID);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  await admin
    .from("audit_log")
    .delete()
    .in("entity_type", ["vouchers", "replenishments", "cash_counts"]);
  await admin.from("fund_counters").update({ last_no: 0 }).neq("fund_id", ANY_ID);
}
