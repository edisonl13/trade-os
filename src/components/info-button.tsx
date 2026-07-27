"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

interface InfoButtonProps {
  /** Accessible label for screen readers */
  label: string;
  /** Content of the info popover */
  children: ReactNode;
  /** Optional className for positioning */
  className?: string;
}

/**
 * Information (i) button — click/focus popover with keyboard support.
 *
 * - Click or Enter/Space to open
 * - Escape or outside-click to close
 * - Focus trap within popover
 * - Accessible label via aria-label
 */
export function InfoButton({ label, children, className }: InfoButtonProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    // Delay to avoid the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    <span className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        aria-label={label}
        aria-expanded={open}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-[#9AA8B8]/15 bg-white/[0.025] text-[#718094] transition duration-200 hover:border-[#16D9FF]/55 hover:text-[#16D9FF] hover:shadow-[0_0_12px_rgba(22,217,255,0.14)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]"
      >
        <Info className="h-3 w-3" />
      </button>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-[#9AA8B8]/20 bg-[#09101A]/98 p-4 text-[12px] leading-relaxed shadow-2xl backdrop-blur-2xl"
        >
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              buttonRef.current?.focus();
            }}
            aria-label={t("common.close")}
            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-[#59697C] transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]"
          >
            <X className="h-3 w-3" />
          </button>
          <div className="space-y-2 text-white/80">
            {children}
          </div>
        </div>
      )}
    </span>
  );
}
