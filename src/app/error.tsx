"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" />
          </div>
          <CardTitle className="mt-3">Something went wrong</CardTitle>
          <CardDescription>
            Petty Cash Fund ran into a problem loading this page.
            {error.digest ? ` (Reference: ${error.digest})` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => retry()}>
            <RotateCw />
            Try again
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
