"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Settings,
  User,
  Wallet,
  Globe,
  LogOut,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Shield,
  CreditCard,
  Bell,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

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
  const [language, setLanguage] = useState("English");
  const [tzSetting, setTzSetting] = useState("UTC");
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [billingEmail, setBillingEmail] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState("Free");
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [userLevel, setUserLevel] = useState<{ level: number; title: string }>({ level: 1, title: "Rookie" });

  const [accountLoaded, setAccountLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("profile");

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
            if (settingsData.locale) setLanguage(settingsData.locale);
            if (settingsData.billingEmail) setBillingEmail(settingsData.billingEmail);
            if (settingsData.subscriptionPlan) setSubscriptionPlan(settingsData.subscriptionPlan);
            setTwoFactorEnabled(Boolean(settingsData.twoFactorEnabled));
          }

          if (levelData) {
            setUserLevel(levelData);
          }

          setAccountLoaded(true);
          setSettingsLoaded(true);
        })
        .catch(() => {
          setAccountLoaded(true);
          setSettingsLoaded(true);
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
        toast.success("Squad account updated successfully");
        return true;
      }

      toast.error(data.error ?? "Update failed");
      return false;
    } catch {
      toast.error("Network error");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveProfile = async () => {
    if (!displayName.trim()) {
      toast.error("Please enter a valid display name.");
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
        toast.success("Profile saved successfully");
        router.refresh();
      } else {
        toast.error(data.error ?? "Failed to save profile");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setProfileSaving(false);
    }
  };

  const saveUserSettings = async () => {
    setSettingsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locale: language,
          billingEmail: billingEmail.trim(),
          subscriptionPlan,
          twoFactorEnabled,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success("Settings updated successfully");
        return true;
      }
      toast.error(data.error ?? "Failed to save settings");
      return false;
    } catch {
      toast.error("Network error");
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
    const success = await saveTradingAccountData({ timezone: tzSetting });
    if (success) {
      toast.success("Region settings saved.");
    }
    setRegionSaving(false);
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
        <p className="label-sports mb-1">System Configuration</p>
        <h1 className="text-3xl font-black heading-sports">Broadcast <span className="brand-gradient-text">Settings</span></h1>
      </motion.div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)} className="w-full">
        <TabsList className="mb-8 bg-white/5 p-1.5 h-auto rounded-2xl border border-white/5 gap-2 overflow-x-auto justify-start">
          {[
            { id: "profile", label: "Profile", icon: User },
            { id: "trading-account", label: "Trading Account", icon: Wallet },
            { id: "language", label: "Region", icon: Globe },
            { id: "security", label: "Security", icon: Shield },
            { id: "billing", label: "Subscription", icon: CreditCard },
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
                          <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-1">Level {userLevel.level} &middot; {userLevel.title} Member</p>
                       </div>
                       <Button variant="outline" className="ml-auto text-[10px] font-black uppercase border-white/5 hover:bg-white/5">Change Avatar</Button>
                    </div>

                    <Separator className="bg-white/5" />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="label-sports ml-1">Official Name</Label>
                        <Input
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="h-12 bg-white/5 border-white/5 rounded-xl font-bold focus:ring-[#3B82F6]"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="label-sports ml-1">Email Address</Label>
                        <Input
                          value={session?.user?.email ?? ""}
                          disabled
                          className="h-12 bg-white/2 border-white/5 rounded-xl font-bold opacity-50"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                       <Button variant="ghost" className="text-[10px] font-black uppercase text-muted-foreground" onClick={handleResetProfile}>Reset</Button>
                       <Button className="brand-gradient text-white px-8 font-black uppercase glow-primary" onClick={saveProfile} disabled={profileSaving}>
                         {profileSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Profile"}
                       </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                   <div className="fifa-card p-6 bg-gradient-to-br from-[#3B82F6]/10 to-transparent border-[#3B82F6]/20">
                      <h3 className="heading-sports text-xs flex items-center gap-2">
                         <Shield className="h-4 w-4 text-[#3B82F6]" />
                         Identity Verified
                      </h3>
                      <p className="text-[10px] font-medium text-muted-foreground/60 mt-4 leading-relaxed">
                         Your account is protected by industry standard encryption. Your trading data is private and only visible to you.
                      </p>
                   </div>

                   <Button 
                    variant="outline" 
                    className="w-full h-14 border-red-500/20 text-red-500 font-black uppercase hover:bg-red-500/10 hover:border-red-500/40 rounded-2xl"
                    onClick={() => signOut()}
                   >
                     <LogOut className="mr-2 h-4 w-4" />
                     Terminate Session
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
                        <h3 className="heading-sports text-lg">Squad <span className="text-[#06B6D4]">Capital</span></h3>
                        <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">Define your operational bankroll</p>
                     </div>
                  </div>

                  {!accountLoaded ? (
                    <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-[#06B6D4]" /></div>
                  ) : (
                    <div className="space-y-8">
                       <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">Account Label</Label>
                            <Input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">Primary Broker</Label>
                            <Input value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="e.g. IC MARKETS" className="h-12 bg-white/5 border-white/5 rounded-xl font-bold uppercase placeholder:text-white/10" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">Season Starting Balance</Label>
                            <Input type="number" value={initialBalance} onChange={(e) => setInitialBalance(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold text-[#22C55E]" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">Base Currency</Label>
                            <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} className="h-12 bg-white/5 border-white/5 rounded-xl font-black tracking-widest" />
                          </div>
                          <div className="space-y-2">
                            <Label className="label-sports ml-1">Monthly Profit Target</Label>
                            <Input type="number" value={monthlyProfitTarget} onChange={(e) => setMonthlyProfitTarget(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold text-[#3B82F6]" />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <Label className="label-sports ml-1">Operational Timezone</Label>
                          <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold" />
                          <p className="text-[9px] font-black text-muted-foreground/30 uppercase ml-1">Critical for session intensity mapping (e.g. UTC, New York)</p>
                       </div>

                       <Separator className="bg-white/5" />

                       <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                             <div className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
                             <span className="text-[9px] font-black uppercase text-muted-foreground/60">Live database connection active</span>
                          </div>
                          <Button 
                            className="brand-gradient text-white px-10 h-12 font-black uppercase glow-primary gap-2"
                            onClick={() => saveTradingAccountData()}
                            disabled={saving}
                          >
                            {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Synchronizing...</> : <><CheckCircle2 className="h-4 w-4" /> Apply Changes</>}
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
                       <h3 className="heading-sports text-lg">Global <span className="text-[#F59E0B]">Localization</span></h3>
                       <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">Adapt the broadcast to your region</p>
                    </div>
                 </div>

                  <div className="space-y-6">
                    <div className="space-y-2">
                      <Label className="label-sports ml-1">Broadcast Language</Label>
                      <select
                       value={language}
                       onChange={(e) => setLanguage(e.target.value)}
                       className="h-12 w-full rounded-xl border border-white/5 bg-white/5 px-4 text-sm font-bold text-white"
                      >
                       <option value="English">English</option>
                       <option value="English (UK)">English (UK)</option>
                       <option value="简体中文">简体中文</option>
                       <option value="繁體中文">繁體中文</option>
                       <option value="日本語">日本語</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label className="label-sports ml-1">Display Timezone</Label>
                      <Input value={tzSetting} onChange={(e) => setTzSetting(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold" />
                    </div>
                  </div>

                  <Button className="brand-gradient text-white font-black uppercase glow-primary" onClick={saveRegionSettings} disabled={regionSaving}>
                   {regionSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Update Region Settings"}
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
                    <h3 className="heading-sports text-lg">Security & Two-Factor</h3>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">Add extra protection to your account</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-black">Two-Factor Authentication</p>
                      <p className="text-[10px] text-muted-foreground/50">Enable TOTP-based 2FA for your account.</p>
                    </div>
                    <label className="switch">
                      <input type="checkbox" checked={twoFactorEnabled} onChange={(e) => setTwoFactorEnabled(e.target.checked)} />
                    </label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="brand-gradient text-white font-black uppercase" onClick={saveUserSettings} disabled={settingsSaving}>
                    {settingsSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Security"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </TabsContent>

          {/* BILLING / SUBSCRIPTION */}
          <TabsContent key="billing" value="billing">
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}>
              <div className="max-w-3xl fifa-card p-8 space-y-6">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-xl bg-[#8B5CF6]/10 flex items-center justify-center">
                    <CreditCard className="h-6 w-6 text-[#8B5CF6]" />
                  </div>
                  <div>
                    <h3 className="heading-sports text-lg">Subscription & Billing</h3>
                    <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-0.5">Manage your billing contact and plan</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="label-sports ml-1">Billing Email</Label>
                    <Input value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} className="h-12 bg-white/5 border-white/5 rounded-xl font-bold" />
                  </div>
                  <div className="space-y-2">
                    <Label className="label-sports ml-1">Subscription Plan</Label>
                    <select value={subscriptionPlan} onChange={(e) => setSubscriptionPlan(e.target.value)} className="h-12 w-full rounded-xl border border-white/5 bg-white/5 px-4 text-sm font-bold text-white">
                      <option value="Free">Free</option>
                      <option value="Pro">Pro</option>
                      <option value="Enterprise">Enterprise</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button className="brand-gradient text-white font-black uppercase" onClick={saveUserSettings} disabled={settingsSaving}>
                    {settingsSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving...</> : "Save Billing"}
                  </Button>
                </div>
              </div>
            </motion.div>
          </TabsContent>
      </Tabs>
    </div>
  );
}
