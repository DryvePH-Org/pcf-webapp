import { Wallet } from "lucide-react";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <Wallet className="size-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Petty Cash Fund
        </h1>
        <p className="max-w-md text-sm text-muted-foreground sm:text-base">
          Voucher preparation, approval, release, and replenishment for the
          imprest fund.
        </p>
      </div>
    </main>
  );
}
