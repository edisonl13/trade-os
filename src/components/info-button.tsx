"use client";

import { useState, useRef, useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface InfoButtonProps {
  /** Accessible label for screen readers */
  label: string;
  /** Content of the info popover */
  children: ReactNode;
  /** Optional className for positioning */
  className?: string;
}

/**
 * Information (i) button with a viewport-aware, non-modal popover.
 *
 * - Click or Enter/Space to open
 * - Click the active green i, press Escape, or click outside to close
 * - Rendered through a portal so dashboard containers cannot clip it
 * - Accessible label via aria-label
 */
export function InfoButton({ label, children, className }: InfoButtonProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 12, top: 12, width: 280 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const instanceId = useId();

  useEffect(() => {
    const closeOtherPopover = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail !== instanceId) setOpen(false);
    };
    window.addEventListener("trade-os:info-open", closeOtherPopover);
    return () => window.removeEventListener("trade-os:info-open", closeOtherPopover);
  }, [instanceId]);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const button = buttonRef.current;
      if (!button) return;

      const viewportPadding = 12;
      const gap = 8;
      const rect = button.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - viewportPadding * 2);
      const measuredHeight = popoverRef.current?.offsetHeight ?? 170;
      const left = Math.min(
        window.innerWidth - viewportPadding - width,
        Math.max(viewportPadding, rect.right - width)
      );
      const fitsBelow = rect.bottom + gap + measuredHeight <= window.innerHeight - viewportPadding;
      const top = fitsBelow
        ? rect.bottom + gap
        : Math.max(viewportPadding, rect.top - gap - measuredHeight);

      setPosition({ left, top, width });
    };

    updatePosition();
    const frame = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

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

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next) {
        window.dispatchEvent(new CustomEvent("trade-os:info-open", { detail: instanceId }));
      }
      return next;
    });
  };

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
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-full border transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#20D785]",
          open
            ? "border-[#20D785]/70 bg-[#20D785]/10 text-[#20D785] shadow-[0_0_14px_rgba(32,215,133,0.22)]"
            : "border-[#9AA8B8]/15 bg-white/[0.025] text-[#718094] hover:border-[#16D9FF]/55 hover:text-[#16D9FF]"
        )}
      >
        <Info className="h-3 w-3" />
      </button>

      {open && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={label}
          style={{ left: position.left, top: position.top, width: position.width }}
          className="fixed z-[100] max-h-[min(260px,calc(100vh-24px))] overflow-y-auto rounded-md border border-[#16D9FF]/25 bg-[rgba(3,5,10,0.66)] p-3 text-[11px] leading-[1.45] shadow-[0_12px_36px_rgba(0,0,0,0.32),0_0_18px_rgba(22,217,255,0.08)]"
        >
          <div className="space-y-1.5 text-white/85">
            {children}
          </div>
        </div>,
        document.body
      )}
    </span>
  );
}
