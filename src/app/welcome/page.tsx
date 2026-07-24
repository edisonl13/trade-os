"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { TrendingUp, Upload, ArrowRight, Eye, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";

export default function WelcomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  if (status === "loading" || !session) return null;

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/demo", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSeeded(true);
        toast.success(`Demo ready: ${data.count} trades loaded`);
        setTimeout(() => router.push("/"), 800);
      } else {
        toast.error(data.error ?? "Demo seed failed");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-primary/5 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-accent/5 blur-[120px]" />
      </div>

      <Card className="relative w-full max-w-lg border-[--card-border-glow] bg-[--card-glass] backdrop-blur-xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#2563EB]">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
          </div>
          <CardTitle className="text-2xl font-black tracking-tight text-white">
            Welcome to TRADE<span className="text-[#2563EB]">//</span>OS
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            Your intelligence journal is ready. Pick how you want to start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Option A: Demo Data */}
          <button
            onClick={handleSeedDemo}
            disabled={seeding || seeded}
            className="w-full text-left flex items-start gap-4 rounded-xl border border-[#2563EB]/30 bg-[#2563EB]/5 p-5 transition-all hover:bg-[#2563EB]/10 hover:border-[#2563EB]/50 group disabled:opacity-50"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2563EB]/10 text-[#2563EB] group-hover:scale-110 transition-transform">
              {seeded ? <CheckCircle2 className="h-5 w-5 text-[#22C55E]" /> : seeding ? <Loader2 className="h-5 w-5 animate-spin" /> : <Eye className="h-5 w-5" />}
            </div>
            <div className="flex-1">
              <h3 className="font-black uppercase text-sm text-white">Instant Demo</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Load 30 pre-built demo trades and explore the full dashboard immediately. No data required.
              </p>
            </div>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4">
            <Separator className="flex-1 bg-white/5" />
            <span className="text-[9px] font-black uppercase text-muted-foreground/30 tracking-widest">or</span>
            <Separator className="flex-1 bg-white/5" />
          </div>

          {/* Option B: Import Real Data */}
          <Link href="/import" className="block">
            <div className="flex items-start gap-4 rounded-xl border border-white/10 bg-white/5 p-5 transition-all hover:bg-white/10 hover:border-white/20 group">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#06B6D4]/10 text-[#06B6D4] group-hover:scale-110 transition-transform">
                <Upload className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-black uppercase text-sm text-white">Import Your Data</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload broker CSV/Excel exports or paste trade screenshots. AI extracts everything automatically.
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground/30 mt-1 group-hover:text-[#06B6D4] transition-colors" />
            </div>
          </Link>

          {/* Continue to Dashboard (after demo seed) */}
          {seeded && (
            <Button className="w-full h-12 bg-[#22C55E] text-white font-black uppercase glow-primary" onClick={() => router.push("/")}>
              <Eye className="h-4 w-4 mr-2" /> View Dashboard
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
