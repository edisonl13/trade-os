"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import ConsoleGuard from "./consoleGuard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        <ConsoleGuard />
        {children}
        <Toaster
          position="top-center"
          richColors
          closeButton
          theme="dark"
        />
      </ThemeProvider>
    </SessionProvider>
  );
}
