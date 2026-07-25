"use client";

import { motion } from "framer-motion";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-20 space-y-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-2">Legal</p>
          <h1 className="text-4xl font-black heading-sports">Privacy <span className="text-[#2563EB]">Policy</span></h1>
          <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-2">Last updated: July 2026</p>
        </motion.div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground/80">
          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">1. Data We Collect</h2>
            <p>When you use TRADE//OS, we collect:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account Data</strong> — email address and display name (required for authentication)</li>
              <li><strong>Trading Data</strong> — trade records you import (symbols, prices, P&L, dates)</li>
              <li><strong>Screenshot Data</strong> — images you upload for AI extraction (processed and stored as evidence)</li>
              <li><strong>Usage Data</strong> — page views and feature interactions (anonymized analytics)</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">2. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide and improve the trading journal service</li>
              <li>To process AI-powered trade extraction from screenshots</li>
              <li>To generate performance analytics and insights</li>
              <li>To communicate service updates and support requests</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">3. Data Storage & Security</h2>
            <p>All data is stored encrypted at rest using industry-standard encryption. Trading data is stored on Turso (serverless SQLite) infrastructure. Screenshots are processed temporarily and evidence data is retained for audit purposes.</p>
            <p>We implement appropriate technical measures to protect your data against unauthorized access, alteration, or destruction.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">4. Data Sharing</h2>
            <p>We do not sell, trade, or share your personal data with third parties except:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>AI providers (DeepSeek)</strong> — Screenshots you upload are sent to DeepSeek's API for trade data extraction. DeepSeek's data retention policy is outside our control; we recommend reviewing their terms at <code className="text-[10px] bg-white/5 px-1 py-0.5 rounded">api.deepseek.com</code>. We do not knowingly send images containing personal identification.</li>
              <li><strong>Infrastructure providers</strong> (Vercel, Turso) who process data under their respective data processing agreements.</li>
              <li>If required by law or to protect our legal rights.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access your personal data at any time</li>
              <li>Export your trading data in CSV format</li>
              <li>Delete your account and all associated data</li>
              <li>Withdraw consent for AI processing of screenshots</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">6. Contact</h2>
            <p>For privacy-related inquiries, contact the data controller at the email address provided during account registration.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
