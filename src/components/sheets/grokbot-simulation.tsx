"use client";

import { useEffect, useState } from "react";
import {
  getGrokbotSimulation,
  startGrokbotSimulation,
} from "@/actions/grokbot";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusPill } from "@/components/shared/status-pill";
import { MoneyText } from "@/components/shared/money-text";

type Simulation = Awaited<ReturnType<typeof getGrokbotSimulation>>;
export function GrokbotSimulation({ initial }: { initial: Simulation }) {
  const [result, setResult] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const active = result && ["queued", "running"].includes(result.status);
  useEffect(() => {
    if (!active || result?.expired) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      try {
        const next = await getGrokbotSimulation();
        if (!cancelled) setResult(next);
      } catch {
        if (!cancelled)
          setError("Status refresh failed. Try refreshing again.");
      }
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [active, result?.expired]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Grokbot simulation</CardTitle>
        <CardDescription>
          Test Buying expense encoding, green marker #01, balances and the
          editor audit.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <p className="text-sm">
          The test uses an empty ledger with a <MoneyText value={40000} />{" "}
          opening balance. It temporarily encodes two expenses totaling{" "}
          <MoneyText value={200} /> and a <MoneyText value={1000} />{" "}
          replenishment, then restores the ledger. Audit history is retained.
        </p>
        {result ? (
          <div className="space-y-3" aria-live="polite">
            <StatusPill
              tone={
                result.status === "completed"
                  ? "success"
                  : ["blocked", "failed"].includes(result.status)
                    ? "danger"
                    : "waiting"
              }
            >
              {result.status === "completed"
                ? "Encoding and restoration verified"
                : result.status}
            </StatusPill>
            <p className="break-all font-mono text-xs">{result.id}</p>
            {result.expired && active ? (
              <p role="alert" className="text-sm text-destructive">
                Callback expired. Check the Grokbot run and its saved cells
                before retrying.
              </p>
            ) : null}
            {result.error ? (
              <p role="alert" className="text-sm text-destructive">
                {result.error}
              </p>
            ) : null}
            {result.checks.length ? (
              <ul className="grid gap-2 text-sm sm:grid-cols-2">
                {result.checks.map((check) => (
                  <li key={check.name}>
                    {check.passed ? "✓" : "✕"} {check.name.replaceAll("_", " ")}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending || Boolean(active)}
            onClick={() => setConfirm(true)}
          >
            Run Grokbot simulation
          </Button>
          <Button
            variant="outline"
            disabled={pending}
            onClick={async () => {
              try {
                setResult(await getGrokbotSimulation());
                setError("");
              } catch {
                setError("Could not refresh the simulation status.");
              }
            }}
          >
            Refresh test status
          </Button>
          <a
            className="inline-flex min-h-11 items-center text-sm underline"
            href="https://docs.google.com/spreadsheets/d/1LJCbzcYSUQ0qiB5s_XA4-QkuecXSB-1P45nISZxsrEk/edit?gid=2133354940"
            target="_blank"
            rel="noreferrer"
          >
            Open Grokbot edit audit
          </a>
        </div>
        <ConfirmDialog
          open={confirm}
          onOpenChange={setConfirm}
          title="Run Buying encoding test?"
          description="Grokbot will write labeled test rows, verify them and restore their original cells. The audit tab will retain the test history."
          confirmLabel="Start simulation"
          pending={pending}
          onConfirm={async () => {
            setPending(true);
            setError("");
            try {
              const started = await startGrokbotSimulation();
              if (!started.ok) setError(started.error);
              setResult(await getGrokbotSimulation());
              setConfirm(false);
            } catch {
              setError(
                "Connection interrupted. Refresh test status before retrying.",
              );
            } finally {
              setPending(false);
            }
          }}
        />
      </CardContent>
    </Card>
  );
}
