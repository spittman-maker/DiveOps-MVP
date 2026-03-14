import { lazy, Suspense } from "react";
import { useParams, useLocation } from "wouter";
import { ConsoleLayout } from "@/components/console-layout";
import { DashboardTab } from "@/components/tabs/dashboard";
import { DailyLogTab } from "@/components/tabs/daily-log";
import { DiveLogsTab } from "@/components/tabs/dive-logs";
import { ErrorBoundary } from "@/components/error-boundary";

// Lazy-loaded tabs (less frequently used, heavier bundles)
const DivePlanTab = lazy(() =>
  import("@/components/tabs/dive-plan").then((m) => ({ default: m.DivePlanTab }))
);
const LibraryTab = lazy(() =>
  import("@/components/tabs/library").then((m) => ({ default: m.LibraryTab }))
);
const AdminTab = lazy(() =>
  import("@/components/tabs/admin").then((m) => ({ default: m.AdminTab }))
);
const RiskRegisterTab = lazy(() =>
  import("@/components/tabs/risk-register").then((m) => ({ default: m.RiskRegisterTab }))
);
const CertificationsTab = lazy(() =>
  import("@/components/tabs/certifications").then((m) => ({ default: m.CertificationsTab }))
);
const SafetyTab = lazy(() =>
  import("@/components/tabs/safety").then((m) => ({ default: m.SafetyTab }))
);

const VALID_TABS = [
  "dashboard", "daily-log", "dive-logs", "dive-plan",
  "library", "admin", "risk-register", "certifications", "safety",
] as const;

function TabFallback() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
    </div>
  );
}

export default function ConsolePage() {
  const params = useParams<{ tab?: string }>();
  const [, setLocation] = useLocation();

  // Read tab from URL, default to dashboard
  const activeTab = params.tab && VALID_TABS.includes(params.tab as any)
    ? params.tab
    : "dashboard";

  // Update URL when tab changes
  const handleTabChange = (tab: string) => {
    setLocation(`/console/${tab}`);
  };

  const renderTab = () => {
    switch (activeTab) {
      case "dashboard":
        return <DashboardTab />;
      case "daily-log":
        return <DailyLogTab />;
      case "dive-logs":
        return <DiveLogsTab />;
      case "dive-plan":
        return <DivePlanTab />;
      case "library":
        return <LibraryTab />;
      case "admin":
        return <AdminTab />;
      case "risk-register":
        return <RiskRegisterTab />;
      case "certifications":
        return <CertificationsTab />;
      case "safety":
        return <SafetyTab />;
      default:
        return <DashboardTab />;
    }
  };

  return (
    <ConsoleLayout activeTab={activeTab} onTabChange={handleTabChange}>
      <ErrorBoundary section={activeTab}>
        <Suspense fallback={<TabFallback />}>
          {renderTab()}
        </Suspense>
      </ErrorBoundary>
    </ConsoleLayout>
  );
}
