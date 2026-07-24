"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  Upload,
  ScrollText,
  Calendar,
  BarChart3,
  Settings,
  LogOut,
  TrendingUp,
  Cpu,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

const navItems = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/import", label: "Import Center", icon: Upload },
  { href: "/trades", label: "Trade Journal", icon: ScrollText },
  { href: "/calendar", label: "Performance Calendar", icon: Calendar },
  { href: "/analytics", label: "Deep Analytics", icon: BarChart3 },
  { href: "/settings", label: "Configuration", icon: Settings },
];

export function Navigation() {
  const pathname = usePathname();
  const { data: session } = useSession();

  const userInitials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "TR";

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-64 flex-col border-r border-white/10 bg-[#080808] shadow-2xl transition-all duration-500 overflow-hidden">
      {/* Logo Section */}
      <div className="relative flex h-28 items-center gap-4 border-b border-white/10 px-7">
        <motion.div 
          whileHover={{ scale: 1.1 }}
          className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#2563EB] shadow-[0_0_15px_rgba(37,99,235,0.3)] cursor-pointer transition-transform"
        >
          <TrendingUp className="h-6 w-6 text-white" />
        </motion.div>
        <div className="flex flex-col">
          <h1 className="text-xl font-black tracking-tighter text-white uppercase leading-none">
            TRADE<span className="text-[#2563EB]">//</span>OS
          </h1>
          <p className="text-[9px] font-black uppercase tracking-[0.35em] text-[#A5B4FC] mt-1">
            Sidebar Navigation
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1.5 px-4 py-10 relative">
        <div className="label-sports px-4 mb-4 opacity-30 text-[8px]">Navigation</div>
        {navItems.map((item, idx) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <Link
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-4 rounded-lg px-4 py-3.5 text-[11px] font-black uppercase tracking-tight transition-all duration-200 overflow-hidden",
                  isActive 
                    ? "text-white bg-white/5" 
                    : "text-muted-foreground/40 hover:text-white hover:bg-white/5"
                )}
              >
                {/* Active Indicator Bar */}
                {isActive && (
                  <motion.div 
                    layoutId="activeBar"
                    className="absolute left-0 top-3 bottom-3 w-1 bg-[#2563EB] rounded-full z-10"
                  />
                )}

                <Icon className={cn(
                  "relative z-10 h-4.5 w-4.5 transition-all duration-200",
                  isActive ? "text-[#2563EB] scale-110" : "group-hover:scale-110 group-hover:text-white"
                )} />
                <span className="relative z-10">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}

        <div className="label-sports px-4 mt-10 mb-4 opacity-30 text-[8px]">Intelligence</div>
        <motion.div
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
        >
          <div className="group relative flex items-center gap-4 rounded-lg px-4 py-3.5 text-[11px] font-black uppercase tracking-tight text-muted-foreground/20 cursor-not-allowed">
            <Cpu className="h-4.5 w-4.5" />
            <span>AI Market Pulse</span>
            <Badge className="absolute right-3 bg-white/5 text-[7px] border-white/5 text-muted-foreground/40 uppercase">Coming Soon</Badge>
          </div>
        </motion.div>
      </nav>

      {/* User Session Footer */}
      <div className="mt-auto p-4 border-t border-white/5">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative group flex items-center gap-3 rounded-xl bg-white/2 p-3.5 border border-white/5 hover:border-white/10 hover:bg-white/5 transition-all duration-300 overflow-hidden"
        >
          <Avatar className="h-9 w-9 border border-white/10 transition-colors">
            <AvatarFallback className="bg-white/5 text-[10px] font-black text-white">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-black text-white truncate uppercase">
              {session?.user?.name ?? "Trader"}
            </p>
            <div className="flex items-center gap-1.5">
               <div className="h-1 w-1 rounded-full bg-[#22C55E]" />
               <p className="text-[8px] font-bold text-[#22C55E] uppercase tracking-wider">
                 Elite Status
               </p>
            </div>
          </div>
          <button
            onClick={() => signOut()}
            className="relative z-10 rounded-lg p-2 text-muted-foreground/30 hover:bg-red-500/10 hover:text-red-400 transition-all"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </motion.div>
        <p className="text-center text-[7px] font-black text-muted-foreground/20 uppercase tracking-[0.3em] mt-4 mb-2">
          &copy; 2026 Trade OS Systems
        </p>
      </div>
    </aside>
  );
}
