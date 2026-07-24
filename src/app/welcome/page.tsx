"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { TrendingUp, Upload, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import Link from "next/link";

export default function WelcomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading" || !session) return null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <Card className="relative w-full max-w-lg border-[--card-border-glow] bg-[--card-glass] backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl brand-gradient-bg">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-white">
            Welcome to TRADE<span className="text-primary">//</span>OS
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Let's set up your trading intelligence journal in 2 minutes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1 */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-background/30 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg brand-gradient-bg text-sm font-bold text-white">
              1
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Import Your Trades</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Upload your broker CSV/Excel export or paste a screenshot. Our AI
                will extract the data automatically.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-background/30 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/20 text-sm font-bold text-primary">
              2
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Review Your Stats</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                See your win rate, equity curve, risk metrics, and performance
                broken down by day, week, month, and year.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-4 rounded-xl border border-border bg-background/30 p-4">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-bold text-emerald-400">
              3
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Improve Your Trading</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Use AI-powered insights to identify patterns, strengths, and
                areas for improvement.
              </p>
            </div>
          </div>

          <Link href="/">
            <Button className="mt-2 h-12 w-full gap-2 brand-gradient-bg text-white hover:opacity-90 text-base">
              <Upload className="h-4 w-4" />
              Start Importing
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
