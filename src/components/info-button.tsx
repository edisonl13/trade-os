"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoButtonProps {
  label: string;
  children: ReactNode;
  className?: string;
}

/**
 * Inline information disclosure.
 *
 * The explanation stays in document flow so it never covers the chart, KPI,
 * sidebar or the next module. Only one disclosure can be open at a time.
 */
export function InfoButton({ label, children, className }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const instanceId = useId();

  useEffect(() => {
    const closeOther = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== instanceId) setOpen(false);
    };
    window.addEventListener("trade-os:info-open", closeOther);
    return () => window.removeEventListener("trade-os:info-open", closeOther);
  }, [instanceId]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.dispatchEvent(
          new CustomEvent("trade-os:info-open", { detail: instanceId })
        );
      }
      return next;
    });
  };

  return (
    <span
      className={cn(
        "inline-grid min-w-0 justify-items-end self-start",
        open && "min-w-[min(300px,78vw)]",
        className
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#20D785]",
          open
            ? "border-[#20D785]/70 bg-[#20D785]/10 text-[#20D785] shadow-[0_0_14px_rgba(32,215,133,0.22)]"
            : "border-[#9AA8B8]/18 bg-white/[0.025] text-[#718094] hover:border-[#16D9FF]/55 hover:text-[#16D9FF]"
        )}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          role="note"
          aria-label={label}
          className="mt-2 w-full rounded-lg border border-[#16D9FF]/20 bg-[#08101A]/88 p-3 text-left text-[12px] leading-[1.55] shadow-[0_10px_24px_rgba(0,0,0,0.18)]"
        >
          <div className="space-y-2 text-white/85">{children}</div>
        </div>
      )}
    </span>
  );
}
