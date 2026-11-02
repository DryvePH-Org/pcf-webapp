"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Mail } from "lucide-react";

import {
  requestSignInCode,
  verifyEmailCode,
  type SignInCodeState,
} from "@/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const idleState: SignInCodeState = { status: "idle", message: null };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_code: "That code is wrong or has expired. Request a new one.",
  inactive: "Your account is inactive. Contact an administrator.",
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sendState, setSendState] = useState<SignInCodeState>(idleState);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const [verifying, startVerifying] = useTransition();

  const sent = sendState.status === "sent";

  function onSendSubmit(formData: FormData) {
    const value = String(formData.get("email") ?? "");
    setEmail(value);
    startSending(async () => {
      const result = await requestSignInCode(idleState, formData);
      setSendState(result);
    });
  }

  function onVerifySubmit(formData: FormData) {
    const token = String(formData.get("token") ?? "");
    setCodeError(null);
    startVerifying(async () => {
      const result = await verifyEmailCode({ email, token });
      if (!result.ok) {
        setCodeError(ERROR_MESSAGES[result.error]);
        return;
      }
      router.push("/dashboard");
    });
  }

  if (sent) {
    return (
      <form action={onVerifySubmit} className="space-y-5">
        <Alert>
          <AlertDescription className="text-emerald-600 dark:text-emerald-400">
            {sendState.message}
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label htmlFor="token">Sign-in code</Label>
          <Input
            id="token"
            name="token"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
            className="h-10"
          />
          <p className="text-xs text-muted-foreground">
            Enter the code from the email. It expires in 1 hour.
          </p>
        </div>

        {codeError ? (
          <Alert variant="destructive">
            <AlertDescription>{codeError}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" className="h-10 w-full" disabled={verifying}>
          {verifying ? (
            <>
              <Loader2 className="animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <KeyRound />
              Verify code
            </>
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          className="h-10 w-full"
          onClick={() => setSendState(idleState)}
        >
          Use a different email
        </Button>
      </form>
    );
  }

  return (
    <form action={onSendSubmit} className="space-y-5">
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

      {sendState.message ? (
        <Alert
          variant={sendState.status === "error" ? "destructive" : "default"}
        >
          <AlertDescription
            className={cn(
              sendState.status === "sent" &&
                "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {sendState.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" className="h-10 w-full" disabled={sending}>
        {sending ? (
          <>
            <Loader2 className="animate-spin" />
            Sending...
          </>
        ) : (
          <>
            <Mail />
            Send sign-in code
          </>
        )}
      </Button>
    </form>
  );
}
