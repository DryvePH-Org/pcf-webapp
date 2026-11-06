"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";

import { signIn } from "@/actions/auth";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES = {
  invalid_credentials: "Unable to sign in. Check your email and password, or contact your administrator.",
  rate_limited: "Too many attempts. Wait a few minutes and try again.",
  unavailable: "Sign-in is temporarily unavailable. Try again in a moment.",
};

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await signIn({
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        });
        if (!result.ok) {
          setError(ERROR_MESSAGES[result.error]);
          return;
        }
        router.replace("/dashboard");
        router.refresh();
      } catch {
        setError(ERROR_MESSAGES.unavailable);
      }
    });
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          maxLength={254}
          autoComplete="username"
          placeholder="name@company.com"
          required
          disabled={pending}
          className="h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          maxLength={128}
          autoComplete="current-password"
          required
          disabled={pending}
          className="h-11"
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {pending ? "Signing in..." : "Sign in"}
      </Button>
    </form>
  );
}
