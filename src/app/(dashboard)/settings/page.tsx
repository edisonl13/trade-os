"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/provider";
import { LOCALE_LABELS, type Locale } from "@/lib/i18n/dictionary";
import { COMMON_TIMEZONES } from "@/lib/timezone";
import {
  User,
  Wallet,
  Globe,
  LogOut,
  Loader2,
  CheckCircle2,
  Shield,
  CreditCard,
  Check,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { motion } from "framer-motion";

const CURRENCIES = [
  { value: "USD", label: "USD · US Dollar" },
  { value: "EUR", label: "EUR · Euro" },
  { value: "CNY", label: "CNY · Chinese Yuan" },
  { value: "HKD", label: "HKD · Hong Kong Dollar" },
  { value: "SGD", label: "SGD · Singapore Dollar" },
  { value: "MYR", label: "MYR · Malaysian Ringgit" },
] as const;

const selectTriggerClass =
  "h-12 w-full rounded-xl border border-[#9AA8B8]/15 bg-[#101720] px-4 text-sm font-bold text-white hover:border-[#16D9FF]/35 focus-visible:border-[#16D9FF]/60 focus-visible:ring-[#16D9FF]/15";
const selectContentClass =
  "max-h-72 rounded-xl border border-[#16D9FF]/20 bg-[#0B1018] p-1 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55),0_0_20px_rgba(22,217,255,0.08)]";
const selectItemClass =
  "min-h-10 rounded-lg px-3 text-[12px] font-bold text-[#B6C1CE] focus:bg-[#16D9FF]/10 focus:text-white data-[selected]:text-[#20D785]";

/* ──────────────────────────────
   Trading Account Interface
   ────────────────────────────── */

interface TradingAccount {
  id: string;
  label: string;
  broker: string;
  currency: string;
  initialBalance: number;
  monthlyProfitTarget: number;
  timezone: string;
}

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [regionSaving, setRegionSaving] = useState(false);

  // Profile info
  const [displayName, setDisplayName] = useState("");

  // Trading account
  const [accountLabel, setAccountLabel] = useState("Default");
  const [broker, setBroker] = useState("");
  const [initialBalance, setInitialBalance] = useState("10000");
  const [currency, setCurrency] = useState("USD");
  const [monthlyProfitTarget, setMonthlyProfitTarget] = useState("0");
  const [timezone, setTimezone] = useState("UTC");
  const [accountId, setAccountId] = useState<string | null>(null);

  // Language & Region
  const [tzSetting, setTzSetting] = useState("UTC");
  const [billingEmail, setBillingEmail] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("Free");
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [userLevel, setUserLevel] = useState<{ level: number; title: string }>({ level: 1, title: "Rookie" });

  const [accountLoaded, setAccountLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("profile");

  const plans = [
    {
      id: "Free",
      name: t("plans.free"),
      audience: t("plans.freeAudience"),
      outcome: t("plans.freeOutcome"),
      monthly: 0,
      annual: 0,
      accent: "#9AA8B8",
      features: [
        t("plans.freeFeature1"),
        t("plans.freeFeature2"),
        t("plans.freeFeature3"),
        t("plans.freeFeature4"),
      ],
    },
    {
      id: "Basic",
      name: t("plans.basic"),
      audience: t("plans.basicAudience"),
      outcome: t("plans.basicOutcome"),
      monthly: 12,
      annual: 120,
      accent: "#16D9FF",
      features: [
        t("plans.basicFeature1"),
        t("plans.basicFeature2"),
        t("plans.basicFeature3"),
        t("plans.basicFeature4"),
      ],
    },
    {
      id: "Professional",
      name: t("plans.professional"),
      audience: t("plans.proAudience"),
      outcome: t("plans.proOutcome"),
      monthly: 24,
      annual: 240,
      accent: "#D65CFF",
      features: [
        t("plans.proFeature1"),
        t("plans.proFeature2"),
        t("plans.proFeature3"),
        t("plans.proFeature4"),
      ],
    },
  ] as const;

  const comparisonRows = [
    { label: t("plans.compareAccounts"), values: ["1", "3", "10"] },
    { label: t("plans.compareJournal"), values: [t("plans.included"), t("plans.included"), t("plans.included")] },
    { label: t("plans.compareAnalytics"), values: [t("plans.core"), t("plans.full"), t("plans.full")] },
    { label: t("plans.compareImage"), values: [`5 / ${t("plans.month")}`, `50 / ${t("plans.month")}`, `200 / ${t("plans.month")}`] },
    { label: t("plans.compareReview"), values: ["—", t("plans.weekly"), t("plans.weeklyMonthly")] },
    { label: t("plans.compareStrategies"), values: ["1", "5", t("plans.unlimited")] },
    { label: t("plans.compareDrift"), values: ["—", "—", t("plans.included")] },
    { label: t("plans.compareExport"), values: [t("plans.included"), t("plans.included"), t("plans.included")] },
  ];

  /* ──────────────────────────────
     Fetch current settings
     ────────────────────────────── */

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status === "authenticated") {
      Promise.all([
        fetch("/api/trading-account").then((res) => res.ok ? res.json() : null),
        fetch("/api/settings").then((res) => res.ok ? res.json() : null),
        fetch("/api/analytics?type=level").then((res) => res.ok ? res.json() : null),
      ])
        .then(([accountData, settingsData, levelData]) => {
          if (accountData) {
            setAccountId(accountData.id);
            setAccountLabel(accountData.label);
            setBroker(accountData.broker ?? "");
            setCurrency(accountData.currency);
            setInitialBalance(String(accountData.initialBalance));
            setMonthlyProfitTarget(String(accountData.monthlyProfitTarget ?? 0));
            setTimezone(accountData.timezone);
            setTzSetting(accountData.timezone);
          }

          if (settingsData) {
            if (settingsData.locale) setLocale(settingsData.locale as Locale);
            if (settingsData.billingEmail) setBillingEmail(settingsData.billingEmail);
            if (settingsData.subscriptionPlan) setSubscriptionPlan(settingsData.subscriptionPlan);
          }

          if (levelData) {
            setUserLevel(levelData);
          }

          setAccountLoaded(true);
        })
        .catch(() => {
          setAccountLoaded(true);
        });

      if (session?.user?.name) setDisplayName(session.user.name);
      setLoading(false);
    }
  }, [status, router, session]);

  const buildAccountPayload = (override?: { timezone?: string }) => ({
    id: accountId,
    label: accountLabel,
    broker,
    currency,
    initialBalance: parseFloat(initialBalance) || 0,
    monthlyProfitTarget: parseFloat(monthlyProfitTarget) || 0,
    timezone: override?.timezone ?? timezone,
  });

  const saveTradingAccountData = async (override?: { timezone?: string }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/trading-account", {
        method: accountId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildAccountPayload(override)),
      });

      const data = await res.json();
      if (res.ok) {
        setAccountId(data.id);
        if (override?.timezone) setTimezone(override.timezone);
        toast.success(t("settings.accountUpdated"));
        return true;
      }

      toast.error(data.error ?? t("error.generic"));
      return false;
    } catch {
      toast.error(t("settings.networkError"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!displayName.trim()) {
      toast.error(t("settings.invalidName"));
      return;
    }

    setProfileSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: displayName.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(t("settings.profileSaved"));
        router.refresh();
      } else {
        toast.error(data.error ?? t("error.generic"));
      }
    } catch {
      toast.error(t("settings.networkError"));
    } finally {
      setProfileSaving(false);
    }
  };

  const saveUserSettings = async (overrides?: { locale?: Locale; billingEmail?: string }) => {
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: overrides?.locale ?? locale,
          billingEmail: overrides?.billingEmail ?? billingEmail.trim(),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        return true;
      }
      toast.error(data.error ?? t("error.generic"));
      return false;
    } catch {
      toast.error(t("settings.networkError"));
      return false;
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleResetProfile = () => {
    setDisplayName(session?.user?.name ?? "");
  };

  const saveRegionSettings = async () => {
    setRegionSaving(true);
    try {
      const [accSuccess, setSuccess] = await Promise.all([
        saveTradingAccountData({ timezone: tzSetting }),
        saveUserSettings({ locale })
      ]);
      
      if (accSuccess && setSuccess) {
        toast.success(t("settings.regionUpdated"));
      }
    } finally {
      setRegionSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F0F1A]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#6366F1] border-t-transparent glow-primary" />
      </div>
    );
  }

  return (
    <div className="page-container">
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <p className="label-sports mb-1">{t("common.systemConfiguration")}</p>
        <h1 className="text-3xl font-black heading-sports">{t("settings.title")}</h1>
      </motion.div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)} className="w-full">
        <TabsList className="mb-8 bg-white/5 p-1.5 h-auto rounded-2xl border border-white/5 gap-2 overflow-x-auto justify-start">
          {[
            { id: "profile", label: t("settings.profile"), icon: User },
            { id: "trading-account", label: t("settings.tradingAccount"), icon: Wallet },
            { id: "language", label: t("settings.region"), icon: Globe },
            { id: "security", label: t("settings.security"), icon: Shield },
            { id: "billing", label: t("settings.subscription"), icon: CreditCard },
          ].map((tab) => (
            <TabsTrigger 
              key={tab.id}
              value={tab.id} 
              className="rounded-xl px-6 py-3 text-[10px] font-black uppercase tracking-widest data-[state=active]:bg-[#3B82F6] data-[state=active]:text-white data-[state=active]:glow-primary transition-all gap-2"
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        
          {/* PROFILE */}
          <TabsContent key="profile" value="profile">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="fifa-card p-8 space-y-8">
                    <div className="flex items-center gap-6">
                       <div className="h-20 w-20 rounded-full brand-gradient p-1">
                          <div className="h-full w-full rounded-full bg-[#0F0F1A] flex items-center justify-center">
                             <User className="h-10 w-10 text-[#3B82F6]" />
                          </div>
                       </div>
                       <div>
                          <h3 className="heading-sports text-xl">{session?.user?.name}</h3>
                          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-1">
                            {t("settings.level")} {userLevel.level} &middot; {t(`level.${userLevel.title}`)} {t("settings.member")}
                          </p>
                       </div>
                       <Button variant="outline" className="ml-auto text-[10px] font-black uppercase border-white/5 hover:bg-white/5">{t("settings.changeAvatar")}</Button>
                    </div>

                    <Separator className="bg-white/5" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="label-sports ml-1">{t("settings.officialName")}</Label>
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="h-12 bg-white/5 border-white/5 rounded-xl font-bold focus:ring-[#3B82F6]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="label-sports ml-1">{t("settings.email")}</Label>
                        <Input
                          value={session?.user?.email ?? ""}
                          disabled
                          className="h-12 bg-white/2 border-white/5 rounded-xl font-bold opacity-50"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                       <Button variant="ghost" className="text-[10px] font-black uppercase text-muted-foreground" onClick={handleResetProfile}>{t("settings.reset")}</Button>
                       <Button className="brand-gradient text-white px-8 font-black uppercase glow-primary" onClick={saveProfile} disabled={profileSaving}>
                         {profileSaving ? <><Loader2 className="h-4 w-4 animate-spin" />...</> : t("settings.save")}
                       </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                   <div className="fifa-card p-6 bg-gradient-to-br from-[#3B82F6]/10 to-transparent border-[#3B82F6]/20">
                      <h3 className="heading-sports text-xs flex items-center gap-2">
                         <Shield className="h-4 w-4 text-[#3B82F6]" />
                         {t("settings.identityVerified")}
                      </h3>
                      <p className="text-[10px] font-medium text-muted-foreground/60 mt-4 leading-relaxed">
                         {t("settings.identityDesc")}
                      </p>
                   </div>

                   <Button 
                    variant="outline" 
                    className="w-full h-14 border-red-500/20 text-red-500 font-black uppercase hover:bg-red-500/10 hover:border-red-500/40 rounded-2xl"
                    onClick={() => signOut()}
                   >
                     <LogOut className="mr-2 h-4 w-4" />
                     {t("settings.terminate")}
                   </Button>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* TRADING ACCOUNT */}
          <TabsContent key="trading-account" value="trading-account">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="max-w-3xl space-y-6">
                <div className="fifa-card p-8">
                  <div className="flex items-center gap-4 mb-8">
                     <div className="h-12 w-12 rounded-xl bg-[#06B6D4]/10 flex items-center justify-center">
                        <Wallet className="h-6 w-6 text-[#06B6D4]" />
                     </div>
                     <div>
                        <h3 className="heading-sports text-lg">{t("settings.tradingAccountLabel")}</h3>
                        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">{t("settings.capitalDesc")}</p>
                     </div>
                  </div>

                  {!accountLoaded ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#06B6D4]" /></div>
                  ) : (
                    <div className="space-y-8">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">{t("settings.accountLabel")}</Label>
                            <Input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">{t("settings.broker")}</Label>
                            <Input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. IC MARKETS" className="h-12 bg-white/5 border-white/5 rounded-xl font-bold uppercase placeholder:text-white/10" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">{t("settings.balance")}</Label>
                            <Input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold text-[#22C55E]" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">{t("settings.currency")}</Label>
                            <Select value={currency} onValueChange={(value) => setCurrency(value ?? "USD")}>
                              <SelectTrigger className={selectTriggerClass}>
                                <SelectValue>
                                  {CURRENCIES.find((item) => item.value === currency)?.label ?? currency}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent align="start" className={selectContentClass}>
                                {CURRENCIES.map((item) => (
                                  <SelectItem key={item.value} value={item.value} className={selectItemClass}>
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">{t("settings.monthlyTarget")}</Label>
                            <Input type="number" value={monthlyProfitTarget} onChange={(e) => setMonthlyProfitTarget(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold text-[#3B82F6]" />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="label-sports ml-1">{t("settings.timezone")}</Label>
                          <Select value={timezone} onValueChange={(value) => setTimezone(value ?? "UTC")}>
                            <SelectTrigger className={selectTriggerClass}>
                              <SelectValue>{timezone.replaceAll("_", " ")}</SelectValue>
                            </SelectTrigger>
                            <SelectContent align="start" className={selectContentClass}>
                              {COMMON_TIMEZONES.map((tz) => (
                                <SelectItem key={tz} value={tz} className={selectItemClass}>
                                  {tz.replaceAll("_", " ")}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="text-[9px] font-black text-muted-foreground/30 uppercase ml-1">{t("settings.timezoneDesc")}</p>
                       </div>

                       <Separator className="bg-white/5" />

                       <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
                             <span className="text-[9px] font-black uppercase text-muted-foreground/60">{t("settings.databaseActive")}</span>
                          </div>
                          <Button 
                            className="brand-gradient text-white px-10 h-12 font-black uppercase glow-primary gap-2"
                            onClick={() => saveTradingAccountData()}
                            disabled={saving}
                          >
                            {saving ? <><Loader2 className="h-4 w-4 animate-spin" />...</> : <><CheckCircle2 className="h-4 w-4" /> {t("settings.apply")}</>}
                          </Button>
                       </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* LANGUAGE & REGION */}
          <TabsContent key="language" value="language">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="max-w-3xl fifa-card p-8 space-y-8">
                 <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-[#F59E0B]/10 flex items-center justify-center">
                       <Globe className="h-6 w-6 text-[#F59E0B]" />
                    </div>
                    <div>
                       <h3 className="heading-sports text-lg">{t("settings.globalLocalization")}</h3>
                       <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">{t("settings.localizationDesc")}</p>
                    </div>
                 </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="label-sports ml-1">{t("settings.language")}</Label>
                      <Select value={locale} onValueChange={(value) => setLocale((value ?? "en-US") as Locale)}>
                        <SelectTrigger className={selectTriggerClass}>
                          <SelectValue>{LOCALE_LABELS[locale]}</SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" className={selectContentClass}>
                          {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([value, label]) => (
                            <SelectItem key={value} value={value} className={selectItemClass}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="label-sports ml-1">{t("settings.displayTz")}</Label>
                      <Select value={tzSetting} onValueChange={(value) => setTzSetting(value ?? "UTC")}>
                        <SelectTrigger className={selectTriggerClass}>
                          <SelectValue>{tzSetting.replaceAll("_", " ")}</SelectValue>
                        </SelectTrigger>
                        <SelectContent align="start" className={selectContentClass}>
                          {COMMON_TIMEZONES.map((tz) => (
                            <SelectItem key={tz} value={tz} className={selectItemClass}>
                              {tz.replaceAll("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <Button className="brand-gradient text-white font-black uppercase glow-primary" onClick={saveRegionSettings} disabled={regionSaving}>
                   {regionSaving ? <><Loader2 className="h-4 w-4 animate-spin" />...</> : t("settings.updateRegion")}
                  </Button>
              </div>
            </motion.div>
          </TabsContent>

          {/* SECURITY */}
          <TabsContent key="security" value="security">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="max-w-3xl fifa-card p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#EF4444]/10 flex items-center justify-center">
                    <Shield className="h-6 w-6 text-[#EF4444]" />
                  </div>
                  <div>
                    <h3 className="heading-sports text-lg">{t("settings.securityTitle")}</h3>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">{t("settings.securityDesc")}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black">{t("settings.twoFactor")}</p>
                      <p className="text-[10px] text-muted-foreground/50">{t("settings.twoFactorDesc")}</p>
                    </div>
                    <div className="h-9 px-4 rounded-xl bg-white/5 border border-white/5 flex items-center text-[9px] font-black uppercase text-muted-foreground/40">
                      {t("settings.comingSoon")}
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="brand-gradient text-white font-black uppercase" disabled>
                    {t("settings.comingSoon")}
                  </Button>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* BILLING / SUBSCRIPTION */}
          <TabsContent key="billing" value="billing">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="max-w-6xl space-y-8">
                <div className="fifa-card overflow-hidden">
                  <div className="flex flex-col gap-5 border-b border-[#9AA8B8]/10 p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#D65CFF]/10">
                        <CreditCard className="h-6 w-6 text-[#D65CFF]" />
                      </div>
                      <div>
                        <h3 className="heading-sports text-lg">{t("settings.billingTitle")}</h3>
                        <p className="mt-1 text-[11px] font-bold text-[#718094]">{t("plans.packagingDesc")}</p>
                      </div>
                    </div>

                    <div className="inline-flex w-fit rounded-xl border border-[#9AA8B8]/15 bg-[#070A10] p-1">
                      <button
                        type="button"
                        onClick={() => setBillingCycle("monthly")}
                        className={`rounded-lg px-4 py-2 text-[11px] font-extrabold transition ${billingCycle === "monthly" ? "bg-[#16D9FF]/12 text-[#16D9FF]" : "text-[#718094] hover:text-white"}`}
                      >
                        {t("plans.monthly")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setBillingCycle("annual")}
                        className={`rounded-lg px-4 py-2 text-[11px] font-extrabold transition ${billingCycle === "annual" ? "bg-[#20D785]/12 text-[#20D785]" : "text-[#718094] hover:text-white"}`}
                      >
                        {t("plans.annual")} · {t("plans.saveTwoMonths")}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 border-b border-[#FFB84D]/15 bg-[#FFB84D]/[0.035] px-6 py-4 text-[11px] leading-5 text-[#A9B5C4]">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB84D]" />
                    <p>
                      <strong className="text-[#FFB84D]">{t("plans.previewLabel")}</strong>{" "}
                      {t("plans.previewDesc")}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-px bg-[#9AA8B8]/10 lg:grid-cols-3">
                    {plans.map((plan) => {
                      const current = subscriptionPlan.toLowerCase() === plan.id.toLowerCase();
                      const displayedPrice = billingCycle === "annual" ? plan.annual / 12 : plan.monthly;
                      return (
                        <article key={plan.id} className="relative bg-[#070A10] p-6">
                          {plan.id === "Basic" && (
                            <span className="absolute right-5 top-5 rounded-full border border-[#16D9FF]/25 bg-[#16D9FF]/8 px-2.5 py-1 text-[9px] font-extrabold text-[#16D9FF]">
                              {t("plans.recommended")}
                            </span>
                          )}
                          <p className="text-[10px] font-extrabold uppercase tracking-[0.12em]" style={{ color: plan.accent }}>
                            {plan.name}
                          </p>
                          <p className="mt-2 min-h-5 text-[11px] font-bold text-[#9AA8B8]">{plan.audience}</p>
                          <div className="mt-5 flex items-end gap-1">
                            <strong className="font-data text-[34px] tracking-[-0.04em] text-white">
                              ${displayedPrice % 1 === 0 ? displayedPrice : displayedPrice.toFixed(2)}
                            </strong>
                            <span className="pb-1 text-[11px] text-[#718094]">/ {t("plans.month")}</span>
                          </div>
                          {billingCycle === "annual" && plan.annual > 0 && (
                            <p className="mt-1 text-[10px] text-[#59697C]">${plan.annual} {t("plans.billedAnnually")}</p>
                          )}
                          <p className="mt-5 min-h-12 text-[12px] leading-5 text-[#B6C1CE]">{plan.outcome}</p>
                          <ul className="mt-5 space-y-3">
                            {plan.features.map((feature) => (
                              <li key={feature} className="flex gap-2 text-[11px] leading-4 text-[#8F9CAD]">
                                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: plan.accent }} />
                                {feature}
                              </li>
                            ))}
                          </ul>
                          <div
                            className="mt-6 flex h-10 items-center justify-center rounded-lg border text-[10px] font-extrabold"
                            style={{
                              borderColor: `${plan.accent}38`,
                              color: current ? "#20D785" : plan.accent,
                              backgroundColor: `${plan.accent}0D`,
                            }}
                          >
                            {current ? t("plans.current") : t("plans.notAvailable")}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <div className="border-t border-[#9AA8B8]/10 p-6">
                    <div className="mb-4 flex items-end justify-between gap-4">
                      <div>
                        <h4 className="text-[15px] font-extrabold text-white">{t("plans.compareTitle")}</h4>
                        <p className="mt-1 text-[11px] text-[#718094]">{t("plans.compareDesc")}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#9AA8B8]/10">
                      <div className="min-w-[660px]">
                        <div className="grid grid-cols-[1.5fr_repeat(3,1fr)] border-b border-[#9AA8B8]/10 bg-[#101720] px-4 py-3 text-[10px] font-extrabold text-[#718094]">
                          <span>{t("plans.capability")}</span>
                          <span>{t("plans.free")}</span>
                          <span className="text-[#16D9FF]">{t("plans.basic")}</span>
                          <span className="text-[#D65CFF]">{t("plans.professional")}</span>
                        </div>
                        {comparisonRows.map((row) => (
                          <div key={row.label} className="grid grid-cols-[1.5fr_repeat(3,1fr)] border-b border-[#9AA8B8]/8 px-4 py-3 text-[11px] last:border-b-0">
                            <span className="font-bold text-[#B6C1CE]">{row.label}</span>
                            {row.values.map((value, index) => (
                              <span key={`${row.label}-${index}`} className={index === 0 ? "text-[#7E8C9E]" : index === 1 ? "text-[#A7EFFF]" : "text-[#E3B5FF]"}>
                                {value}
                              </span>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 border-t border-[#9AA8B8]/10 p-6 md:grid-cols-[1fr_auto] md:items-end">
                    <div className="space-y-2">
                      <Label className="label-sports ml-1">{t("settings.billingEmail")}</Label>
                      <Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="h-12 max-w-md rounded-xl border-[#9AA8B8]/15 bg-[#101720] font-bold" />
                    </div>
                    <Button className="brand-gradient h-12 px-7 font-black uppercase text-white" onClick={() => saveUserSettings({ billingEmail: billingEmail.trim() })} disabled={settingsSaving}>
                      {settingsSaving ? <><Loader2 className="h-4 w-4 animate-spin" />...</> : t("settings.saveBilling")}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </TabsContent>
      </Tabs>
    </div>
  );
}
