"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  BarChart3,
  Calendar,
  ChevronUp,
  Database,
  LayoutDashboard,
  LogOut,
  ScrollText,
  Settings,
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/provider";

function useNavItems(t: (key: string) => string) {
  return [
    { href: "/", label: t("nav.overview"), icon: LayoutDashboard },
    { href: "/trades", label: t("nav.trades"), icon: ScrollText },
    { href: "/analytics", label: t("nav.analytics"), icon: BarChart3 },
    { href: "/calendar", label: t("nav.calendar"), icon: Calendar },
    { separator: true },
    { href: "/import", label: t("nav.import"), icon: Upload },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ] as const;
}

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { t } = useI18n();
  const navItems = useNavItems(t);

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((name) => name[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "TR";

  return (
    <aside className="trade-sidebar fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col border-r border-[#9AA8B8]/10 bg-[linear-gradient(180deg,rgba(7,10,16,0.97),rgba(3,5,10,0.93))] px-5 pb-5 pt-7 backdrop-blur-xl">
      <Link href="/" className="trade-brand mb-10 flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#16D9FF]/25 bg-[#16D9FF]/8 text-[#16D9FF] shadow-[0_0_18px_rgba(22,217,255,0.12)]">
          <TrendingUp className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="trade-sidebar-copy min-w-0">
          <span className="block text-[17px] font-extrabold tracking-[-0.6px] text-white">
            TRADE<span className="text-[#2F6BFF]">//</span>OS
          </span>
          <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.22em] text-[#59697C]">
            {t("common.productCategory")}
          </span>
        </span>
      </Link>

      <p className="trade-sidebar-copy mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#435164]">
        {t("common.workspace")}
      </p>

      <nav className="grid gap-1" aria-label={t("common.navigation")}>
        {navItems.map((item, index) => {
          if ("separator" in item) {
            return <div key={`separator-${index}`} className="my-3 h-px bg-gradient-to-r from-transparent via-[#9AA8B8]/15 to-transparent" />;
          }

          const isActive = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "trade-nav-item group relative flex min-h-11 items-center gap-3 rounded-md px-3 text-[13px] font-bold tracking-[0.01em] transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]/70",
                "before:absolute before:-left-5 before:bottom-2.5 before:top-2.5 before:w-0.5 before:rounded-full before:bg-transparent",
                isActive
                  ? "bg-gradient-to-r from-[#2F6BFF]/15 via-[#2F6BFF]/5 to-transparent text-white before:bg-[#2F6BFF] before:shadow-[0_0_12px_#2F6BFF]"
                  : "text-[#6F7E90] hover:translate-x-0.5 hover:bg-gradient-to-r hover:from-white/5 hover:to-transparent hover:text-[#D7E1EC]"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 transition duration-200",
                  isActive ? "text-[#7DA2FF]" : "text-[#6F7E90] group-hover:text-[#16D9FF] group-hover:drop-shadow-[0_0_7px_rgba(22,217,255,0.35)]"
                )}
                aria-hidden="true"
              />
              <span className="trade-sidebar-copy">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-[#9AA8B8]/10 pt-4">
        <details className="trade-user-dock group relative">
          <summary className="flex min-h-[54px] cursor-pointer list-none items-center gap-3 rounded-lg border border-[#9AA8B8]/10 bg-white/[0.02] p-2.5 transition hover:border-[#9AA8B8]/20 hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16D9FF]/70 [&::-webkit-details-marker]:hidden">
            <Avatar className="h-8 w-8 shrink-0 border border-white/10">
              <AvatarFallback className="bg-white/5 text-[10px] font-extrabold text-white">
                {userInitials}
              </AvatarFallback>
            </Avatar>
            <span className="trade-sidebar-copy min-w-0 flex-1">
              <span className="block truncate text-[12px] font-extrabold text-white">
                {session?.user?.name ?? t("common.trader")}
              </span>
              <span className="mt-0.5 block truncate text-[10px] text-[#20D785]">
                {session?.user?.email ?? t("account.notConfigured")}
              </span>
            </span>
            <ChevronUp className="trade-sidebar-copy h-3.5 w-3.5 text-[#59697C] transition group-open:rotate-180" />
          </summary>

          <div className="trade-user-panel absolute bottom-[68px] left-0 right-0 rounded-lg border border-[#9AA8B8]/15 bg-[#09101A]/98 p-3 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/6 py-2 text-[12px] text-[#9AA8B8]">
              <span className="flex items-center gap-2"><UserRound className="h-3.5 w-3.5 text-[#16D9FF]" />{t("account.account")}</span>
              <span className="max-w-[112px] truncate text-white">{session?.user?.email ?? t("account.notConfigured")}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/6 py-2 text-[12px] text-[#9AA8B8]">
              <span className="flex items-center gap-2"><Database className="h-3.5 w-3.5 text-[#FFB84D]" />{t("account.dataStatus")}</span>
              <Link href="/" className="text-[#FFB84D] hover:text-white">{t("account.viewDashboard")}</Link>
            </div>
            <div className="flex items-center justify-between py-2 text-[12px] text-[#9AA8B8]">
              <span className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-[#D65CFF]" />{t("account.aiUsage")}</span>
              <span className="text-[#D65CFF]">{t("account.onDemand")}</span>
            </div>
            <div className="mt-2 flex gap-2">
              <Link
                href="/settings"
                className="flex-1 rounded-md border border-white/10 px-3 py-2 text-center text-[11px] font-bold text-white transition hover:border-[#16D9FF]/35 hover:text-[#16D9FF]"
              >
                {t("nav.settings")}
              </Link>
              <button
                type="button"
                onClick={() => signOut()}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-[#6F7E90] transition hover:border-[#FF4D64]/35 hover:text-[#FF4D64] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF4D64]"
                aria-label={t("common.signOut")}
                title={t("common.signOut")}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </details>

        <p className="trade-sidebar-copy mt-4 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-[#354253]">
          © 2026 TRADE//OS
        </p>
      </div>
    </aside>
  );
}
