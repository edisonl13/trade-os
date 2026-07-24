"use client";

import { motion } from "framer-motion";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#0F0F1A] text-white">
      <div className="max-w-3xl mx-auto px-6 py-20 space-y-10">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 mb-2">Legal</p>
          <h1 className="text-4xl font-black heading-sports">Terms of <span className="text-[#2563EB]">Service</span></h1>
          <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest mt-2">Last updated: July 2026</p>
        </motion.div>

        <div className="space-y-8 text-sm leading-relaxed text-muted-foreground/80">
          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">1. Service Description</h2>
            <p>TRADE//OS provides a trading intelligence journal platform that allows users to import, track, and analyze their trading activity. The service includes CSV import, AI-powered screenshot analysis, performance analytics, and related features.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">2. Not Financial Advice</h2>
            <p className="text-[#EF4444] font-bold">TRADE//OS does NOT provide financial advice, trading recommendations, or investment guidance.</p>
            <p>The platform is purely a record-keeping and analytical tool. All trading decisions remain solely the responsibility of the user. Past performance displayed in analytics does not guarantee future results.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">3. User Responsibilities</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>Provide accurate information when creating an account</li>
              <li>Maintain the confidentiality of your account credentials</li>
              <li>Ensure imported trade data is accurate and complete</li>
              <li>Review and verify AI-extracted data before saving</li>
              <li>Use the service in compliance with all applicable laws</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">4. Data Accuracy & AI Limitations</h2>
            <p>AI-powered screenshot extraction is provided as a convenience feature and may contain errors. Users must verify all extracted fields before saving. TRADE//OS makes no guarantees about the accuracy of AI-extracted data.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">5. Subscription & Billing</h2>
            <p>The service may offer free and paid subscription tiers. Paid subscriptions auto-renew unless cancelled. Refund policies will be specified at the point of purchase. We reserve the right to change pricing with reasonable notice.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">6. Limitation of Liability</h2>
            <p>TRADE//OS is provided "as is" without warranties of any kind. To the maximum extent permitted by law, we shall not be liable for any indirect, incidental, or consequential damages arising from the use of the service.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">7. Termination</h2>
            <p>Users may terminate their account at any time. We reserve the right to suspend or terminate accounts that violate these terms or engage in abusive behavior.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-black heading-sports text-white">8. Changes to Terms</h2>
            <p>We may update these terms from time to time. Users will be notified of material changes via email or in-app notification. Continued use after changes constitutes acceptance.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
