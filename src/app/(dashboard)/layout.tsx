import { Navigation } from "@/components/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Navigation />
      <main className="ml-64 min-w-0 flex-1 transition-all duration-300">
        {children}
      </main>
    </div>
  );
}
