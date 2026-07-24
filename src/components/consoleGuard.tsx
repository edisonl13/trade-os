"use client";

import { useEffect } from "react";

export default function ConsoleGuard() {
  useEffect(() => {
    const origError = console.error.bind(console);
    const origWarn = console.warn.bind(console);

    console.error = (...args: any[]) => {
      try {
        const msg = String(args[0] ?? "");
        if (msg.includes("Encountered two children with the same key") || msg.includes("AnimatePresence")) {
          // capture stack for diagnosis
          const stack = new Error().stack;
          origWarn("[ConsoleGuard] Suppressed message:", ...args);
          origWarn("[ConsoleGuard] Stack:", stack);
          return;
        }
      } catch (e) {
        /* ignore */
      }
      origError(...args);
    };

    console.warn = (...args: any[]) => {
      try {
        const msg = String(args[0] ?? "");
        if (msg.includes("AnimatePresence") || msg.includes("Encountered two children with the same key")) {
          const stack = new Error().stack;
          origWarn("[ConsoleGuard] Suppressed warn:", ...args);
          origWarn("[ConsoleGuard] Stack:", stack);
          return;
        }
      } catch (e) {
        /* ignore */
      }
      origWarn(...args);
    };

    return () => {
      // best-effort restore (not perfect across HMR)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      console.error = origError;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      console.warn = origWarn;
    };
  }, []);

  return null;
}
