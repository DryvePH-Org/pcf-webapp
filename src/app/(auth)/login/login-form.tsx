"use client";

import { useActionState } from "react";
import { Loader2, Mail } from "lucide-react";

import { requestMagicLink, type MagicLinkState } from "@/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const initialState: MagicLinkState = { status: "idle", message: null };

export function LoginForm({ initialError }: { initialError?: string | null }) {
  const startState: MagicLinkState = initialError
    ? { status: "error", message: initialError }
    : initialState;
  const [state, formAction, pending] = useActionState(
    requestMagicLink,
    startState,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          required
          className="h-10"
        />
      </div>

      {state.message ? (
        <Alert variant={state.status === "error" ? "destructive" : "default"}>
          <AlertDescription
            className={cn(
              state.status === "sent" &&
                "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {state.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" />
            Sending link...
          </>
        ) : (
          <>
            <Mail />
            Send sign-in link
          </>
        )}
      </Button>
    </form>
  );
}
