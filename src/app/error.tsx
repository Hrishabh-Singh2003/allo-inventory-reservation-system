"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCcw, Database } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error globally for debugging
    console.error("Global UI Boundary Caught Error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="bg-destructive/10 text-destructive mb-4 animate-bounce rounded-full p-4">
        <AlertCircle className="h-10 w-10" />
      </div>

      <h2 className="text-foreground text-2xl font-bold tracking-tight sm:text-3xl">
        Database Link Offline
      </h2>

      <p className="text-muted-foreground mt-2 max-w-md text-sm">
        The application failed to connect to your PostgreSQL database. This is usually caused by an
        incorrect, missing, or unpooled connection string in your{" "}
        <span className="bg-secondary text-foreground rounded px-1 py-0.5 font-mono">.env</span>{" "}
        file.
      </p>

      <div className="border-border bg-card my-6 w-full max-w-xl rounded-lg border p-4 text-left">
        <span className="text-muted-foreground mb-2 block flex items-center gap-1.5 text-xs font-semibold tracking-wider uppercase">
          <Database className="text-primary h-3.5 w-3.5" />
          Quick Troubleshoot Guide
        </span>
        <ul className="text-muted-foreground list-disc space-y-1.5 pl-4 text-xs">
          <li>
            Ensure <span className="text-foreground font-bold">DATABASE_URL</span> and{" "}
            <span className="text-foreground font-bold">DIRECT_URL</span> are correctly set.
          </li>
          <li>If using Neon, double check that your serverless pooler hasn't suspended.</li>
          <li>
            Run{" "}
            <span className="bg-secondary text-foreground rounded px-1 font-mono">
              npm run db:setup
            </span>{" "}
            inside your terminal to rebuild schema types.
          </li>
        </ul>
      </div>

      <div className="flex gap-4">
        <Button onClick={() => reset()} className="flex items-center gap-1.5">
          <RefreshCcw className="h-4 w-4" />
          Retry Connection
        </Button>
      </div>
    </div>
  );
}
