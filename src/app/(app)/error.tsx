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

export default function AppError({
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
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md">
        <CardHeader>
          <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <TriangleAlert className="size-5" />
          </div>
          <CardTitle className="mt-3">Something went wrong</CardTitle>
          <CardDescription>
            This page ran into a problem loading its data.
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
