import { redirect } from "next/navigation";
import { ReceiptText, ShieldCheck, Wallet } from "lucide-react";

import { getCurrentUser } from "@/lib/auth";

import { LoginForm } from "./login-form";

const HIGHLIGHTS = [
  { icon: ReceiptText, text: "Receipt-backed petty cash vouchers" },
  { icon: ShieldCheck, text: "Cash released now, reviewed afterwards" },
  { icon: Wallet, text: "Live imprest balance you can verify" },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <section className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex xl:p-14">
        <div
          aria-hidden
          className="absolute -top-24 -right-24 size-80 rounded-full bg-primary-foreground/5 blur-3xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary-foreground/10">
            <Wallet className="size-5" />
          </span>
          <div className="leading-tight">
            <p className="font-heading text-base font-semibold">Petty Cash</p>
            <p className="text-xs text-primary-foreground/60">Fund ledger</p>
          </div>
        </div>

        <div className="relative max-w-md space-y-6">
          <h1 className="font-heading text-4xl leading-tight font-semibold tracking-tight text-balance">
            Every peso accounted for.
          </h1>
          <p className="text-sm leading-relaxed text-primary-foreground/70">
            Record vouchers, approve expenses, and keep the imprest fund
            reconciled, from the office or the field.
          </p>
          <ul className="space-y-3">
            {HIGHLIGHTS.map((highlight) => (
              <li
                key={highlight.text}
                className="flex items-center gap-3 text-sm text-primary-foreground/80"
              >
                <span className="flex size-8 items-center justify-center rounded-lg bg-primary-foreground/10">
                  <highlight.icon className="size-4" />
                </span>
                {highlight.text}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/50">
          Petty cash fund and voucher management
        </p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-sm space-y-8">
          <div className="space-y-6 lg:hidden">
            <div className="flex items-center gap-2.5">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Wallet className="size-4.5" />
              </span>
              <span className="font-heading text-base font-semibold">
                Petty Cash
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="text-sm text-muted-foreground">
              Use the account provided by your administrator.
            </p>
          </div>

          <LoginForm />

          <p className="text-xs text-muted-foreground">
            Accounts are created by an admin. If you need access, contact your
            administrator.
          </p>
        </div>
      </section>
    </div>
  );
}
