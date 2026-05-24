"use client";

import { useEffect } from "react";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Checkout page error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="bg-destructive/10 text-destructive mb-4 rounded-full p-4">
        <AlertTriangle className="h-10 w-10" />
      </div>

      <h2 className="text-foreground text-2xl font-bold tracking-tight">Checkout Unavailable</h2>

      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Something went wrong loading this reservation hold. It may have expired, been released, or
        already confirmed.
      </p>

      <div className="mt-6 flex gap-3">
        <Button variant="outline" onClick={reset}>
          Try Again
        </Button>
        <Link href="/" passHref>
          <Button className="flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Back to Catalog
          </Button>
        </Link>
      </div>
    </div>
  );
}
