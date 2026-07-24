"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { TrendingUp, RefreshCw } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error to console (replace with Sentry or similar in production)
    console.error("[TRADE//OS Error]", {
      message: error.message,
      digest: error.digest,
      time: new Date().toISOString(),
    });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0F0F1A] p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-red-500/5 blur-[120px]" />
      </div>

      <div className="relative text-center space-y-8 max-w-md">
        <div className="flex justify-center">
          <div className="h-20 w-20 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <TrendingUp className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-4xl font-black heading-sports">
            Signal <span className="text-red-400">Interrupted</span>
          </h1>
          <p className="text-muted-foreground text-sm">
            The broadcast encountered an unexpected error. Our team has been notified.
          </p>
          {process.env.NODE_ENV === "development" && (
            <p className="text-[10px] font-mono text-red-400/60 bg-red-500/5 p-3 rounded-lg mt-4">
              {error.message}
            </p>
          )}
        </div>

        <Button
          onClick={reset}
          className="bg-[#2563EB] text-white font-black uppercase glow-primary px-10 h-14 gap-3"
        >
          <RefreshCw className="h-5 w-5" />
          Retry Broadcast
        </Button>
      </div>
    </div>
  );
}
