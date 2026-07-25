"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { type Locale, LOCALE_STORAGE_KEY, detectLocale, t } from "./dictionary";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, ...args: string[]) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en-US",
  setLocale: () => {},
  t: (key: string) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en-US");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const restoreLocale = async () => {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY) as Locale | null;
      let resolved = saved || detectLocale();

      try {
        const response = await fetch("/api/settings", { cache: "no-store" });
        if (response.ok) {
          const settings = await response.json() as { locale?: Locale | null };
          if (settings.locale) resolved = settings.locale;
        }
      } catch {
        // Browser preference remains a safe fallback while offline.
      }

      if (!cancelled) {
        setLocaleState(resolved);
        localStorage.setItem(LOCALE_STORAGE_KEY, resolved);
        setMounted(true);
      }
    };

    void restoreLocale();
    return () => {
      cancelled = true;
    };
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const translate = useCallback(
    (key: string, ...args: string[]) => t(locale, key, ...args),
    [locale]
  );

  // Avoid flashing the English fallback before the saved locale is restored.
  if (!mounted) {
    return <div className="min-h-screen bg-background" aria-hidden="true" />;
  }

  return (
    <I18nContext.Provider value={{ locale, setLocale, t: translate }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
